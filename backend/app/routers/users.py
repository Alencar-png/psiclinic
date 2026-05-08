"""
GET    /users           — lista usuários (super: todos; clinic_admin: própria empresa)
POST   /users           — cria usuário administrativo (NÃO doctor — usar /doctors p/ isso)
GET    /users/{id}
PATCH  /users/{id}      — alterar nome, role (limitado), status, transferir empresa
DELETE /users/{id}      — soft-delete (is_active=False) — não apaga registros históricos

Regras de RBAC:
  - super_admin: vê todos, cria qualquer role (inclusive outro super_admin),
    pode mover usuário entre empresas.
  - clinic_admin: vê só users da própria empresa, cria apenas
    `clinic_admin` e `receptionist` na própria empresa, não promove a super_admin.
  - doctor / receptionist / outros: 403.

Doctor profile:
  Tela /users *lista* doctors (com badge), mas o endpoint não cria doctor.
  Para criar um doctor/psychologist com CRM/CPF, use POST /doctors.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.middleware.deps import (
    get_current_user,
    get_db_with_tenant,
    get_request_meta,
    require_role,
)
from app.models import Company, Doctor, User
from app.models.enums import UserRole
from app.schemas.common import Page
from app.schemas.user import (
    ADMINISTRATIVE_ROLES,
    UserCreate,
    UserOut,
    UserUpdate,
)
from app.services import audit, security as sec
from app.services.audit import diff_dict

router = APIRouter(prefix="/users", tags=["users"])


# ─────────────────────────────────────────────────────────────────────────
# Helpers de RBAC
# ─────────────────────────────────────────────────────────────────────────
def _is_super(u: User) -> bool:
    return u.role == UserRole.SUPER_ADMIN.value


def _is_clinic_admin(u: User) -> bool:
    return u.role == UserRole.CLINIC_ADMIN.value


def _require_admin(user: User) -> None:
    """Permite super_admin ou clinic_admin. 403 caso contrário."""
    if not (_is_super(user) or _is_clinic_admin(user)):
        raise HTTPException(403, "Apenas super_admin e clinic_admin acessam usuários")


def _validate_create(actor: User, body: UserCreate) -> None:
    """Valida se `actor` pode criar um usuário com o role/tenant pedidos."""
    target_role = body.role.value if hasattr(body.role, "value") else str(body.role)

    if _is_super(actor):
        # Super_admin pode criar qualquer coisa, mas company_id é obrigatório
        # para roles que não sejam super_admin.
        if target_role != UserRole.SUPER_ADMIN.value and not body.company_id:
            raise HTTPException(
                422, "company_id é obrigatório para usuários vinculados a uma clínica"
            )
        return

    if _is_clinic_admin(actor):
        # Limitado: só pode criar clinic_admin / receptionist na própria empresa
        allowed = {UserRole.CLINIC_ADMIN.value, UserRole.RECEPTIONIST.value}
        if target_role not in allowed:
            raise HTTPException(
                403,
                f"clinic_admin só pode criar usuários com role: {', '.join(allowed)}",
            )
        if target_role == UserRole.DOCTOR.value:
            raise HTTPException(
                422,
                "Médicos/psicólogos devem ser criados em /doctors (com CRM/CPF)",
            )
        if body.company_id and body.company_id != actor.company_id:
            raise HTTPException(403, "Não é possível criar usuário em outra empresa")
        # Força tenant
        body.company_id = actor.company_id
        return

    raise HTTPException(403, "Sem permissão para criar usuários")


def _validate_update(actor: User, target: User, payload: dict) -> None:
    """Valida se `actor` pode aplicar `payload` em `target`."""
    if target.id == actor.id:
        # Ninguém pode rebaixar a si mesmo nem se desativar — proteção contra lock-out.
        if "role" in payload and payload["role"] != actor.role:
            raise HTTPException(409, "Você não pode alterar seu próprio role")
        if payload.get("is_active") is False:
            raise HTTPException(409, "Você não pode desativar a si mesmo")

    if _is_super(actor):
        return  # super pode tudo

    if _is_clinic_admin(actor):
        if target.role == UserRole.SUPER_ADMIN.value:
            raise HTTPException(403, "clinic_admin não opera sobre super_admin")
        if target.company_id != actor.company_id:
            raise HTTPException(403, "Usuário pertence a outra clínica")
        # Não pode promover ninguém a super_admin
        if payload.get("role") == UserRole.SUPER_ADMIN.value:
            raise HTTPException(403, "Apenas super_admin pode criar super_admin")
        # Não pode mover user para outra empresa
        if "company_id" in payload and payload["company_id"] != actor.company_id:
            raise HTTPException(403, "Você não pode transferir usuários entre clínicas")
        # Doctors/psychologists têm profile clínico — clinic_admin não altera
        # role deles via /users (poderia quebrar o vínculo Doctor↔User).
        if target.role == UserRole.DOCTOR.value and "role" in payload:
            raise HTTPException(
                409,
                "Para alterar perfil de médico/psicólogo, use a tela de profissionais",
            )
        return

    raise HTTPException(403, "Sem permissão")


def _to_out(db: Session, u: User) -> UserOut:
    company_name = None
    if u.company_id:
        c = db.get(Company, u.company_id)
        company_name = c.name if c else None
    doc = db.scalar(select(Doctor).where(Doctor.user_id == u.id))
    return UserOut(
        id=u.id,
        full_name=u.full_name,
        email=u.email,
        role=u.role,
        company_id=u.company_id,
        company_name=company_name,
        is_active=u.is_active,
        last_login_at=u.last_login_at,
        has_doctor_profile=doc is not None,
        doctor_id=doc.id if doc else None,
        created_at=u.created_at,
    )


# ─────────────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────────────
@router.get("", response_model=Page[UserOut])
def list_users(
    search: str | None = None,
    role: UserRole | None = None,
    company_id: int | None = None,
    is_active: bool | None = None,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db_with_tenant),
    actor: User = Depends(get_current_user),
):
    _require_admin(actor)

    base = select(User)
    count_q = select(func.count(User.id))

    # Escopo por permissão
    if _is_clinic_admin(actor):
        base = base.where(User.company_id == actor.company_id)
        count_q = count_q.where(User.company_id == actor.company_id)
    elif _is_super(actor) and company_id is not None:
        # super_admin pode filtrar por empresa
        base = base.where(User.company_id == company_id)
        count_q = count_q.where(User.company_id == company_id)

    if role is not None:
        base = base.where(User.role == role.value)
        count_q = count_q.where(User.role == role.value)

    if is_active is not None:
        base = base.where(User.is_active.is_(is_active))
        count_q = count_q.where(User.is_active.is_(is_active))

    if search:
        ilike = f"%{search}%"
        base = base.where(User.full_name.ilike(ilike) | User.email.ilike(ilike))
        count_q = count_q.where(User.full_name.ilike(ilike) | User.email.ilike(ilike))

    rows = db.scalars(
        base.order_by(User.full_name).limit(size).offset((page - 1) * size)
    ).all()
    total = db.scalar(count_q) or 0
    return Page[UserOut](
        items=[_to_out(db, u) for u in rows],
        total=total, page=page, size=size,
    )


@router.post("", response_model=UserOut, status_code=201)
def create_user(
    body: UserCreate,
    request: Request,
    db: Session = Depends(get_db_with_tenant),
    actor: User = Depends(get_current_user),
):
    _require_admin(actor)
    _validate_create(actor, body)

    # Email único
    existing = db.scalar(select(User).where(User.email == body.email))
    if existing:
        raise HTTPException(409, "E-mail já cadastrado")

    target_role = body.role.value if hasattr(body.role, "value") else str(body.role)

    # Bloqueia criação de doctor por aqui (precisa profile)
    if target_role == UserRole.DOCTOR.value:
        raise HTTPException(
            422,
            "Use POST /doctors para criar médico/psicólogo (precisa de CRM/CPF)",
        )

    u = User(
        email=body.email.strip(),
        full_name=body.full_name,
        password_hash=sec.hash_password(body.password),
        role=target_role,
        company_id=body.company_id,
    )
    db.add(u)
    db.flush()

    meta = get_request_meta(request)
    audit.write_audit(
        db,
        company_id=u.company_id,
        user_id=actor.id,
        action="create",
        entity_type="user",
        entity_id=str(u.id),
        payload_diff={"email": body.email, "role": target_role},
        **meta,
        status_code=201,
    )
    return _to_out(db, u)


@router.get("/{user_id}", response_model=UserOut)
def get_user(
    user_id: int,
    db: Session = Depends(get_db_with_tenant),
    actor: User = Depends(get_current_user),
):
    _require_admin(actor)
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404, "Usuário não encontrado")
    if _is_clinic_admin(actor) and u.company_id != actor.company_id:
        raise HTTPException(404, "Usuário não encontrado")
    return _to_out(db, u)


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    body: UserUpdate,
    request: Request,
    db: Session = Depends(get_db_with_tenant),
    actor: User = Depends(get_current_user),
):
    _require_admin(actor)
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404, "Usuário não encontrado")
    if _is_clinic_admin(actor) and u.company_id != actor.company_id:
        raise HTTPException(404, "Usuário não encontrado")

    payload = body.model_dump(exclude_unset=True)
    # Normaliza role: enum → str
    if "role" in payload and hasattr(payload["role"], "value"):
        payload["role"] = payload["role"].value

    _validate_update(actor, u, payload)

    before = {
        "full_name": u.full_name,
        "email": u.email,
        "role": u.role,
        "company_id": u.company_id,
        "is_active": u.is_active,
    }

    # Aplica campos
    if "full_name" in payload:
        u.full_name = payload["full_name"]
    if "role" in payload:
        u.role = payload["role"]
    if "is_active" in payload:
        u.is_active = payload["is_active"]
    if "company_id" in payload:
        u.company_id = payload["company_id"]
    if "password" in payload and payload["password"]:
        u.password_hash = sec.hash_password(payload["password"])

    db.flush()

    after = {
        "full_name": u.full_name,
        "email": u.email,
        "role": u.role,
        "company_id": u.company_id,
        "is_active": u.is_active,
    }

    meta = get_request_meta(request)
    audit.write_audit(
        db,
        company_id=u.company_id,
        user_id=actor.id,
        action="update",
        entity_type="user",
        entity_id=str(u.id),
        payload_diff=diff_dict(before, after) | (
            {"password": {"changed": True}} if "password" in payload and payload["password"] else {}
        ),
        **meta,
        status_code=200,
    )
    return _to_out(db, u)


@router.delete("/{user_id}", status_code=204)
def deactivate_user(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db_with_tenant),
    actor: User = Depends(get_current_user),
):
    """Soft-delete: marca is_active=False. Audit logs/históricos preservados."""
    _require_admin(actor)
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404, "Usuário não encontrado")
    if u.id == actor.id:
        raise HTTPException(409, "Você não pode desativar a si mesmo")
    if _is_clinic_admin(actor):
        if u.company_id != actor.company_id:
            raise HTTPException(404, "Usuário não encontrado")
        if u.role == UserRole.SUPER_ADMIN.value:
            raise HTTPException(403, "clinic_admin não desativa super_admin")

    u.is_active = False
    db.flush()

    meta = get_request_meta(request)
    audit.write_audit(
        db,
        company_id=u.company_id,
        user_id=actor.id,
        action="delete",
        entity_type="user",
        entity_id=str(u.id),
        payload_diff={"is_active": {"old": True, "new": False}},
        **meta,
        status_code=204,
    )
    return None
