"""Pacientes, atribuição médico↔paciente e termos de consentimento."""
from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
import uuid

from app.config.database import Base
from .enums import PatientStatus

if TYPE_CHECKING:
    from .anamnesis import Anamnesis
    from .clinical_actors import Doctor
    from .sessions import ClinicalSession
    from .tenant import Company


class Patient(Base):
    """
    Paciente. ID é UUIDv4 para evitar enumeration nos URLs.

    Campos PII (full_name, mother_name, address) são guardados em LargeBinary
    (cifrado AES-GCM com chave derivada por tenant). O CPF tem hash HMAC para
    permitir busca exata sem decifrar.
    """
    __tablename__ = "patients"
    __table_args__ = (
        Index("ix_patients_company", "company_id"),
        Index("ix_patients_cpf_hash", "cpf_hash"),
        UniqueConstraint("company_id", "cpf_hash", name="uq_patient_cpf_per_company"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )

    # PII cifrado
    full_name_enc: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    full_name_iv: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    mother_name_enc: Mapped[bytes | None] = mapped_column(LargeBinary)
    mother_name_iv: Mapped[bytes | None] = mapped_column(LargeBinary)
    father_name_enc: Mapped[bytes | None] = mapped_column(LargeBinary)
    father_name_iv: Mapped[bytes | None] = mapped_column(LargeBinary)
    address_enc: Mapped[bytes | None] = mapped_column(LargeBinary)
    address_iv: Mapped[bytes | None] = mapped_column(LargeBinary)
    phone_enc: Mapped[bytes | None] = mapped_column(LargeBinary)
    phone_iv: Mapped[bytes | None] = mapped_column(LargeBinary)
    email_enc: Mapped[bytes | None] = mapped_column(LargeBinary)
    email_iv: Mapped[bytes | None] = mapped_column(LargeBinary)

    # CPF: hash determinístico HMAC-SHA256 (busca) + cifrado (exibição)
    cpf_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    cpf_enc: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    cpf_iv: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)

    # Não-sensível (em claro para listagens, busca por idade etc.)
    birth_date: Mapped[date] = mapped_column(Date, nullable=False)
    gender: Mapped[str | None] = mapped_column(String(20))
    naturalidade: Mapped[str | None] = mapped_column(String(120))
    procedencia: Mapped[str | None] = mapped_column(String(120))
    profession: Mapped[str | None] = mapped_column(String(120))
    marital_status: Mapped[str | None] = mapped_column(String(50))
    religion: Mapped[str | None] = mapped_column(String(80))
    skin_color: Mapped[str | None] = mapped_column(String(50))

    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=PatientStatus.ACTIVE.value
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), onupdate=func.now()
    )
    discharged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    company: Mapped["Company"] = relationship("Company", back_populates="patients")
    doctors: Mapped[list["PatientDoctor"]] = relationship(
        "PatientDoctor", back_populates="patient", cascade="all, delete-orphan"
    )
    anamnesis: Mapped["Anamnesis | None"] = relationship(
        "Anamnesis", back_populates="patient", uselist=False, cascade="all, delete-orphan"
    )
    sessions: Mapped[list["ClinicalSession"]] = relationship(
        "ClinicalSession", back_populates="patient", cascade="all, delete-orphan"
    )
    consents: Mapped[list["PatientConsent"]] = relationship(
        "PatientConsent", back_populates="patient", cascade="all, delete-orphan"
    )


class PatientDoctor(Base):
    """N:N — um paciente pode ter mais de um médico (ex: psiquiatra + neurologista)."""
    __tablename__ = "patient_doctors"

    patient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("patients.id", ondelete="CASCADE"),
        primary_key=True,
    )
    doctor_id: Mapped[int] = mapped_column(
        ForeignKey("doctors.id", ondelete="CASCADE"), primary_key=True
    )
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    unassigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    patient: Mapped["Patient"] = relationship("Patient", back_populates="doctors")
    doctor: Mapped["Doctor"] = relationship("Doctor", back_populates="patients")


class PatientConsent(Base):
    """
    Termo de consentimento (LGPD). Múltiplas linhas por paciente — uma por
    finalidade (`purpose`). Revogação é registrada (não deleta).
    """
    __tablename__ = "patient_consents"
    __table_args__ = (
        Index("ix_consents_patient", "patient_id"),
        Index("ix_consents_company", "company_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("patients.id", ondelete="CASCADE"),
        nullable=False,
    )
    purpose: Mapped[str] = mapped_column(String(50), nullable=False)
    accepted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ip_address: Mapped[str | None] = mapped_column(String(45))
    document_url: Mapped[str | None] = mapped_column(String(500))  # PDF do termo
    signed_text_hash: Mapped[str | None] = mapped_column(String(64))  # SHA-256 do texto

    patient: Mapped["Patient"] = relationship("Patient", back_populates="consents")
