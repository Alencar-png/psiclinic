"""Schemas de empresas/clínicas (super-admin opera, clinic-admin lê a própria)."""
from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, EmailStr, Field, field_validator
import re

from app.models.enums import CompanyStatus


_CNPJ_RE = re.compile(r"^\d{14}$")


class CompanyBase(BaseModel):
    """Apenas name + cnpj são obrigatórios. Demais ficam opcionais para
    permitir cadastro rápido (super_admin completa depois pelo /edit)."""
    name: str = Field(min_length=2, max_length=255)
    trade_name: str | None = None
    cnpj: str
    email: str | None = Field(default=None, max_length=255)
    phone: str | None = None
    address: str | None = None
    city: str | None = None
    state: str | None = Field(default=None, max_length=2)
    zip_code: str | None = None
    technical_responsible_name: str | None = None
    technical_responsible_crm: str | None = None
    technical_responsible_uf: str | None = Field(default=None, max_length=2)
    plan_id: int | None = None

    @field_validator(
        "trade_name", "email", "phone", "address", "city", "state",
        "zip_code", "technical_responsible_name", "technical_responsible_crm",
        "technical_responsible_uf",
        mode="before",
    )
    @classmethod
    def _empty_to_none(cls, v):
        # Front manda string vazia em vez de não enviar — normaliza p/ NULL.
        if isinstance(v, str) and not v.strip():
            return None
        return v

    @field_validator("cnpj")
    @classmethod
    def _digits_only_cnpj(cls, v: str) -> str:
        only = re.sub(r"\D", "", v)
        if not _CNPJ_RE.match(only):
            raise ValueError("CNPJ deve ter 14 dígitos")
        return only

    @field_validator("zip_code")
    @classmethod
    def _digits_only_zip(cls, v: str | None) -> str | None:
        if v is None:
            return None
        only = re.sub(r"\D", "", v)
        if not only:
            return None
        if len(only) != 8:
            raise ValueError("CEP deve ter 8 dígitos")
        return only


class CompanyCreate(CompanyBase):
    """Inclui o primeiro admin da clínica.
    Senha mínima reduzida pra 6 caracteres — super_admin força troca depois.
    """
    admin_email: str = Field(min_length=3, max_length=255)
    admin_full_name: str | None = None
    admin_password: str = Field(min_length=6, max_length=128)


class CompanyUpdate(BaseModel):
    name: str | None = None
    trade_name: str | None = None
    email: str | None = Field(default=None, max_length=255)
    phone: str | None = None
    address: str | None = None
    city: str | None = None
    state: str | None = Field(default=None, max_length=2)
    zip_code: str | None = None
    plan_id: int | None = None
    status: CompanyStatus | None = None
    session_lock_after_days: int | None = Field(default=None, ge=1, le=90)
    doctors_see_all_patients: bool | None = None


class CompanyOut(CompanyBase):
    id: int
    status: CompanyStatus
    session_lock_after_days: int
    data_retention_days: int
    doctors_see_all_patients: bool
    created_at: datetime

    class Config:
        from_attributes = True
