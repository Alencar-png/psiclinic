"""
Sessões clínicas (núcleo do sistema). Cada sessão tem observações
em rich-text cifradas + tsvector indexado para FTS.

Decisão crítica: o tsvector é gerado SOBRE O TEXTO PLANO (sem HTML, sem
acentos sensíveis). Para isso o app extrai o texto da observação ANTES
de cifrá-la, gera o tsvector com `to_tsvector('portuguese', txt)` e o
salva. O texto plano em si NÃO é guardado — só os termos do tsvector,
que são opaco-ish (não permitem reconstrução do texto original).
"""
from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR, UUID
from sqlalchemy.orm import Mapped, deferred, mapped_column, relationship
import uuid

from app.config.database import Base
from .enums import SessionStatus

if TYPE_CHECKING:
    from .clinical_actors import Doctor
    from .patients import Patient


class ClinicalSession(Base):
    """
    Sessão de atendimento. Nome com prefixo "Clinical" porque `Session` é
    palavra reservada do SQLAlchemy.
    """
    __tablename__ = "clinical_sessions"
    __table_args__ = (
        Index("ix_sessions_company", "company_id"),
        Index("ix_sessions_patient", "patient_id"),
        Index("ix_sessions_doctor", "doctor_id"),
        Index("ix_sessions_scheduled", "scheduled_at"),
        Index(
            "ix_sessions_observations_tsv",
            "observations_tsv",
            postgresql_using="gin",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("patients.id", ondelete="CASCADE"),
        nullable=False,
    )
    doctor_id: Mapped[int] = mapped_column(
        ForeignKey("doctors.id", ondelete="RESTRICT"), nullable=False
    )

    # Adendo: aponta para sessão original quando esta é uma correção pós-bloqueio
    parent_session_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clinical_sessions.id")
    )

    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=50)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=SessionStatus.SCHEDULED.value
    )

    # Observações: rich-text HTML cifrado. Deferred — não carrega em listagens.
    observations_html_enc: Mapped[bytes | None] = deferred(mapped_column(LargeBinary))
    observations_iv: Mapped[bytes | None] = mapped_column(LargeBinary)
    encryption_key_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    # Full-text search: tsvector gerado pelo app a partir do texto plano
    # extraído do HTML antes da cifragem. Índice GIN acima.
    observations_tsv: Mapped[str | None] = mapped_column(TSVECTOR)

    next_session_suggestion: Mapped[date | None] = mapped_column(Date)

    # Bloqueio de edição
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), onupdate=func.now()
    )
    last_autosaved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    patient: Mapped["Patient"] = relationship("Patient", back_populates="sessions")
    doctor: Mapped["Doctor"] = relationship("Doctor")
    attachments: Mapped[list["SessionAttachment"]] = relationship(
        "SessionAttachment", back_populates="session", cascade="all, delete-orphan"
    )
    prescriptions: Mapped[list["Prescription"]] = relationship(
        "Prescription", back_populates="session", cascade="all, delete-orphan"
    )


class SessionAttachment(Base):
    """Anexos da sessão: receitas, exames, áudio (se consentido)."""
    __tablename__ = "session_attachments"
    __table_args__ = (Index("ix_session_att_session", "session_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clinical_sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[str] = mapped_column(String(30), nullable=False)  # exam|prescription|audio|other
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    object_key: Mapped[str] = mapped_column(String(500), nullable=False)
    encryption_iv: Mapped[bytes | None] = mapped_column(LargeBinary)
    sha256_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    uploaded_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    session: Mapped["ClinicalSession"] = relationship(
        "ClinicalSession", back_populates="attachments"
    )


class Prescription(Base):
    """
    Prescrição estruturada associada a uma sessão.
    Items: lista de {drug, dose, route, frequency, duration_days, notes}.
    """
    __tablename__ = "prescriptions"
    __table_args__ = (
        Index("ix_prescriptions_session", "session_id"),
        Index("ix_prescriptions_company", "company_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clinical_sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    template_id: Mapped[int | None] = mapped_column(ForeignKey("prescription_templates.id"))
    items: Mapped[dict] = mapped_column(JSONB, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    pdf_object_key: Mapped[str | None] = mapped_column(String(500))
    digital_signature: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    session: Mapped["ClinicalSession"] = relationship(
        "ClinicalSession", back_populates="prescriptions"
    )


class PrescriptionTemplate(Base):
    """Templates reutilizáveis por médico (atalho de prescrição)."""
    __tablename__ = "prescription_templates"
    __table_args__ = (
        Index("ix_presc_templates_doctor", "doctor_id"),
        Index("ix_presc_templates_company", "company_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    doctor_id: Mapped[int] = mapped_column(
        ForeignKey("doctors.id", ondelete="CASCADE"), nullable=False
    )
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    items: Mapped[dict] = mapped_column(JSONB, nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
