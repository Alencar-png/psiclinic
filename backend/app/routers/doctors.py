"""
GET    /doctors           — admin/medico listam médicos da clínica
POST   /doctors           — clinic-admin cadastra (cria User + Doctor + DoctorClinic)
GET    /doctors/{id}
PATCH  /doctors/{id}
DELETE /doctors/{id}      — soft delete (is_active=False)
"""
from __future__ import annotations

import secrets

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.orm import Session, selectinload

from app.middleware.deps import (
    get_current_user,
    get_db_with_tenant,
    require_clinic_member,
    require_role,
)
from app.models import Doctor, DoctorClinic, User, Plan
from app.models.enums import UserRole
from app.schemas.common import Page
from app.schemas.doctor import DoctorCreate, DoctorOut, DoctorUpdate
from app.services import audit, crypto, security as sec

router = APIRouter(prefix="/doctors", tags=["doctors"])


@router.get("", response_model=Page[DoctorOut])
def list_doctors(
    search: str | None = None,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db_with_tenant),
    user: User = Depends(require_clinic_member),
):
    base = (
        select(Doctor, User.email)
        .join(User, User.id == Doctor.user_id)
        .join(DoctorClinic, DoctorClinic.doctor_id == Doctor.id)
        .where(DoctorClinic.company_id == user.company_id, DoctorClinic.active.is_(True))
    )
    count_q = (
        select(func.count(Doctor.id))
        .join(DoctorClinic, DoctorClinic.doctor_id == Doctor.id)
        .where(DoctorClinic.company_id == user.company_id, DoctorClinic.active.is_(True))
    )
    if search:
        ilike = f"%{search}%"
        base = base.where(Doctor.full_name.ilike(ilike) | Doctor.crm.ilike(ilike))
        count_q = count_q.where(Doctor.full_name.ilike(ilike) | Doctor.crm.ilike(ilike))

    rows = db.execute(
        base.order_by(Doctor.full_name).limit(size).offset((page - 1) * size)
    ).all()
    items = [
        DoctorOut(
            id=d.id,
            full_name=d.full_name,
            professional_type=d.professional_type,
            crm=d.crm,
            crm_uf=d.crm_uf,
            specialty=d.specialty,
            email=email,
            phone=d.phone,
            photo_url=d.photo_url,
            is_active=d.is_active,
            created_at=d.created_at,
        )
        for d, email in rows
    ]
    total = db.scalar(count_q) or 0
    return Page[DoctorOut](items=items, total=total, page=page, size=size)


@router.post("", response_model=DoctorOut, status_code=201)
def create_doctor(
    body: DoctorCreate,
    db: Session = Depends(get_db_with_tenant),
    user: User = Depends(require_role(UserRole.CLINIC_ADMIN)),
):
    # Limite do plano
    plan = db.scalar(
        select(Plan).join(
            DoctorClinic.__table__,  # noqa: not used — apenas para garantir join no count abaixo
            isouter=True
        ).where(Plan.id == user.company.plan_id)
    ) if user.company and user.company.plan_id else None
    if plan:
        existing = db.scalar(
            select(func.count(DoctorClinic.doctor_id)).where(
                DoctorClinic.company_id == user.company_id,
                DoctorClinic.active.is_(True),
            )
        ) or 0
        if existing >= plan.max_doctors:
            raise HTTPException(403, f"Limite do plano atingido ({plan.max_doctors} médicos)")

    # Reuso: se já existe Doctor com esse CRM/UF, apenas cria DoctorClinic
    cpf_hash = crypto.hmac_cpf(body.cpf)
    existing_doc = db.scalar(
        select(Doctor).where(Doctor.crm == body.crm, Doctor.crm_uf == body.crm_uf)
    )
    if existing_doc:
        link = db.scalar(
            select(DoctorClinic).where(
                DoctorClinic.doctor_id == existing_doc.id,
                DoctorClinic.company_id == user.company_id,
            )
        )
        if link:
            if link.active:
                raise HTTPException(409, "Médico já vinculado a esta clínica")
            link.active = True
        else:
            db.add(DoctorClinic(doctor_id=existing_doc.id, company_id=user.company_id))
        db.flush()
        return _to_out(db, existing_doc)

    # Cria User + Doctor + Vínculo
    initial_password = body.password or secrets.token_urlsafe(16)
    user_row = User(
        company_id=user.company_id,
        email=body.email,
        full_name=body.full_name,
        password_hash=sec.hash_password(initial_password),
        role=UserRole.DOCTOR.value,
    )
    db.add(user_row)
    db.flush()

    doctor = Doctor(
        user_id=user_row.id,
        cpf=cpf_hash,
        full_name=body.full_name,
        professional_type=body.professional_type.value,
        crm=body.crm,
        crm_uf=body.crm_uf,
        specialty=body.specialty,
        rqe=body.rqe,
        phone=body.phone,
    )
    db.add(doctor)
    db.flush()

    db.add(DoctorClinic(doctor_id=doctor.id, company_id=user.company_id))
    db.flush()

    audit.write_audit(
        db,
        company_id=user.company_id,
        user_id=user.id,
        action="create",
        entity_type="doctor",
        entity_id=str(doctor.id),
    )
    return _to_out(db, doctor)


