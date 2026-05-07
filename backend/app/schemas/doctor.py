"""Schemas de médicos."""
from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, EmailStr, Field, field_validator
import re


class DoctorBase(BaseModel):
    full_name: str = Field(min_length=3, max_length=255)
    cpf: str
    crm: str
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


class DoctorCreate(DoctorBase):
    password: str | None = Field(
        default=None,
        min_length=12,
        max_length=128,
        description="Senha inicial. Se omitida, o médico recebe link de definição por e-mail.",
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
