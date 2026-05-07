"""Schemas de autenticação."""
from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    # Em vez de EmailStr (que exige TLD), aceitamos string com @.
    # Permite usuários internos como "dr.marilia@demo" usados no seed.
    # Cadastros novos (criação de médico/admin/paciente) usam EmailStr — rigorosos.
    email: str = Field(min_length=3, max_length=255)
    # min_length=4 é permissivo para facilitar dev/seed.
    # Em produção, eleve para 12 e ative política via /auth/change-password.
    password: str = Field(min_length=4, max_length=128)
    totp_code: str | None = Field(default=None, min_length=6, max_length=6)


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_at: datetime


class RefreshRequest(BaseModel):
    refresh_token: str


class SwitchClinicRequest(BaseModel):
    company_id: int


class TotpEnrollResponse(BaseModel):
    secret: str
    provisioning_uri: str
    qr_svg_base64: str | None = None


class TotpConfirmRequest(BaseModel):
    code: str = Field(min_length=6, max_length=6)


class MeResponse(BaseModel):
    id: int
    email: str  # str em vez de EmailStr para suportar logins internos sem TLD
    full_name: str
    role: str
    company_id: int | None
    company_name: str | None = None
    doctor_id: int | None = None
    totp_enabled: bool = False
