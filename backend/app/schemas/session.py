"""Schemas das sessões clínicas."""
from __future__ import annotations

from datetime import date, datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, Field

from app.models.enums import SessionStatus


class SessionCreate(BaseModel):
    patient_id: UUID
    doctor_id: int | None = Field(
        default=None,
        description="Se omitido, usa o médico autenticado.",
    )
    scheduled_at: datetime
    duration_minutes: int = Field(default=50, ge=5, le=240)
    status: SessionStatus = SessionStatus.SCHEDULED


class SessionUpdate(BaseModel):
    scheduled_at: datetime | None = None
    duration_minutes: int | None = Field(default=None, ge=5, le=240)
    status: SessionStatus | None = None
    next_session_suggestion: date | None = None


class SessionObservationsUpdate(BaseModel):
    """Auto-save do editor rich-text."""
    observations_html: str = Field(description="HTML sanitizado")
    observations_plain: str = Field(description="Texto plano para indexar (FTS)")


class SessionListItem(BaseModel):
    id: UUID
    scheduled_at: datetime
    duration_minutes: int
    status: SessionStatus
    doctor_name: str
    locked_at: datetime | None = None

    class Config:
        from_attributes = True


class SessionDetail(BaseModel):
    id: UUID
    patient_id: UUID
    doctor_id: int
    doctor_name: str
    scheduled_at: datetime
    duration_minutes: int
    status: SessionStatus
    observations_html: str | None = Field(
        default=None,
        description="Decifrado para o caller autorizado; None se não autorizado.",
    )
    next_session_suggestion: date | None
    locked_at: datetime | None
    parent_session_id: UUID | None = None
    created_at: datetime
    updated_at: datetime | None
    last_autosaved_at: datetime | None

    class Config:
        from_attributes = True


class SessionSearchHit(BaseModel):
    id: UUID
    patient_id: UUID
    patient_name: str
    scheduled_at: datetime
    snippet: str
    rank: float


class AgendaItem(BaseModel):
    """Item da agenda (lista/semana). Inclui dados decifrados do paciente."""
    id: UUID
    scheduled_at: datetime
    duration_minutes: int
    status: SessionStatus
    doctor_id: int
    doctor_name: str
    patient_id: UUID
    patient_name: str
    locked_at: datetime | None = None
