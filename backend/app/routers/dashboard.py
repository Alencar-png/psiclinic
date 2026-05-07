"""
Dashboard — agregações leves, sem decifrar PII em massa.

GET /dashboard/me  — adapta-se ao role:
  doctor       → KPIs do médico, agenda do dia, sparkline de sessões 14d,
                 distribuição de status, aniversariantes dos seus pacientes
  clinic-admin → KPIs da clínica, agenda do dia, ocupação por médico,
                 distribuição de status, sessões por dia da semana,
                 distribuição por gênero, aniversariantes do mês,
                 últimos pacientes cadastrados
  receptionist → mesma visão da clinic-admin (operação de recepção)
  super-admin  → # empresas, # sessões totais

A descriptografia de nomes acontece SOMENTE para a "agenda do dia"
(no máximo ~30 itens) — operação cara mas controlada. As demais
agregações usam apenas colunas em claro (gênero, datas, status).
"""
from __future__ import annotations

from datetime import datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import and_, extract, func, select
from sqlalchemy.orm import Session

from app.middleware.deps import get_current_user, get_db_with_tenant
from app.models import (
    ClinicalSession,
    Company,
    Doctor,
    Patient,
    User,
)
from app.models.enums import PatientStatus, SessionStatus, UserRole
from app.repositories import patient_repo

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


# ─────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────
def _utc_today_bounds() -> tuple[datetime, datetime]:
    """Retorna (início_do_dia_utc, fim_do_dia_utc)."""
    now = datetime.now(timezone.utc)
    start = datetime.combine(now.date(), time.min, tzinfo=timezone.utc)
    end = start + timedelta(days=1)
    return start, end


def _sessions_by_day(
    db: Session, *, company_id: int, doctor_id: int | None, days: int = 14
) -> list[dict]:
    """
    Lista de {date, count} para os últimos N dias (sessões com status != cancelled).
    Inclui dias com 0 sessões (importante para sparkline contínuo).
    """
    now = datetime.now(timezone.utc)
    start = (now - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)

    stmt = (
        select(
            func.date_trunc("day", ClinicalSession.scheduled_at).label("d"),
            func.count(ClinicalSession.id),
        )
        .where(
            ClinicalSession.company_id == company_id,
            ClinicalSession.scheduled_at >= start,
            ClinicalSession.scheduled_at < now + timedelta(days=1),
            ClinicalSession.status != SessionStatus.CANCELLED.value,
        )
        .group_by("d")
        .order_by("d")
    )
    if doctor_id is not None:
        stmt = stmt.where(ClinicalSession.doctor_id == doctor_id)

    rows = {r[0].date().isoformat(): int(r[1]) for r in db.execute(stmt).all()}

    out: list[dict] = []
    for i in range(days):
        d = (start + timedelta(days=i)).date()
        out.append({"date": d.isoformat(), "count": rows.get(d.isoformat(), 0)})
    return out


def _sessions_by_weekday(
    db: Session, *, company_id: int, doctor_id: int | None, days: int = 30
) -> list[dict]:
    """Distribuição de sessões pelos dias da semana nos últimos N dias."""
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=days)

    # PostgreSQL: extract(dow) → 0=Sunday..6=Saturday
    stmt = (
        select(
            extract("dow", ClinicalSession.scheduled_at).label("dow"),
            func.count(ClinicalSession.id),
        )
        .where(
            ClinicalSession.company_id == company_id,
            ClinicalSession.scheduled_at >= start,
            ClinicalSession.scheduled_at < now,
            ClinicalSession.status != SessionStatus.CANCELLED.value,
        )
        .group_by("dow")
    )
    if doctor_id is not None:
        stmt = stmt.where(ClinicalSession.doctor_id == doctor_id)

    rows = {int(r[0]): int(r[1]) for r in db.execute(stmt).all()}
    labels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]
    return [{"weekday": labels[i], "count": rows.get(i, 0)} for i in range(7)]


def _status_distribution(
    db: Session, *, company_id: int, doctor_id: int | None, days: int = 30
) -> list[dict]:
    """Distribuição por status nos últimos N dias."""
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=days)
    stmt = (
        select(ClinicalSession.status, func.count(ClinicalSession.id))
        .where(
            ClinicalSession.company_id == company_id,
            ClinicalSession.scheduled_at >= start,
            ClinicalSession.scheduled_at < now + timedelta(days=days),  # cobre futuro também
        )
        .group_by(ClinicalSession.status)
    )
    if doctor_id is not None:
        stmt = stmt.where(ClinicalSession.doctor_id == doctor_id)

    rows = db.execute(stmt).all()
    return [{"status": r[0], "count": int(r[1])} for r in rows]


