"""
GET    /companies            — super-admin lista todas
POST   /companies            — super-admin cria (já com primeiro admin)
GET    /companies/{id}       — super-admin lê qualquer; clinic-admin só a sua
PATCH  /companies/{id}       — super-admin altera; clinic-admin altera campos limitados
DELETE /companies/{id}       — soft delete (status=cancelled). Apenas super-admin.

OBS: A lista é alimentada por sub-queries que não passam pelo RLS porque
super-admin tem `app.user_role = 'super_admin'` (bypass via política).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.middleware.deps import (
    get_current_user,
    get_db_with_tenant,
    require_role,
)
from app.models import Company, User
from app.models.enums import CompanyStatus, UserRole
from app.repositories import company_repo
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

    admin = User(
        company_id=c.id,
        email=body.admin_email,
        full_name=body.admin_full_name,
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
