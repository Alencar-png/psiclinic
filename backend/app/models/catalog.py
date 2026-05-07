"""Catálogos globais (sem company_id, sem RLS)."""
from __future__ import annotations

from sqlalchemy import Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.config.database import Base


class CID10(Base):
    """
    Códigos CID-10 (Capítulo V — Transtornos Mentais e Comportamentais
    são prioridade, mas a tabela aceita todos). Seed inicial em
    seeds/cid10_seed.py.
    """
    __tablename__ = "cid10"
    __table_args__ = (Index("ix_cid10_description_trgm", "description", postgresql_using="gin", postgresql_ops={"description": "gin_trgm_ops"}),)

    code: Mapped[str] = mapped_column(String(10), primary_key=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    chapter: Mapped[str | None] = mapped_column(String(50))
    parent_code: Mapped[str | None] = mapped_column(String(10))