def _decrypt_agenda_items(db: Session, items: list[ClinicalSession]) -> list[dict]:
    """Decifra nome do paciente para a lista de hoje (no máx ~30 items)."""
    out = []
    for s in items:
        try:
            patient_name = patient_repo.decrypt_patient(s.patient).full_name if s.patient else "(paciente)"
        except Exception:
            patient_name = "(paciente)"
        out.append({
            "id": str(s.id),
            "patient_id": str(s.patient_id),
            "patient_name": patient_name,
            "doctor_id": s.doctor_id,
            "doctor_name": s.doctor.full_name if s.doctor else "",
            "scheduled_at": s.scheduled_at.isoformat(),
            "duration_minutes": s.duration_minutes,
            "status": s.status,
        })
    return out


def _birthdays_this_month(
    db: Session, *, company_id: int, limit: int = 12
) -> list[dict]:
    """Aniversariantes do mês corrente (decifra apenas N nomes)."""
    today = datetime.now(timezone.utc).date()
    rows = db.scalars(
        select(Patient)
        .where(
            Patient.company_id == company_id,
            extract("month", Patient.birth_date) == today.month,
            Patient.status == PatientStatus.ACTIVE.value,
        )
        .order_by(extract("day", Patient.birth_date).asc())
        .limit(limit)
    ).all()

    out = []
    for p in rows:
        try:
            dec = patient_repo.decrypt_patient(p)
            out.append({
                "id": str(p.id),
                "full_name": dec.full_name,
                "day": p.birth_date.day,
                "age_turning": today.year - p.birth_date.year,
                "gender": p.gender,
            })
        except Exception:
            continue
    return out


def _gender_distribution(db: Session, *, company_id: int) -> list[dict]:
    rows = db.execute(
        select(Patient.gender, func.count(Patient.id))
        .where(
            Patient.company_id == company_id,
            Patient.status == PatientStatus.ACTIVE.value,
        )
        .group_by(Patient.gender)
    ).all()
    return [{"gender": r[0] or "—", "count": int(r[1])} for r in rows]


def _patient_status_distribution(db: Session, *, company_id: int) -> list[dict]:
    rows = db.execute(
        select(Patient.status, func.count(Patient.id))
        .where(Patient.company_id == company_id)
        .group_by(Patient.status)
    ).all()
    return [{"status": r[0], "count": int(r[1])} for r in rows]


def _last_patients(db: Session, *, company_id: int, limit: int = 5) -> list[dict]:
    """Pacientes recém-cadastrados (sem decifrar — exibe iniciais + idade)."""
    today = datetime.now(timezone.utc).date()
    rows = db.scalars(
        select(Patient)
        .where(Patient.company_id == company_id)
        .order_by(Patient.created_at.desc())
        .limit(limit)
    ).all()
    out = []
    for p in rows:
        try:
            dec = patient_repo.decrypt_patient(p)
            initials = "".join(part[0] for part in dec.full_name.split()[:2]).upper()
            out.append({
                "id": str(p.id),
                "full_name": dec.full_name,
                "initials": initials,
                "age": today.year - p.birth_date.year,
                "gender": p.gender,
                "status": p.status,
                "created_at": p.created_at.isoformat() if p.created_at else None,
            })
        except Exception:
            continue
    return out


