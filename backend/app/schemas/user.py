"""Schemas de usuários do sistema (sem profile clínico).

Este recurso lida com `users` — credenciais e perfil administrativo:
super_admin, clinic_admin, receptionist e (somente para listagem) doctor.

Para criar um doctor com profile clínico (CRM/CPF/especialidade), use
/doctors. Esta tela cobre roles administrativos.
"""
from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, Field, field_validator

from app.models.enums import UserRole


# Roles que podem ser CRIADOS via /users (administrativos).
# Doctor/Psychologist são criados via /doctors com profile clínico.
ADMINISTRATIVE_ROLES = {
    UserRole.SUPER_ADMIN.value,
    UserRole.CLINIC_ADMIN.value,
    UserRole.RECEPTIONIST.value,
}


class UserBase(BaseModel):
    full_name: str = Field(min_length=2, max_length=255)
    email: str = Field(min_length=3, max_length=255)
    role: UserRole
    company_id: int | None = None

    @field_validator("full_name", mode="before")
    @classmethod
    def _trim(cls, v):
        if isinstance(v, str):
            return v.strip()
        return v


class UserCreate(UserBase):
    password: str = Field(min_length=4, max_length=128)


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=255)
    role: UserRole | None = None
    is_active: bool | None = None
    # Permite super_admin transferir um user p/ outra empresa (raro, mas útil)
    company_id: int | None = None
    # Reset de senha (somente admin → user de menor privilégio)
    password: str | None = Field(default=None, min_length=4, max_length=128)


class UserOut(BaseModel):
    id: int
    full_name: str
    email: str
    role: UserRole
    company_id: int | None
    company_name: str | None = None
    is_active: bool
    last_login_at: datetime | None
    # Quando True, este user tem profile na tabela `doctors` — UI redireciona
    # para /doctors no edit ao invés do form genérico.
    has_doctor_profile: bool = False
    doctor_id: int | None = None
    created_at: datetime

    class Config:
        from_attributes = True
