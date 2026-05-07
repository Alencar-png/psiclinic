"""Repositório de empresas/clínicas (operado pelo super-admin)."""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Company


def list_companies(
    db: Session, *, search: str | None = None, page: int = 1, size: int = 20
) -> tuple[list[Company], int]:
    base = select(Company)
    count_q = select(func.count(Company.id))
    if search:
        ilike = f"%{search}%"
        base = base.where(Company.name.ilike(ilike) | Company.cnpj.ilike(ilike))
        count_q = count_q.where(Company.name.ilike(ilike) | Company.cnpj.ilike(ilike))
    total = db.scalar(count_q) or 0
    items = db.scalars(
        base.order_by(Company.created_at.desc()).limit(size).offset((page - 1) * size)
    ).all()
    return list(items), total


def get_company(db: Session, company_id: int) -> Company | None:
    return db.get(Company, company_id)


def get_company_by_cnpj(db: Session, cnpj: str) -> Company | None:
    return db.scalar(select(Company).where(Company.cnpj == cnpj))