# ─────────────────────────────────────────────────────────────────────────
# Endpoint
# ─────────────────────────────────────────────────────────────────────────
@router.get("/me")
def my_dashboard(
    db: Session = Depends(get_db_with_tenant),
    user: User = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)
    today_start, today_end = _utc_today_bounds()
    week_start = today_start - timedelta(days=today_start.weekday())  # segunda
    week_end = week_start + timedelta(days=7)
    month_start = today_start.replace(day=1)
    next_30d = now + timedelta(days=30)
    last_30d = now - timedelta(days=30)

    # ── SUPER ADMIN ──
    if user.role == UserRole.SUPER_ADMIN.value:
        active_companies = db.scalar(
            select(func.count(Company.id)).where(Company.status == "active")
        ) or 0
        total_sessions = db.scalar(select(func.count(ClinicalSession.id))) or 0
        total_patients = db.scalar(select(func.count(Patient.id))) or 0
        total_doctors = db.scalar(select(func.count(Doctor.id))) or 0
        return {
            "kind": "super_admin",
            "active_companies": active_companies,
            "total_sessions": total_sessions,
            "total_patients": total_patients,
            "total_doctors": total_doctors,
        }

    company_id = user.company_id

    # ── DOCTOR ──
    if user.role == UserRole.DOCTOR.value and user.doctor:
        doctor_id = user.doctor.id

        # KPIs
        active_patients = db.scalar(
            select(func.count(func.distinct(ClinicalSession.patient_id)))
            .where(ClinicalSession.doctor_id == doctor_id)
        ) or 0
        sessions_today = db.scalar(
            select(func.count(ClinicalSession.id))
            .where(
                ClinicalSession.doctor_id == doctor_id,
                ClinicalSession.scheduled_at >= today_start,
                ClinicalSession.scheduled_at < today_end,
            )
        ) or 0
        sessions_week = db.scalar(
            select(func.count(ClinicalSession.id))
            .where(
                ClinicalSession.doctor_id == doctor_id,
                ClinicalSession.scheduled_at >= week_start,
                ClinicalSession.scheduled_at < week_end,
            )
        ) or 0
        completed_30d = db.scalar(
            select(func.count(ClinicalSession.id))
            .where(
                ClinicalSession.doctor_id == doctor_id,
                ClinicalSession.scheduled_at >= last_30d,
                ClinicalSession.scheduled_at < now,
                ClinicalSession.status == SessionStatus.COMPLETED.value,
            )
        ) or 0
        no_show_30d = db.scalar(
            select(func.count(ClinicalSession.id))
            .where(
                ClinicalSession.doctor_id == doctor_id,
                ClinicalSession.scheduled_at >= last_30d,
                ClinicalSession.scheduled_at < now,
                ClinicalSession.status == SessionStatus.NO_SHOW.value,
            )
        ) or 0
        attended_30d = completed_30d + no_show_30d
        adherence_rate = round((completed_30d / attended_30d) * 100, 1) if attended_30d else None

        # Agenda hoje (com nomes decifrados)
        today_sessions = db.scalars(
            select(ClinicalSession)
            .where(
                ClinicalSession.doctor_id == doctor_id,
                ClinicalSession.scheduled_at >= today_start,
                ClinicalSession.scheduled_at < today_end,
            )
            .order_by(ClinicalSession.scheduled_at)
        ).all()

        # Próximas (>= agora, próximas 7d)
        upcoming = db.scalars(
            select(ClinicalSession)
            .where(
                ClinicalSession.doctor_id == doctor_id,
                ClinicalSession.scheduled_at >= now,
                ClinicalSession.scheduled_at <= now + timedelta(days=7),
                ClinicalSession.status == SessionStatus.SCHEDULED.value,
            )
            .order_by(ClinicalSession.scheduled_at)
            .limit(8)
        ).all()

        return {
            "kind": "doctor",
            "doctor_name": user.doctor.full_name,
            "kpis": {
                "active_patients": active_patients,
                "sessions_today": sessions_today,
                "sessions_week": sessions_week,
                "completed_30d": completed_30d,
                "no_show_30d": no_show_30d,
                "adherence_rate": adherence_rate,
            },
            "today_agenda": _decrypt_agenda_items(db, list(today_sessions)),
            "upcoming_sessions": _decrypt_agenda_items(db, list(upcoming)),
            "sessions_by_day_14d": _sessions_by_day(db, company_id=company_id, doctor_id=doctor_id, days=14),
            "sessions_by_weekday_30d": _sessions_by_weekday(db, company_id=company_id, doctor_id=doctor_id, days=30),
            "status_distribution_30d": _status_distribution(db, company_id=company_id, doctor_id=doctor_id, days=30),
            "birthdays_this_month": _birthdays_this_month(db, company_id=company_id),
        }

    # ── CLINIC ADMIN / RECEPTIONIST ──
    # KPIs da clínica
    total_patients_active = db.scalar(
        select(func.count(Patient.id)).where(
            Patient.company_id == company_id,
            Patient.status == PatientStatus.ACTIVE.value,
        )
    ) or 0
    total_patients = db.scalar(
        select(func.count(Patient.id)).where(Patient.company_id == company_id)
    ) or 0
    new_patients_30d = db.scalar(
        select(func.count(Patient.id)).where(
            Patient.company_id == company_id,
            Patient.created_at >= last_30d,
        )
    ) or 0

    sessions_today = db.scalar(
        select(func.count(ClinicalSession.id))
        .where(
            ClinicalSession.company_id == company_id,
            ClinicalSession.scheduled_at >= today_start,
            ClinicalSession.scheduled_at < today_end,
        )
    ) or 0
    sessions_week = db.scalar(
        select(func.count(ClinicalSession.id))
        .where(
            ClinicalSession.company_id == company_id,
            ClinicalSession.scheduled_at >= week_start,
            ClinicalSession.scheduled_at < week_end,
        )
    ) or 0
    sessions_month = db.scalar(
        select(func.count(ClinicalSession.id))
        .where(
            ClinicalSession.company_id == company_id,
            ClinicalSession.scheduled_at >= month_start,
        )
    ) or 0
    no_show_30d = db.scalar(
        select(func.count(ClinicalSession.id))
        .where(
            ClinicalSession.company_id == company_id,
            ClinicalSession.scheduled_at >= last_30d,
            ClinicalSession.scheduled_at < now,
            ClinicalSession.status == SessionStatus.NO_SHOW.value,
        )
    ) or 0
    attended_30d = db.scalar(
        select(func.count(ClinicalSession.id))
        .where(
            ClinicalSession.company_id == company_id,
            ClinicalSession.scheduled_at >= last_30d,
            ClinicalSession.scheduled_at < now,
            ClinicalSession.status.in_([
                SessionStatus.COMPLETED.value,
                SessionStatus.NO_SHOW.value,
            ]),
        )
    ) or 0
    no_show_rate = round((no_show_30d / attended_30d) * 100, 1) if attended_30d else None

    # Ocupação por médico (mês corrente)
    by_doctor_rows = db.execute(
        select(Doctor.id, Doctor.full_name, Doctor.specialty, func.count(ClinicalSession.id))
        .join(ClinicalSession, ClinicalSession.doctor_id == Doctor.id)
        .where(
            ClinicalSession.company_id == company_id,
            ClinicalSession.scheduled_at >= month_start,
        )
        .group_by(Doctor.id, Doctor.full_name, Doctor.specialty)
        .order_by(func.count(ClinicalSession.id).desc())
        .limit(10)
    ).all()
    by_doctor = [
        {"doctor_id": r[0], "doctor": r[1], "specialty": r[2] or "", "sessions": int(r[3])}
        for r in by_doctor_rows
    ]

    # Sessões hoje (com nomes decifrados)
    today_sessions = db.scalars(
        select(ClinicalSession)
        .where(
            ClinicalSession.company_id == company_id,
            ClinicalSession.scheduled_at >= today_start,
            ClinicalSession.scheduled_at < today_end,
        )
        .order_by(ClinicalSession.scheduled_at)
    ).all()

    return {
        "kind": user.role,  # "clinic_admin" ou "receptionist"
        "company_id": company_id,
        "kpis": {
            "active_patients": total_patients_active,
            "total_patients": total_patients,
            "new_patients_30d": new_patients_30d,
            "sessions_today": sessions_today,
            "sessions_week": sessions_week,
            "sessions_month": sessions_month,
            "no_show_30d": no_show_30d,
            "no_show_rate": no_show_rate,
            "doctors_active": len(by_doctor),
        },
        "today_agenda": _decrypt_agenda_items(db, list(today_sessions)),
        "occupancy_by_doctor": by_doctor,
        "sessions_by_day_14d": _sessions_by_day(db, company_id=company_id, doctor_id=None, days=14),
        "sessions_by_weekday_30d": _sessions_by_weekday(db, company_id=company_id, doctor_id=None, days=30),
        "status_distribution_30d": _status_distribution(db, company_id=company_id, doctor_id=None, days=30),
        "patient_status_distribution": _patient_status_distribution(db, company_id=company_id),
        "gender_distribution": _gender_distribution(db, company_id=company_id),
        "birthdays_this_month": _birthdays_this_month(db, company_id=company_id),
        "last_patients": _last_patients(db, company_id=company_id, limit=5),
    }