@router.get("/{doctor_id}", response_model=DoctorOut)
def get_doctor(
    doctor_id: int,
    db: Session = Depends(get_db_with_tenant),
    user: User = Depends(require_clinic_member),
):
    d = db.get(Doctor, doctor_id, options=[selectinload(Doctor.user)])
    if not d:
        raise HTTPException(404, "Médico não encontrado")
    return _to_out(db, d)


@router.patch("/{doctor_id}", response_model=DoctorOut)
def update_doctor(
    doctor_id: int,
    body: DoctorUpdate,
    db: Session = Depends(get_db_with_tenant),
    user: User = Depends(require_role(UserRole.CLINIC_ADMIN)),
):
    d = db.get(Doctor, doctor_id)
    if not d:
        raise HTTPException(404, "Médico não encontrado")
    payload = body.model_dump(exclude_unset=True)
    for k, v in payload.items():
        setattr(d, k, v)
    db.flush()
    audit.write_audit(
        db,
        company_id=user.company_id,
        user_id=user.id,
        action="update",
        entity_type="doctor",
        entity_id=str(d.id),
        payload_diff={k: {"new": v} for k, v in payload.items()},
    )
    return _to_out(db, d)


@router.delete("/{doctor_id}", status_code=204)
def deactivate_doctor(
    doctor_id: int,
    db: Session = Depends(get_db_with_tenant),
    user: User = Depends(require_role(UserRole.CLINIC_ADMIN)),
):
    """Soft-delete: desativa médico e o vínculo com a clínica."""
    d = db.get(Doctor, doctor_id)
    if not d:
        raise HTTPException(404, "Médico não encontrado")
    d.is_active = False

    link = db.scalar(
        select(DoctorClinic).where(
            DoctorClinic.doctor_id == d.id,
            DoctorClinic.company_id == user.company_id,
        )
    )
    if link:
        link.active = False
        from datetime import datetime, timezone
        link.left_at = datetime.now(timezone.utc)

    audit.write_audit(
        db,
        company_id=user.company_id,
        user_id=user.id,
        action="delete",
        entity_type="doctor",
        entity_id=str(d.id),
    )
    return None


def _to_out(db: Session, d: Doctor) -> DoctorOut:
    user = db.get(User, d.user_id)
    return DoctorOut(
        id=d.id,
        full_name=d.full_name,
        professional_type=d.professional_type,
        crm=d.crm,
        crm_uf=d.crm_uf,
        specialty=d.specialty,
        email=user.email if user else "",
        phone=d.phone,
        photo_url=d.photo_url,
        is_active=d.is_active,
        created_at=d.created_at,
    )
