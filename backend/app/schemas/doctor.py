"""Schemas de profissionais clínicos (médicos e psicólogos).

A tabela permanece chamada `doctors` por compatibilidade — o campo
`professional_type` discrimina o tipo. UI mostra "CRM" ou "CRP" no
campo `crm` conforme o tipo.
"""
from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, EmailStr, Field, field_validator
import re

from app.models.enums import ProfessionalType


class DoctorBase(BaseModel):
    full_name: str = Field(min_length=3, max_length=255)
    cpf: str
    professional_type: ProfessionalType = ProfessionalType.DOCTOR
    crm: str  # Genérico — pode ser CRM ou CRP, string crua sem prefixo.
    crm_uf: str = Field(min_length=2, max_length=2)
    specialty: str | None = None
    rqe: str | None = None
    phone: str | None = None
    email: str = Field(min_length=3, max_length=255)

    @field_validator("cpf")
    @classmethod
    def _validate_cpf(cls, v: str) -> str:
        only = re.sub(r"\D", "", v)
        if len(only) != 11:
            raise ValueError("CPF deve ter 11 dígitos")
        return only

    @field_validator("specialty", "rqe", "phone", mode="before")
    @classmethod
    def _empty_to_none(cls, v):
        if isinstance(v, str) and not v.strip():
            return None
        return v


class DoctorCreate(DoctorBase):
    password: str | None = Field(
        default=None,
        min_length=4,
        max_length=128,
        description="Senha inicial. Se omitida, gera-se uma aleatória.",
    )


class DoctorUpdate(BaseModel):
    full_name: str | None = None
    specialty: str | None = None
    phone: str | None = None
    photo_url: str | None = None
    is_active: bool | None = None


class DoctorOut(BaseModel):
    id: int
    full_name: str
    professional_type: ProfessionalType
    crm: str
    crm_uf: str
    specialty: str | None = None
    email: str = Field(min_length=3, max_length=255)
    phone: str | None = None
    photo_url: str | None = None
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True
