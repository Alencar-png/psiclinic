"""Tenant raiz (Company / Clinic) e catálogo de planos."""
from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.config.database import Base
from .enums import CompanyStatus

if TYPE_CHECKING:
    from .auth import User
    from .clinical_actors import DoctorClinic
    from .patients import Patient


class Plan(Base):
    """
    Plano contratado pela clínica. Catálogo global (sem company_id).
    Define limites usados nos guards de criação de médicos/pacientes.
    """
    __tablename__ = "plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    max_doctors: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    max_patients: Mapped[int] = mapped_column(Integer, nullable=False, default=200)
    price_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class Company(Base):
    """
    Clínica psiquiátrica — TENANT raiz. Toda tabela com dados de paciente
    referencia `company_id` e tem política RLS filtrando por ele.
    """
    __tablename__ = "companies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)            # Razão social
    trade_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    cnpj: Mapped[str] = mapped_column(String(14), unique=True, nullable=False)
    # Campos relaxados — só name+cnpj continuam mandatórios. Os demais ficaram
    # nullable para permitir cadastro rápido (super_admin completa depois).
    email: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(20))
    address: Mapped[str | None] = mapped_column(String(500))
    city: Mapped[str | None] = mapped_column(String(120))
    state: Mapped[str | None] = mapped_column(String(2))
    zip_code: Mapped[str | None] = mapped_column(String(8))

    # Responsável técnico (Resolução CFM 2.073/2014). Em prod a clínica deve
    # ter — mas no cadastro inicial deixamos opcional pra fluxo rápido.
    technical_responsible_name: Mapped[str | None] = mapped_column(String(255))
    technical_responsible_crm: Mapped[str | None] = mapped_column(String(20))
    technical_responsible_uf: Mapped[str | None] = mapped_column(String(2))

    plan_id: Mapped[int | None] = mapped_column(ForeignKey("plans.id"))
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=CompanyStatus.ACTIVE.value
    )

    # Configurações clínicas (sobrescrevem defaults globais)
    session_lock_after_days: Mapped[int] = mapped_column(Integer, nullable=False, default=7)
    data_retention_days: Mapped[int] = mapped_column(
        Integer, nullable=False, default=365 * 20
    )
    doctors_see_all_patients: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), onupdate=func.now()
    )

    # Relacionamentos
    plan: Mapped[Plan | None] = relationship("Plan", lazy="joined")
    users: Mapped[list["User"]] = relationship("User", back_populates="company")
    doctor_clinics: Mapped[list["DoctorClinic"]] = relationship(
        "DoctorClinic", back_populates="company", cascade="all, delete-orphan"
    )
    patients: Mapped[list["Patient"]] = relationship(
        "Patient", back_populates="company", cascade="all, delete-orphan"
    )
