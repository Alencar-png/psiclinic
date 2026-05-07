"""
Repositório de sessões clínicas.

A complexidade aqui está em três pontos:
  1. Auto-save das observações (rich-text) → cifrar + atualizar tsvector na mesma transação.
  2. Bloqueio após N dias → trigger no banco impede UPDATE de observations
     em sessão locked; aqui apenas marcamos o lock.
  3. Busca FTS no tsvector com snippet — usa ts_headline em texto plano cacheado
     em sessions.observations_tsv? Não — tsvector não guarda o texto original.
     Para snippet, o caller faz UMA decifragem da observação top-K. Trade-off:
     limita busca a returnar 50 hits, decifrar todos e gerar snippets em Python.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Iterable
from uuid import UUID

from sqlalchemy import and_, func, or_, select, text, update
from sqlalchemy.orm import Session, selectinload

from app.models import ClinicalSession, Doctor, Patient
from app.models.enums import SessionStatus
from app.services import crypto


def _aad(session_id: UUID | None) -> str:
    return f"clinical_sessions|observations|{session_id or 'new'}"


def create_session(
    db: Session,
    *,
    company_id: int,
    patient_id: UUID,
    doctor_id: int,
    scheduled_at: datetime,
    duration_minutes: int = 50,
    status: SessionStatus = SessionStatus.SCHEDULED,
) -> ClinicalSession:
    s = ClinicalSession(
        company_id=company_id,
        patient_id=patient_id,
        doctor_id=doctor_id,
        scheduled_at=scheduled_at,
        duration_minutes=duration_minutes,
        status=status.value,
    )
    db.add(s)
    db.flush()
    return s


def list_in_range(
    db: Session,
    *,
    company_id: int,
    from_dt: datetime,
    to_dt: datetime,
    doctor_id: int | None = None,
    status: str | None = None,
) -> list[ClinicalSession]:
    """Lista sessões num intervalo de datas, com paciente e médico carregados.
    Caller decide se decifra o nome do paciente (depende do role)."""
    from sqlalchemy.orm import selectinload

    stmt = (
        select(ClinicalSession)
        .where(
            ClinicalSession.company_id == company_id,
            ClinicalSession.scheduled_at >= from_dt,
            ClinicalSession.scheduled_at < to_dt,
        )
        .options(
            selectinload(ClinicalSession.doctor),
            selectinload(ClinicalSession.patient),
        )
        .order_by(ClinicalSession.scheduled_at)
    )
    if doctor_id is not None:
        stmt = stmt.where(ClinicalSession.doctor_id == doctor_id)
    if status:
        stmt = stmt.where(ClinicalSession.status == status)
    return list(db.scalars(stmt).all())


def list_by_patient(
    db: Session,
    *,
    patient_id: UUID,
    page: int = 1,
    size: int = 20,
) -> tuple[list[ClinicalSession], int]:
    base = (
        select(ClinicalSession)
        .where(ClinicalSession.patient_id == patient_id)
        .options(selectinload(ClinicalSession.doctor))
    )
    count_q = select(func.count(ClinicalSession.id)).where(
        ClinicalSession.patient_id == patient_id
    )
    items = db.scalars(
        base.order_by(ClinicalSession.scheduled_at.desc())
        .limit(size)
        .offset((page - 1) * size)
    ).all()
    total = db.scalar(count_q) or 0
    return list(items), total


def get_session(db: Session, *, session_id: UUID) -> ClinicalSession | None:
    return db.get(
        ClinicalSession,
        session_id,
        options=[selectinload(ClinicalSession.doctor)],
    )


def update_observations(
    db: Session,
    *,
    session: ClinicalSession,
    html: str,
    plain: str,
    autosave: bool = False,
) -> None:
    """
    Cifra o HTML, gera tsvector do texto plano em uma única query.

    O update do tsvector usa func.to_tsvector — gerado pelo banco a partir
    do texto plano que enviamos como bind param. Texto plano NÃO é
    persistido — só o tsvector.
    """
    if session.locked_at is not None:
        raise ValueError(f"Sessão {session.id} bloqueada — crie um adendo.")

    enc = crypto.encrypt_str(html, company_id=session.company_id, aad=_aad(session.id))
    if enc is None:
        return

    db.execute(
        update(ClinicalSession)
        .where(ClinicalSession.id == session.id)
        .values(
            observations_html_enc=enc.ciphertext,
            observations_iv=enc.iv,
            observations_tsv=func.to_tsvector("portuguese", plain),
            encryption_key_version=enc.key_version,
            last_autosaved_at=datetime.now(timezone.utc) if autosave else None,
        )
    )


def decrypt_observations(s: ClinicalSession) -> str | None:
    if not s.observations_html_enc or not s.observations_iv:
        return None
    return crypto.decrypt_str(
        s.observations_html_enc,
        s.observations_iv,
        company_id=s.company_id,
        aad=_aad(s.id),
        key_version=s.encryption_key_version,
    )


def lock_overdue_sessions(db: Session, *, lock_after_days: int) -> int:
    """Job: bloqueia sessões com mais de N dias sem update."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=lock_after_days)
    res = db.execute(
        update(ClinicalSession)
        .where(
            and_(
                ClinicalSession.locked_at.is_(None),
                ClinicalSession.status == SessionStatus.COMPLETED.value,
                ClinicalSession.updated_at < cutoff,
            )
        )
        .values(locked_at=func.now())
    )
    return res.rowcount or 0


def search_observations(
    db: Session,
    *,
    company_id: int,
    query: str,
    page: int = 1,
    size: int = 20,
) -> list[dict]:
    """
    Busca FTS via plainto_tsquery em portuguese. Retorna ids + rank.
    O caller decifra os top-N para gerar snippets.
    """
    stmt = text(
        """
        SELECT id, patient_id, scheduled_at,
               ts_rank(observations_tsv, plainto_tsquery('portuguese', :q)) AS rank
        FROM clinical_sessions
        WHERE company_id = :cid
          AND observations_tsv @@ plainto_tsquery('portuguese', :q)
        ORDER BY rank DESC, scheduled_at DESC
        LIMIT :size OFFSET :offset
        """
    )
    rows = db.execute(
        stmt,
        {"q": query, "cid": company_id, "size": size, "offset": (page - 1) * size},
    ).mappings().all()
    return [dict(r) for r in rows]
