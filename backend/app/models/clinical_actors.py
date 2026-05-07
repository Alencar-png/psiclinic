"""
Atores clínicos: médicos e o vínculo N:N com clínicas.

Decisão importante: separamos `User` (credenciais) de `Doctor` (dados
profissionais — CPF, CRM, especialidade) para permitir que um mesmo médico
trabalhe em múltiplas clínicas com um único login. A tabela
`doctor_clinics` carrega o vínculo, e o tenant ativo é resolvido no login
ou via /auth/switch-clinic.
"""
from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.config.database import Base

if TYPE_CHECKING:
    from .auth import User
    from .tenant import Company
    from .patients import PatientDoctor


class Doctor(Base):
    """
    Profissional psiquiatra. CPF/CRM são únicos globais — não por tenant —
    porque a identidade civil/profissional do médico é uma só.
    """
    __tablename__ = "doctors"
    __table_args__ = (
        UniqueConstraint("user_id", name="uq_doctors_user"),
        UniqueConstraint("cpf", name="uq_doctors_cpf"),
        UniqueConstraint("crm", "crm_uf", name="uq_doctors_crm_uf"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )

    # CPF guardado em hash + cifrado (campo bytea adicionado na migration)
    cpf: Mapped[str] = mapped_column(String(64), nullable=False)  # hash HMAC

    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    crm: Mapped[str] = mapped_column(String(20), nullable=False)
    crm_uf: Mapped[str] = mapped_column(String(2), nullable=False)
    specialty: Mapped[str | None] = mapped_column(String(120))
    rqe: Mapped[str | None] = mapped_column(String(20))  # Registro de qualificação
    phone: Mapped[str | None] = mapped_column(String(20))
    photo_url: Mapped[str | None] = mapped_column(String(500))

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    user: Mapped["User"] = relationship("User", back_populates="doctor")
    clinics: Mapped[list["DoctorClinic"]] = relationship(
        "DoctorClinic", back_populates="doctor", cascade="all, delete-orphan"
    )
    patients: Mapped[list["PatientDoctor"]] = relationship(
        "PatientDoctor", back_populates="doctor"
    )


class DoctorClinic(Base):
    """
    Vínculo N:N entre médico e clínica. Sem `is_primary` — o médico escolhe
    o workspace ativo na sessão do navegador. `active=False` desativa o
    vínculo sem deletar (auditoria).
    """
    __tablename__ = "doctor_clinics"
    __table_args__ = (
        Index("ix_doctor_clinics_company", "company_id"),
        Index("ix_doctor_clinics_doctor", "doctor_id"),
    )

    doctor_id: Mapped[int] = mapped_column(
        ForeignKey("doctors.id", ondelete="CASCADE"), primary_key=True
    )
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), primary_key=True
    )
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    left_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    doctor: Mapped["Doctor"] = relationship("Doctor", back_populates="clinics")
    company: Mapped["Company"] = relationship("Company", back_populates="doctor_clinics")
