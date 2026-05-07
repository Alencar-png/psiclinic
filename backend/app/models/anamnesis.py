"""
Ficha de Anamnese psiquiátrica — versionada (imutável por versão).

Modelo: cabeçalho `anamneses` (1:1 com paciente) + N versões. Toda alteração
gera nova versão e atualiza `current_version_id`. Versões antigas ficam para
auditoria e exigência regulatória (CFM 1.638/2002).

A estrutura clínica é guardada em campos JSONB cifrados — escolhi JSONB ao
invés de colunas porque a anamnese psiquiátrica tem ~100 sub-campos e
evolui rapidamente. Estrutura validada no schema Pydantic, não no banco.
"""
from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, deferred, mapped_column, relationship
import uuid

from app.config.database import Base

if TYPE_CHECKING:
    from .patients import Patient


class Anamnesis(Base):
    """Cabeçalho — 1:1 com paciente. Aponta para a versão corrente."""
    __tablename__ = "anamneses"
    __table_args__ = (
        UniqueConstraint("patient_id", name="uq_anamnesis_patient"),
        Index("ix_anamneses_company", "company_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    patient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("patients.id", ondelete="CASCADE"),
        nullable=False,
    )
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    current_version_id: Mapped[int | None] = mapped_column(
        ForeignKey("anamnesis_versions.id", use_alter=True, name="fk_anamnesis_current_version")
    )
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    patient: Mapped["Patient"] = relationship("Patient", back_populates="anamnesis")
    versions: Mapped[list["AnamnesisVersion"]] = relationship(
        "AnamnesisVersion",
        back_populates="anamnesis",
        cascade="all, delete-orphan",
        foreign_keys="AnamnesisVersion.anamnesis_id",
    )
    current_version: Mapped["AnamnesisVersion | None"] = relationship(
        "AnamnesisVersion",
        foreign_keys=[current_version_id],
        post_update=True,
    )


class AnamnesisVersion(Base):
    """
    Snapshot completo. Imutável após criação (UPDATE só por job de re-encrypt
    durante rotação de chave).

    Cada bloco do prompt vira um campo JSONB cifrado:
      - identification: bloco (a)
      - hda: bloco (b)
      - family_history: bloco (c)
      - personal_antecedents: bloco (d)
      - social_antecedents: bloco (e)
      - physical_exam: bloco (f)
      - mental_exam: bloco (g)
      - complementary_exams: bloco (h)
      - diagnostic_hypothesis: bloco (i) + cid10_codes em coluna text[]
      - conduct: bloco (j)
    """
    __tablename__ = "anamnesis_versions"
    __table_args__ = (
        Index("ix_anam_versions_anamnesis", "anamnesis_id"),
        Index("ix_anam_versions_company", "company_id"),
        UniqueConstraint(
            "anamnesis_id", "version_number", name="uq_anam_version_per_anamnesis"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    anamnesis_id: Mapped[int] = mapped_column(
        ForeignKey("anamneses.id", ondelete="CASCADE"), nullable=False
    )
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)

    # Campos clínicos cifrados — payload JSON serializado e criptografado
    identification_enc: Mapped[bytes | None] = deferred(mapped_column(LargeBinary))
    identification_iv: Mapped[bytes | None] = mapped_column(LargeBinary)
    hda_enc: Mapped[bytes | None] = deferred(mapped_column(LargeBinary))
    hda_iv: Mapped[bytes | None] = mapped_column(LargeBinary)
    family_history_enc: Mapped[bytes | None] = deferred(mapped_column(LargeBinary))
    family_history_iv: Mapped[bytes | None] = mapped_column(LargeBinary)
    personal_antecedents_enc: Mapped[bytes | None] = deferred(mapped_column(LargeBinary))
    personal_antecedents_iv: Mapped[bytes | None] = mapped_column(LargeBinary)
    social_antecedents_enc: Mapped[bytes | None] = deferred(mapped_column(LargeBinary))
    social_antecedents_iv: Mapped[bytes | None] = mapped_column(LargeBinary)
    physical_exam_enc: Mapped[bytes | None] = deferred(mapped_column(LargeBinary))
    physical_exam_iv: Mapped[bytes | None] = mapped_column(LargeBinary)
    mental_exam_enc: Mapped[bytes | None] = deferred(mapped_column(LargeBinary))
    mental_exam_iv: Mapped[bytes | None] = mapped_column(LargeBinary)
    complementary_exams_enc: Mapped[bytes | None] = deferred(mapped_column(LargeBinary))
    complementary_exams_iv: Mapped[bytes | None] = mapped_column(LargeBinary)
    diagnostic_hypothesis_enc: Mapped[bytes | None] = deferred(mapped_column(LargeBinary))
    diagnostic_hypothesis_iv: Mapped[bytes | None] = mapped_column(LargeBinary)
    conduct_enc: Mapped[bytes | None] = deferred(mapped_column(LargeBinary))
    conduct_iv: Mapped[bytes | None] = mapped_column(LargeBinary)

    # CID-10: array em claro para permitir filtro/relatório
    cid10_codes: Mapped[list[str] | None] = mapped_column(ARRAY(String(10)))

    # Metadados
    encryption_key_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    change_reason: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    anamnesis: Mapped["Anamnesis"] = relationship(
        "Anamnesis",
        back_populates="versions",
        foreign_keys=[anamnesis_id],
    )
    attachments: Mapped[list["AnamnesisAttachment"]] = relationship(
        "AnamnesisAttachment",
        back_populates="version",
        cascade="all, delete-orphan",
    )


class AnamnesisAttachment(Base):
    """Exames complementares (PDF, imagens) anexados a uma versão."""
    __tablename__ = "anamnesis_attachments"
    __table_args__ = (Index("ix_anam_att_version", "anamnesis_version_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    anamnesis_version_id: Mapped[int] = mapped_column(
        ForeignKey("anamnesis_versions.id", ondelete="CASCADE"), nullable=False
    )
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
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

    version: Mapped["AnamnesisVersion"] = relationship(
        "AnamnesisVersion", back_populates="attachments"
    )
