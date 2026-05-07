"""GET /cid10?q=...  — autocomplete CID-10."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, or_, text
from sqlalchemy.orm import Session

from app.middleware.deps import get_current_user, get_db_raw
from app.models import CID10, User

router = APIRouter(prefix="/cid10", tags=["catalog"])


@router.get("")
def search(
    q: str = Query(min_length=2, max_length=80),
    limit: int = Query(20, ge=1, le=50),
    db: Session = Depends(get_db_raw),
    user: User = Depends(get_current_user),
):
    # Trigram + prefix match no código
    rows = db.execute(
        select(CID10.code, CID10.description)
        .where(or_(CID10.code.ilike(f"{q}%"), CID10.description.ilike(f"%{q}%")))
        .order_by(CID10.code)
        .limit(limit)
    ).all()
    return [{"code": c, "description": d} for c, d in rows]
