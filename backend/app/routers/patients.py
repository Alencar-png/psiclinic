"""
Endpoints de pacientes — recurso central com PII cifrado.

GET    /patients               — lista (paginada, com filtros)
POST   /patients               — cria
GET    /patients/{id}          — detalhe (decifra PII)
PATCH  /patients/{id}          — atualiza
POST   /patients/{id}/discharge — alta clínica

Decisão importante: este router NÃO permite delete físico. LGPD exige
"direito ao apagamento", mas isso colide com obrigação de retenção do
prontuário (CFM 1.638/2002 → 20 anos). Optamos por anonimização ao final
da retenção, não delete. Ver POST /patients/{id}/anonymize (futuro).
"""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select, func
from sqlalchemy.orm import Session, selectinload

from app.middleware.deps import (
    get_current_user,
    get_db_with_tenant,
    get_request_meta,
    require_clinic_member,
)
from app.models import ClinicalSession, Doctor, Patient, PatientDoctor, User
from app.models.enums import AuditAction, PatientStatus, UserRole
from app.repositories import patient_repo
from app.schemas.common import Page
from app.schemas.patient import (
    PatientCreate,
    PatientDetail,
    PatientListItem,
    PatientUpdate,
)
from app.services import audit, crypto

router = APIRouter(prefix="/patients", tags=["patients"])


@router.get("", response_model=Page[PatientListItem])
def list_patients(
    request: Request,
    search: str | None = None,
    status: PatientStatus | None = None,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db_with_tenant),
    user: User = Depends(require_clinic_member),
):
    items, total = patient_repo.list_patients(
        db,
        user=user,
        search=search,
        status=status.value if status else None,
        page=page,
        size=size,
        doctors_see_all=user.company.doctors_see_all_patients if user.company else False,
    )

    out: list[PatientListItem] = []
    for p in items:
        dec = patient_repo.decrypt_patient(p)
        last_session_at = db.scalar(
            select(func.max(ClinicalSession.scheduled_at))
            .where(ClinicalSession.patient_id == p.id)
        )
        primary = next((d for d in p.doctors if d.is_primary), None) if p.doctors else None
        primary_name = None
        if primary:
            doctor = db.get(Doctor, primary.doctor_id)
            primary_name = doctor.full_name if doctor else None
        out.append(PatientListItem(
            id=dec.id,
            full_name=dec.full_name,
            birth_date=dec.birth_date,
            age=dec.age,
            status=PatientStatus(dec.status),
            primary_doctor_name=primary_name,
            last_session_at=last_session_at,
        ))

    audit.write_audit(
        db,
        company_id=user.company_id,
        user_id=user.id,
        action=AuditAction.READ,
        entity_type="patient_list",
        **get_request_meta(request),
        status_code=200,
    )
    return Page[PatientListItem](items=out, total=total, page=page, size=size)


@router.post("", response_model=PatientDetail, status_code=201)
def create_patient(
    body: PatientCreate,
    request: Request,
    db: Session = Depends(get_db_with_tenant),
    user: User = Depends(require_clinic_member),
):
    if user.role not in (UserRole.CLINIC_ADMIN.value, UserRole.RECEPTIONIST.value, UserRole.DOCTOR.value):
        raise HTTPException(403, "Sem permissão")

    existing = patient_repo.find_by_cpf(db, company_id=user.company_id, cpf=body.cpf)
    if existing:
        raise HTTPException(409, "Paciente com este CPF já cadastrado nesta clínica")

    patient = patient_repo.create_patient(
        db,
        company_id=user.company_id,
        payload=body.model_dump(),
        creator_user_id=user.id,
        primary_doctor_id=body.primary_doctor_id,
    )

    audit.write_audit(
        db,
        company_id=user.company_id,
        user_id=user.id,
        action=AuditAction.CREATE,
        entity_type="patient",
        entity_id=str(patient.id),
        patient_id=patient.id,
        **get_request_meta(request),
        status_code=201,
    )
    return _to_detail(patient)


