"""Schemas de pacientes (PII cifrado no banco; aqui em claro para o app)."""
from __future__ import annotations

from datetime import date, datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, EmailStr, Field, field_validator
import re

from app.models.enums import PatientStatus


class PatientBase(BaseModel):
    full_name: str = Field(min_length=3, max_length=255)
    cpf: str
    birth_date: date
    gender: str | None = None
    mother_name: str | None = None
    father_name: str | None = None
    address: str | None = None
    phone: str | None = None
    email: str | None = Field(default=None, max_length=255)
    naturalidade: str | None = None
    procedencia: str | None = None
    profession: str | None = None
    marital_status: str | None = None
    religion: str | None = None
    skin_color: str | None = None

    @field_validator("cpf")
    @classmethod
    def _digits_only_cpf(cls, v: str) -> str:
        only = re.sub(r"\D", "", v)
        if len(only) != 11:
            raise ValueError("CPF deve ter 11 dígitos")
        return only


class PatientCreate(PatientBase):
    primary_doctor_id: int | None = None


class PatientUpdate(BaseModel):
    full_name: str | None = None
    address: str | None = None
    phone: str | None = None
    email: str | None = Field(default=None, max_length=255)
    profession: str | None = None
    marital_status: str | None = None
    status: PatientStatus | None = None


class PatientListItem(BaseModel):
    """Versão enxuta para listas — sem PII completo."""
    id: UUID
    full_name: str
    birth_date: date
    age: int
    status: PatientStatus
    primary_doctor_name: Optional[str] = None
    last_session_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class PatientDetail(PatientBase):
    id: UUID
    age: int  # Derivado de birth_date — front consome direto, evita recalcular.
    status: PatientStatus
    company_id: int
    primary_doctor_id: int | None = None
    created_at: datetime
    has_anamnesis: bool

    class Config:
        from_attributes = True
