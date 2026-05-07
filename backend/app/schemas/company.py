"""Schemas de empresas/clínicas (super-admin opera, clinic-admin lê a própria)."""
from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, EmailStr, Field, field_validator
import re

from app.models.enums import CompanyStatus


_CNPJ_RE = re.compile(r"^\d{14}$")


class CompanyBase(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    trade_name: str | None = None
    cnpj: str
    email: str = Field(min_length=3, max_length=255)
    phone: str | None = None
    address: str | None = None
    city: str | None = None
    state: str | None = Field(default=None, max_length=2)
    zip_code: str | None = None
    technical_responsible_name: str
    technical_responsible_crm: str
    technical_responsible_uf: str = Field(max_length=2)
    plan_id: int | None = None

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
        if len(only) != 8:
            raise ValueError("CEP deve ter 8 dígitos")
        return only


class CompanyCreate(CompanyBase):
    """Inclui o primeiro admin da clínica."""
    admin_email: str = Field(min_length=3, max_length=255)
    admin_full_name: str
    admin_password: str = Field(min_length=12, max_length=128)


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
