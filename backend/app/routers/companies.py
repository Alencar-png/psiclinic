"""
GET    /companies                       — super-admin lista todas
POST   /companies                       — super-admin cria (já com primeiro admin)
GET    /companies/{id}                  — super-admin lê qualquer; clinic-admin só a sua
PATCH  /companies/{id}                  — super-admin altera; clinic-admin altera campos limitados
DELETE /companies/{id}                  — HARD delete em cascade. Apenas super-admin.
                                          Requer ?confirm=<nome-da-empresa> p/ executar.
POST   /companies/{id}/impersonate      — super-admin gera token JWT de clinic_admin
                                          daquela empresa (mantém claim impersonated_by).

OBS: A lista é alimentada por sub-queries que não passam pelo RLS porque
super-admin tem `app.user_role = 'super_admin'` (bypass via política).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.middleware.deps import (
    get_current_user,
    get_db_raw,
    get_db_with_tenant,
    get_request_meta,
    require_role,
)
from app.models import Company, User
from app.models.enums import AuditAction, CompanyStatus, UserRole
from app.repositories import company_repo
from app.schemas.auth import TokenPair
from app.schemas.common import Page
from app.schemas.company import CompanyCreate, CompanyOut, CompanyUpdate
from app.services import audit, security as sec
from app.services.audit import diff_dict

router = APIRouter(prefix="/companies", tags=["companies"])


@router.get("", response_model=Page[CompanyOut])
def list_companies(
    search: str | None = None,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db_with_tenant),
    user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
):
    items, total = company_repo.list_companies(db, search=search, page=page, size=size)
    return Page[CompanyOut](items=items, total=total, page=page, size=size)


@router.post("", response_model=CompanyOut, status_code=201)
def create_company(
    body: CompanyCreate,
    db: Session = Depends(get_db_with_tenant),
    user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
):
    if company_repo.get_company_by_cnpj(db, body.cnpj):
        raise HTTPException(409, "CNPJ já cadastrado")

    c = Company(
        name=body.name,
        trade_name=body.trade_name,
        cnpj=body.cnpj,
        email=body.email,
        phone=body.phone,
        address=body.address,
        city=body.city,
        state=body.state,
        zip_code=body.zip_code,
        technical_responsible_name=body.technical_responsible_name,
        technical_responsible_crm=body.technical_responsible_crm,
        technical_responsible_uf=body.technical_responsible_uf,
        plan_id=body.plan_id,
        status=CompanyStatus.ACTIVE.value,
    )
    db.add(c)
    db.flush()

    # Fallback do nome do admin: se não preenchido, usa a parte local do email
    # (ex: "joao.silva" para "joao.silva@clinica.com"). User.full_name é NOT NULL.
    admin_full_name = (body.admin_full_name or "").strip() or body.admin_email.split("@")[0]

    admin = User(
        company_id=c.id,
        email=body.admin_email,
        full_name=admin_full_name,
        password_hash=sec.hash_password(body.admin_password),
        role=UserRole.CLINIC_ADMIN.value,
    )
    db.add(admin)
    db.flush()

    audit.write_audit(
        db,
        company_id=c.id,
        user_id=user.id,
        action="create",
        entity_type="company",
        entity_id=str(c.id),
    )
    return c


@router.get("/{company_id}", response_model=CompanyOut)
def get_company(
    company_id: int,
    db: Session = Depends(get_db_with_tenant),
    user: User = Depends(get_current_user),
):
    if user.role != UserRole.SUPER_ADMIN.value and user.company_id != company_id:
        raise HTTPException(404, "Não encontrada")
    c = company_repo.get_company(db, company_id)
    if not c:
        raise HTTPException(404, "Não encontrada")
    return c


@router.patch("/{company_id}", response_model=CompanyOut)
def update_company(
    company_id: int,
    body: CompanyUpdate,
    db: Session = Depends(get_db_with_tenant),
    user: User = Depends(get_current_user),
):
    is_super = user.role == UserRole.SUPER_ADMIN.value
    is_admin_self = (
        user.role == UserRole.CLINIC_ADMIN.value and user.company_id == company_id
    )
    if not (is_super or is_admin_self):
        raise HTTPException(403, "Sem permissão")

    c = company_repo.get_company(db, company_id)
    if not c:
        raise HTTPException(404, "Não encontrada")

    before = {col.name: getattr(c, col.name) for col in c.__table__.columns}

    payload = body.model_dump(exclude_unset=True)
    # Clinic-admin só pode alterar alguns campos
    if not is_super:
        allowed = {"phone", "address", "city", "state", "zip_code", "doctors_see_all_patients"}
        forbidden = set(payload) - allowed
        if forbidden:
            raise HTTPException(403, f"Campos não permitidos: {forbidden}")

    for k, v in payload.items():
        setattr(c, k, v.value if hasattr(v, "value") else v)

    db.flush()
    after = {col.name: getattr(c, col.name) for col in c.__table__.columns}
    audit.write_audit(
        db,
        company_id=c.id,
        user_id=user.id,
        action="update",
        entity_type="company",
        entity_id=str(c.id),
        payload_diff=diff_dict(before, after),
    )
    return c


# ─────────────────────────────────────────────────────────────────────────
# DELETE — hard, irreversível, exige confirmação textual.
# ─────────────────────────────────────────────────────────────────────────
@router.delete("/{company_id}", status_code=204)
def delete_company(
    company_id: int,
    request: Request,
    confirm: str = Query(..., description="Nome exato da empresa para confirmar exclusão"),
    db: Session = Depends(get_db_with_tenant),
    user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
):
    """Apaga a empresa e tudo dependente em cascade.

    Cascade na FK (`companies.id ON DELETE CASCADE` na maioria) cuida de:
    users, doctors, doctor_clinics, patients, patient_doctors, patient_consents,
    sessions, anamneses, anamnesis_versions/_attachments, prescriptions,
    prescription_templates, refresh_tokens.

    Já `audit_logs.company_id` é `ON DELETE SET NULL` — registros históricos
    sobrevivem (compliance), mas perdem o link com a empresa apagada.
    """
    c = company_repo.get_company(db, company_id)
    if not c:
        raise HTTPException(404, "Empresa não encontrada")

    # Confirmação textual — defesa contra clique acidental e CSRF.
    if confirm.strip() != c.name.strip():
        raise HTTPException(
            400,
            "Confirmação não confere com o nome da empresa",
        )

    # Audit antes do delete — depois `company_id` vira NULL.
    meta = get_request_meta(request)
    audit.write_audit(
        db,
        company_id=c.id,
        user_id=user.id,
        action="delete",
        entity_type="company",
        entity_id=str(c.id),
        payload_diff={
            "name": {"deleted": c.name},
            "cnpj": {"deleted": c.cnpj},
        },
        **meta,
        status_code=204,
    )
    # Força commit do audit antes de apagar (audit não pode sumir junto)
    db.flush()

    # Bypass do ORM cascade — usar SQL direto e deixar a FK on-delete-cascade
    # do banco fazer o trabalho de uma só vez. Mais rápido e mais seguro.
    db.execute(text("DELETE FROM companies WHERE id = :id"), {"id": c.id})
    return None


# ─────────────────────────────────────────────────────────────────────────
# IMPERSONATE — super_admin acessa como clinic_admin daquela empresa.
# ─────────────────────────────────────────────────────────────────────────
@router.post("/{company_id}/impersonate", response_model=TokenPair)
def impersonate_company_admin(
    company_id: int,
    request: Request,
    db: Session = Depends(get_db_with_tenant),
    user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
):
    """Gera um JWT de clinic_admin da empresa, mantendo claim `impersonated_by`.

    Não emite refresh_token: a sessão impersonada é curta e não rotaciona.
    Quando o access expira, o front volta sozinho ao token original.
    """
    c = company_repo.get_company(db, company_id)
    if not c:
        raise HTTPException(404, "Empresa não encontrada")

    # Pega o primeiro clinic_admin ativo. Se não tiver nenhum, não dá pra impersonar.
    target = db.scalar(
        select(User)
        .where(
            User.company_id == c.id,
            User.role == UserRole.CLINIC_ADMIN.value,
            User.is_active.is_(True),
        )
        .order_by(User.id.asc())
    )
    if not target:
        raise HTTPException(409, "Empresa não tem administrador ativo para impersonar")

    # Gera access_token "como" o admin daquela empresa, mas com claim extra.
    from datetime import datetime, timedelta, timezone
    import jwt

    s = sec.get_settings()
    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=s.access_token_minutes)
    payload = {
        "sub": str(target.id),
        "role": target.role,
        "tenant": target.company_id,
        "doctor_id": None,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
        "iss": s.app_name,
        "type": "access",
        # Claim de auditoria — middleware de log inclui no audit_log automaticamente
        # se quiser estender. Por ora usamos só pra exibir o banner no front.
        "impersonated_by": user.id,
        "impersonator_email": user.email,
    }
    access = jwt.encode(payload, s.jwt_secret, algorithm=s.jwt_alg)

    meta = get_request_meta(request)
    audit.write_audit(
        db,
        company_id=c.id,
        user_id=user.id,
        action="impersonate",
        entity_type="company",
        entity_id=str(c.id),
        payload_diff={"target_user_id": target.id, "target_email": target.email},
        **meta,
        status_code=200,
    )

    # Refresh vazio — front nunca chama /auth/refresh com este token.
    return TokenPair(access_token=access, refresh_token="", expires_at=exp)
