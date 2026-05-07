"""
Audit log — append-only. Núcleo de compliance LGPD/CFM.

Toda ação relevante (read/create/update/delete/export) em entidades
clínicas gera uma linha aqui. Política RLS:
  - super_admin: vê tudo
  - clinic_admin: vê só company_id da própria clínica
  - doctor: vê só ações em seus pacientes (filtro por patient_id em
    pacientes que têm vínculo via patient_doctors)

Nunca atualizar nem deletar manualmente. Particionamento por mês recomendado
em produção (CREATE TABLE ... PARTITION BY RANGE (occurred_at)).
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import INET, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
import uuid

from app.config.database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("ix_audit_company_time", "company_id", "occurred_at"),
        Index("ix_audit_user_time", "user_id", "occurred_at"),
        Index("ix_audit_patient_time", "patient_id", "occurred_at"),
        Index("ix_audit_entity", "entity_type", "entity_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)

    company_id: Mapped[int | None] = mapped_column(
        ForeignKey("companies.id", ondelete="SET NULL")
    )
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    patient_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("patients.id", ondelete="SET NULL")
    )

    action: Mapped[str] = mapped_column(String(20), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(60), nullable=False)
    entity_id: Mapped[str | None] = mapped_column(String(100))

    # Contexto HTTP (extraído pelo middleware)
    http_method: Mapped[str | None] = mapped_column(String(10))
    http_path: Mapped[str | None] = mapped_column(String(500))
    ip_address: Mapped[str | None] = mapped_column(INET)
    user_agent: Mapped[str | None] = mapped_column(String(500))

    # Diff (para update). Não guardar dados clínicos cifrados — só nomes de campos.
    payload_diff: Mapped[dict | None] = mapped_column(JSONB)

    # Resultado
    status_code: Mapped[int | None] = mapped_column(Integer)
    error_message: Mapped[str | None] = mapped_column(Text)

    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
