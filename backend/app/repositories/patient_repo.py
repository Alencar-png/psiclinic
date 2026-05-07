"""
Repositório de Pacientes.

A RLS já filtra por tenant. Métodos aqui adicionam:
  - Decifragem on-demand (encrypt → repo retorna struct dataclass com claros)
  - Filtros de role: médico vê só os seus (a menos que clinic.doctors_see_all_patients)
  - Cálculo de idade
  - Busca por CPF via hash determinístico
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Iterable
from uuid import UUID

from sqlalchemy import or_, select, func
from sqlalchemy.orm import Session, selectinload

from app.models import Patient, PatientDoctor, Doctor, User, ClinicalSession
from app.models.enums import PatientStatus, UserRole
from app.services import crypto


@dataclass
class DecryptedPatient:
    id: UUID
    company_id: int
    full_name: str
    cpf: str
    birth_date: date
    age: int
    status: str
    mother_name: str | None
    father_name: str | None
    address: str | None
    phone: str | None
    email: str | None
    naturalidade: str | None
    procedencia: str | None
    profession: str | None
    marital_status: str | None
    religion: str | None
    skin_color: str | None
    primary_doctor_id: int | None
    has_anamnesis: bool


def _aad(field: str, patient_id: UUID | None = None) -> str:
    """
    AAD do AES-GCM. Não usamos row_id porque cifragem acontece ANTES do
    INSERT (UUID ainda não existe). Defesa em profundidade já é mantida por:
      - chave derivada por tenant (HKDF)
      - IV aleatório de 96 bits por linha
    Para amarrar com o row_id, seria preciso flush + UPDATE — fica para v2.
    """
    return f"patients|{field}"


def create_patient(
    db: Session,
    *,
    company_id: int,
    payload: dict,
    creator_user_id: int,
    primary_doctor_id: int | None = None,
) -> Patient:
    cpf = payload["cpf"]
    cpf_hash = crypto.hmac_cpf(cpf)

    # Cifragens (chave por tenant)
    enc_full = crypto.encrypt_str(payload["full_name"], company_id=company_id, aad=_aad("full_name", None))
    enc_cpf = crypto.encrypt_str(cpf, company_id=company_id, aad=_aad("cpf", None))
    enc_mother = crypto.encrypt_str(payload.get("mother_name"), company_id=company_id, aad=_aad("mother_name", None))
    enc_father = crypto.encrypt_str(payload.get("father_name"), company_id=company_id, aad=_aad("father_name", None))
    enc_address = crypto.encrypt_str(payload.get("address"), company_id=company_id, aad=_aad("address", None))
    enc_phone = crypto.encrypt_str(payload.get("phone"), company_id=company_id, aad=_aad("phone", None))
    enc_email = crypto.encrypt_str(payload.get("email"), company_id=company_id, aad=_aad("email", None))

    patient = Patient(
        company_id=company_id,
        full_name_enc=enc_full.ciphertext, full_name_iv=enc_full.iv,
        cpf_hash=cpf_hash, cpf_enc=enc_cpf.ciphertext, cpf_iv=enc_cpf.iv,
        mother_name_enc=enc_mother.ciphertext if enc_mother else None,
        mother_name_iv=enc_mother.iv if enc_mother else None,
        father_name_enc=enc_father.ciphertext if enc_father else None,
        father_name_iv=enc_father.iv if enc_father else None,
        address_enc=enc_address.ciphertext if enc_address else None,
        address_iv=enc_address.iv if enc_address else None,
        phone_enc=enc_phone.ciphertext if enc_phone else None,
        phone_iv=enc_phone.iv if enc_phone else None,
        email_enc=enc_email.ciphertext if enc_email else None,
        email_iv=enc_email.iv if enc_email else None,
        birth_date=payload["birth_date"],
        gender=payload.get("gender"),
        naturalidade=payload.get("naturalidade"),
        procedencia=payload.get("procedencia"),
        profession=payload.get("profession"),
        marital_status=payload.get("marital_status"),
        religion=payload.get("religion"),
        skin_color=payload.get("skin_color"),
        status=PatientStatus.ACTIVE.value,
    )
    db.add(patient)
    db.flush()  # gera id

    if primary_doctor_id is not None:
        db.add(PatientDoctor(
            patient_id=patient.id,
            doctor_id=primary_doctor_id,
            is_primary=True,
        ))

    return patient


def find_by_cpf(db: Session, *, company_id: int, cpf: str) -> Patient | None:
    cpf_hash = crypto.hmac_cpf(cpf)
    stmt = select(Patient).where(
        Patient.company_id == company_id,
        Patient.cpf_hash == cpf_hash,
    )
    return db.scalar(stmt)


def list_patients(
    db: Session,
    *,
    user: User,
    search: str | None = None,
    status: str | None = None,
    page: int = 1,
    size: int = 20,
    doctors_see_all: bool = False,
) -> tuple[list[Patient], int]:
    """Lista paginada. Médico vê só seus pacientes (a não ser que doctors_see_all=True)."""
    base = select(Patient)
    count_q = select(func.count(Patient.id))

    if user.role == UserRole.DOCTOR.value and not doctors_see_all and user.doctor:
        base = base.join(
            PatientDoctor, PatientDoctor.patient_id == Patient.id
        ).where(PatientDoctor.doctor_id == user.doctor.id)
        count_q = count_q.join(
            PatientDoctor, PatientDoctor.patient_id == Patient.id
        ).where(PatientDoctor.doctor_id == user.doctor.id)

    if status:
        base = base.where(Patient.status == status)
        count_q = count_q.where(Patient.status == status)

    if search:
        digits = "".join(c for c in search if c.isdigit())
        if len(digits) == 11:
            # CPF exato via hash
            base = base.where(Patient.cpf_hash == crypto.hmac_cpf(digits))
            count_q = count_q.where(Patient.cpf_hash == crypto.hmac_cpf(digits))
            total = db.scalar(count_q) or 0
            items = db.scalars(
                base.order_by(Patient.created_at.desc()).limit(size).offset((page - 1) * size)
            ).all()
            return list(items), total

        # Busca por texto:
        # 1) primeiro tenta nos campos em claro (profissão/naturalidade/procedência) — é barato
        # 2) se vier <50 hits, complementa decifrando nomes em memória (até 500 candidatos)
        ilike = f"%{search}%"
        plain_filtered = base.where(or_(
            Patient.profession.ilike(ilike),
            Patient.naturalidade.ilike(ilike),
            Patient.procedencia.ilike(ilike),
        ))
        plain_count = db.scalar(
            count_q.where(or_(
                Patient.profession.ilike(ilike),
                Patient.naturalidade.ilike(ilike),
                Patient.procedencia.ilike(ilike),
            ))
        ) or 0

        # Decifra até 500 candidatos para busca por nome (custa, mas é o caminho da LGPD-friendly)
        candidates = db.scalars(base.order_by(Patient.created_at.desc()).limit(500)).all()
        needle = search.lower()
        matched: list[Patient] = []
        seen_ids: set = set()
        for p in candidates:
            try:
                name = crypto.decrypt_str(
                    p.full_name_enc, p.full_name_iv,
                    company_id=p.company_id, aad=_aad("full_name"),
                ) or ""
            except Exception:
                name = ""
            if needle in name.lower():
                matched.append(p)
                seen_ids.add(p.id)

        # Mescla com o resultado em-claro (sem duplicar)
        for p in db.scalars(plain_filtered.order_by(Patient.created_at.desc()).limit(size)).all():
            if p.id not in seen_ids:
                matched.append(p)
                seen_ids.add(p.id)

        # Paginação client-side (após filtragem)
        total = len(matched)
        offset = (page - 1) * size
        return matched[offset:offset + size], total

    total = db.scalar(count_q) or 0
    items = db.scalars(
        base.order_by(Patient.created_at.desc()).limit(size).offset((page - 1) * size)
    ).all()
    return list(items), total


def get_patient(db: Session, *, patient_id: UUID) -> Patient | None:
    return db.get(Patient, patient_id, options=[selectinload(Patient.doctors), selectinload(Patient.anamnesis)])


def decrypt_patient(p: Patient) -> DecryptedPatient:
    cid = p.company_id
    today = date.today()
    age = today.year - p.birth_date.year - (
        (today.month, today.day) < (p.birth_date.month, p.birth_date.day)
    )
    primary = next((d for d in p.doctors if d.is_primary), None) if p.doctors else None
    return DecryptedPatient(
        id=p.id,
        company_id=cid,
        full_name=crypto.decrypt_str(p.full_name_enc, p.full_name_iv, company_id=cid, aad=_aad("full_name", p.id)) or "",
        cpf=crypto.decrypt_str(p.cpf_enc, p.cpf_iv, company_id=cid, aad=_aad("cpf", p.id)) or "",
        birth_date=p.birth_date,
        age=age,
        status=p.status,
        mother_name=crypto.decrypt_str(p.mother_name_enc, p.mother_name_iv, company_id=cid, aad=_aad("mother_name", p.id)),
        father_name=crypto.decrypt_str(p.father_name_enc, p.father_name_iv, company_id=cid, aad=_aad("father_name", p.id)),
        address=crypto.decrypt_str(p.address_enc, p.address_iv, company_id=cid, aad=_aad("address", p.id)),
        phone=crypto.decrypt_str(p.phone_enc, p.phone_iv, company_id=cid, aad=_aad("phone", p.id)),
        email=crypto.decrypt_str(p.email_enc, p.email_iv, company_id=cid, aad=_aad("email", p.id)),
        naturalidade=p.naturalidade,
        procedencia=p.procedencia,
        profession=p.profession,
        marital_status=p.marital_status,
        religion=p.religion,
        skin_color=p.skin_color,
        primary_doctor_id=primary.doctor_id if primary else None,
        has_anamnesis=p.anamnesis is not None,
    )