@router.get("/{patient_id}", response_model=PatientDetail)
def get_patient(
    patient_id: UUID,
    request: Request,
    db: Session = Depends(get_db_with_tenant),
    user: User = Depends(require_clinic_member),
):
    p = db.get(
        Patient,
        patient_id,
        options=[selectinload(Patient.doctors), selectinload(Patient.anamnesis)],
    )
    if not p:
        raise HTTPException(404, "Paciente não encontrado")

    # Recepcionista NÃO pode ver detalhe completo
    if user.role == UserRole.RECEPTIONIST.value:
        raise HTTPException(403, "Recepção não tem acesso ao detalhe do paciente")

    audit.write_audit(
        db,
        company_id=user.company_id,
        user_id=user.id,
        action=AuditAction.READ,
        entity_type="patient",
        entity_id=str(p.id),
        patient_id=p.id,
        **get_request_meta(request),
        status_code=200,
    )
    return _to_detail(p)


@router.patch("/{patient_id}", response_model=PatientDetail)
def update_patient(
    patient_id: UUID,
    body: PatientUpdate,
    request: Request,
    db: Session = Depends(get_db_with_tenant),
    user: User = Depends(require_clinic_member),
):
    p = db.get(Patient, patient_id, options=[selectinload(Patient.doctors), selectinload(Patient.anamnesis)])
    if not p:
        raise HTTPException(404, "Paciente não encontrado")

    payload = body.model_dump(exclude_unset=True)
    changed: list[str] = []

    def _setenc(field: str, value):
        nonlocal changed
        enc = crypto.encrypt_str(value, company_id=p.company_id, aad=f"patients|{field}|{p.id}")
        if enc:
            setattr(p, f"{field}_enc", enc.ciphertext)
            setattr(p, f"{field}_iv", enc.iv)
        else:
            setattr(p, f"{field}_enc", None)
            setattr(p, f"{field}_iv", None)
        changed.append(field)

    if "full_name" in payload:
        _setenc("full_name", payload["full_name"])
    if "address" in payload:
        _setenc("address", payload["address"])
    if "phone" in payload:
        _setenc("phone", payload["phone"])
    if "email" in payload:
        _setenc("email", payload["email"])

    for plain_field in ("profession", "marital_status"):
        if plain_field in payload:
            setattr(p, plain_field, payload[plain_field])
            changed.append(plain_field)

    if "status" in payload:
        new_status = payload["status"]
        p.status = new_status.value if hasattr(new_status, "value") else new_status
        if p.status == PatientStatus.DISCHARGED.value:
            p.discharged_at = datetime.now(timezone.utc)
        changed.append("status")

    db.flush()
    audit.write_audit(
        db,
        company_id=user.company_id,
        user_id=user.id,
        action=AuditAction.UPDATE,
        entity_type="patient",
        entity_id=str(p.id),
        patient_id=p.id,
        payload_diff={f: {"changed": True} for f in changed},
        **get_request_meta(request),
        status_code=200,
    )
    return _to_detail(p)


@router.post("/{patient_id}/discharge", response_model=PatientDetail)
def discharge(
    patient_id: UUID,
    request: Request,
    db: Session = Depends(get_db_with_tenant),
    user: User = Depends(require_clinic_member),
):
    if user.role not in (UserRole.DOCTOR.value, UserRole.CLINIC_ADMIN.value):
        raise HTTPException(403, "Apenas médico ou admin pode dar alta")
    p = db.get(Patient, patient_id, options=[selectinload(Patient.doctors), selectinload(Patient.anamnesis)])
    if not p:
        raise HTTPException(404, "Paciente não encontrado")
    p.status = PatientStatus.DISCHARGED.value
    p.discharged_at = datetime.now(timezone.utc)
    db.flush()
    audit.write_audit(
        db,
        company_id=user.company_id,
        user_id=user.id,
        action="discharge",
        entity_type="patient",
        entity_id=str(p.id),
        patient_id=p.id,
        **get_request_meta(request),
        status_code=200,
    )
    return _to_detail(p)


def _to_detail(p: Patient) -> PatientDetail:
    dec = patient_repo.decrypt_patient(p)
    return PatientDetail(
        id=dec.id,
        full_name=dec.full_name,
        cpf=dec.cpf,
        birth_date=dec.birth_date,
        gender=p.gender,
        mother_name=dec.mother_name,
        father_name=dec.father_name,
        address=dec.address,
        phone=dec.phone,
        email=dec.email,
        naturalidade=dec.naturalidade,
        procedencia=dec.procedencia,
        profession=dec.profession,
        marital_status=dec.marital_status,
        religion=dec.religion,
        skin_color=dec.skin_color,
        status=PatientStatus(dec.status),
        company_id=dec.company_id,
        primary_doctor_id=dec.primary_doctor_id,
        created_at=p.created_at,
        has_anamnesis=dec.has_anamnesis,
    )
