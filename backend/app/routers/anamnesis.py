"""
GET    /patients/{pid}/anamnesis           — versão corrente (decifrada)
PUT    /patients/{pid}/anamnesis           — cria nova versão (sempre)
GET    /patients/{pid}/anamnesis/versions  — histórico de versões
GET    /patients/{pid}/anamnesis/versions/{vid} — payload decifrado de uma versão
POST   /patients/{pid}/anamnesis/lock      — bloqueia (clinic-admin/médico responsável)

Recepção e clinic-admin NÃO veem conteúdo clínico (sigilo médico). Apenas
médicos e super-admin (auditoria — futuro).
"""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, Request
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.middleware.deps import (
    get_current_user,
    get_db_with_tenant,
    get_request_meta,
)
from app.models import Anamnesis, AnamnesisVersion, Patient, User
from app.models.enums import AuditAction, UserRole
from app.repositories import anamnesis_repo
from app.schemas.anamnesis import (
    AnamnesisOut,
    AnamnesisPayload,
    AnamnesisVersionOut,
)
from app.services import audit

router = APIRouter(prefix="/patients/{patient_id}/anamnesis", tags=["anamnesis"])


def _ensure_clinical_role(user: User) -> None:
    if user.role not in (UserRole.DOCTOR.value, UserRole.SUPER_ADMIN.value):
        raise HTTPException(403, "Apenas médicos podem acessar conteúdo da anamnese")


@router.get("", response_model=AnamnesisOut)
def get_current(
    patient_id: UUID,
    request: Request,
    db: Session = Depends(get_db_with_tenant),
    user: User = Depends(get_current_user),
):
    _ensure_clinical_role(user)
    patient = db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(404, "Paciente não encontrado")

    a = db.scalar(
        select(Anamnesis)
        .where(Anamnesis.patient_id == patient_id)
        .options(selectinload(Anamnesis.current_version), selectinload(Anamnesis.versions))
    )
    if not a:
        raise HTTPException(404, "Anamnese ainda não criada")

    payload = anamnesis_repo.decrypt_version(a.current_version) if a.current_version else None
    audit.write_audit(
        db,
        company_id=user.company_id,
        user_id=user.id,
        action=AuditAction.READ,
        entity_type="anamnesis",
        entity_id=str(a.id),
        patient_id=patient_id,
        **get_request_meta(request),
        status_code=200,
    )
    return AnamnesisOut(
        id=a.id,
        patient_id=str(patient_id),
        current_version=AnamnesisVersionOut.model_validate(a.current_version) if a.current_version else None,
        locked_at=a.locked_at,
        created_at=a.created_at,
        versions_count=len(a.versions),
        payload=AnamnesisPayload(**payload) if payload else None,
    )


@router.put("", response_model=AnamnesisOut, status_code=201)
def create_or_update(
    patient_id: UUID,
    body: AnamnesisPayload,
    request: Request,
    db: Session = Depends(get_db_with_tenant),
    user: User = Depends(get_current_user),
):
    _ensure_clinical_role(user)
    patient = db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(404, "Paciente não encontrado")

    header = anamnesis_repo.get_or_create_header(
        db, patient_id=patient_id, company_id=patient.company_id, created_by=user.id
    )
    if header.locked_at:
        raise HTTPException(409, "Anamnese bloqueada para edição")

    try:
        version = anamnesis_repo.create_version(
            db,
            header=header,
            payload=body.model_dump(),
            created_by=user.id,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))

    audit.write_audit(
        db,
        company_id=patient.company_id,
        user_id=user.id,
        action=AuditAction.UPDATE if version.version_number > 1 else AuditAction.CREATE,
        entity_type="anamnesis_version",
        entity_id=str(version.id),
        patient_id=patient_id,
        payload_diff={"version_number": {"new": version.version_number}},
        **get_request_meta(request),
        status_code=201,
    )

    return AnamnesisOut(
        id=header.id,
        patient_id=str(patient_id),
        current_version=AnamnesisVersionOut.model_validate(version),
        locked_at=header.locked_at,
        created_at=header.created_at,
        versions_count=version.version_number,
        payload=body,
    )


@router.get("/versions", response_model=list[AnamnesisVersionOut])
def list_versions(
    patient_id: UUID,
    db: Session = Depends(get_db_with_tenant),
    user: User = Depends(get_current_user),
):
    _ensure_clinical_role(user)
    a = db.scalar(
        select(Anamnesis)
        .where(Anamnesis.patient_id == patient_id)
        .options(selectinload(Anamnesis.versions))
    )
    if not a:
        raise HTTPException(404, "Anamnese inexistente")
    return [
        AnamnesisVersionOut.model_validate(v)
        for v in sorted(a.versions, key=lambda v: -v.version_number)
    ]


@router.get("/versions/{version_id}", response_model=AnamnesisPayload)
def get_version_payload(
    patient_id: UUID,
    version_id: int,
    request: Request,
    db: Session = Depends(get_db_with_tenant),
    user: User = Depends(get_current_user),
):
    _ensure_clinical_role(user)
    v = db.get(AnamnesisVersion, version_id)
    if not v or v.anamnesis.patient_id != patient_id:
        raise HTTPException(404, "Versão não encontrada")
    audit.write_audit(
        db,
        company_id=user.company_id,
        user_id=user.id,
        action=AuditAction.READ,
        entity_type="anamnesis_version",
        entity_id=str(version_id),
        patient_id=patient_id,
        **get_request_meta(request),
        status_code=200,
    )
    return AnamnesisPayload(**anamnesis_repo.decrypt_version(v))


@router.post("/lock", response_model=AnamnesisOut)
def lock_anamnesis(
    patient_id: UUID,
    db: Session = Depends(get_db_with_tenant),
    user: User = Depends(get_current_user),
):
    _ensure_clinical_role(user)
    a = db.scalar(
        select(Anamnesis)
        .where(Anamnesis.patient_id == patient_id)
        .options(selectinload(Anamnesis.current_version), selectinload(Anamnesis.versions))
    )
    if not a:
        raise HTTPException(404, "Anamnese inexistente")
    if a.locked_at:
        raise HTTPException(400, "Já bloqueada")
    a.locked_at = datetime.now(timezone.utc)
    db.flush()
    return AnamnesisOut(
        id=a.id,
        patient_id=str(patient_id),
        current_version=AnamnesisVersionOut.model_validate(a.current_version) if a.current_version else None,
        locked_at=a.locked_at,
        created_at=a.created_at,
        versions_count=len(a.versions),
        payload=None,
    )
