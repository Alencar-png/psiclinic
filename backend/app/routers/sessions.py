"""
Bloco de sessões — núcleo do sistema.

GET    /patients/{pid}/sessions            — timeline (paginada)
POST   /patients/{pid}/sessions            — agendar/registrar
GET    /sessions/{sid}                     — detalhe (decifra observação)
PATCH  /sessions/{sid}                     — atualiza meta (status, scheduled_at, etc.)
PUT    /sessions/{sid}/observations        — atualiza observação (auto-save)
POST   /sessions/{sid}/lock                — bloqueia manualmente
POST   /sessions/{sid}/addendum            — cria sessão filha após lock
GET    /sessions/search?q=...              — busca FTS nas observações da clínica
"""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.middleware.deps import (
    get_current_user,
    get_db_with_tenant,
    get_request_meta,
    require_clinic_member,
)
from app.models import ClinicalSession, Doctor, Patient, User
from app.models.enums import AuditAction, SessionStatus, UserRole
from app.repositories import patient_repo, session_repo
from app.schemas.common import Page
from app.schemas.session import (
    AgendaItem,
    SessionCreate,
    SessionDetail,
    SessionListItem,
    SessionObservationsUpdate,
    SessionSearchHit,
    SessionUpdate,
)
from app.services import audit

# Dois prefixos: rotas aninhadas em /patients/{pid} e rotas planas em /sessions
patients_router = APIRouter(prefix="/patients/{patient_id}/sessions", tags=["sessions"])
sessions_router = APIRouter(prefix="/sessions", tags=["sessions"])


def _ensure_doctor_or_admin(user: User) -> None:
    if user.role not in (
        UserRole.DOCTOR.value,
        UserRole.CLINIC_ADMIN.value,
        UserRole.RECEPTIONIST.value,
    ):
        raise HTTPException(403, "Sem permissão")


def _doctor_id_for_user(user: User) -> int | None:
    return user.doctor.id if user.doctor else None


@patients_router.get("", response_model=Page[SessionListItem])
def list_patient_sessions(
    patient_id: UUID,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db_with_tenant),
    user: User = Depends(require_clinic_member),
):
    p = db.get(Patient, patient_id)
    if not p:
        raise HTTPException(404, "Paciente não encontrado")
    items, total = session_repo.list_by_patient(db, patient_id=patient_id, page=page, size=size)
    out = [
        SessionListItem(
            id=s.id,
            scheduled_at=s.scheduled_at,
            duration_minutes=s.duration_minutes,
            status=SessionStatus(s.status),
            doctor_name=s.doctor.full_name if s.doctor else "",
            locked_at=s.locked_at,
        )
        for s in items
    ]
    return Page[SessionListItem](items=out, total=total, page=page, size=size)


@patients_router.post("", response_model=SessionDetail, status_code=201)
def create_session(
    patient_id: UUID,
    body: SessionCreate,
    request: Request,
    db: Session = Depends(get_db_with_tenant),
    user: User = Depends(require_clinic_member),
):
    if str(body.patient_id) != str(patient_id):
        raise HTTPException(400, "patient_id no body não bate com URL")

    p = db.get(Patient, patient_id)
    if not p:
        raise HTTPException(404, "Paciente não encontrado")

    doctor_id = body.doctor_id or _doctor_id_for_user(user)
    if not doctor_id:
        raise HTTPException(400, "doctor_id obrigatório (ou autentique-se como médico)")

    s = session_repo.create_session(
        db,
        company_id=p.company_id,
        patient_id=patient_id,
        doctor_id=doctor_id,
        scheduled_at=body.scheduled_at,
        duration_minutes=body.duration_minutes,
        status=body.status,
    )
    audit.write_audit(
        db, company_id=p.company_id, user_id=user.id,
        action=AuditAction.CREATE, entity_type="clinical_session",
        entity_id=str(s.id), patient_id=patient_id,
        **get_request_meta(request), status_code=201,
    )
    return _to_detail(db, s)


# ── ROTAS COM PATH ESPECÍFICO precisam vir ANTES de /{session_id} ──

@sessions_router.get("", response_model=list[AgendaItem])
def list_agenda(
    request: Request,
    from_: datetime = Query(..., alias="from", description="ISO datetime — início do range (inclusivo)"),
    to: datetime = Query(...,            description="ISO datetime — fim do range (exclusivo)"),
    doctor_id: int | None = Query(None, description="Filtra por médico (admin)"),
    status: SessionStatus | None = Query(None, description="Filtra por status"),
    db: Session = Depends(get_db_with_tenant),
    user: User = Depends(require_clinic_member),
):
    """Agenda — sessões num range. Médico vê só as suas; admin vê todas.
    Decifra nome do paciente para exibição."""
    if user.role == UserRole.DOCTOR.value and user.doctor:
        effective_doctor_id = user.doctor.id
    else:
        effective_doctor_id = doctor_id

    items = session_repo.list_in_range(
        db,
        company_id=user.company_id,
        from_dt=from_,
        to_dt=to,
        doctor_id=effective_doctor_id,
        status=status.value if status else None,
    )

    out: list[AgendaItem] = []
    for s in items:
        try:
            patient_name = patient_repo.decrypt_patient(s.patient).full_name
        except Exception:
            patient_name = "(paciente)"
        out.append(AgendaItem(
            id=s.id,
            scheduled_at=s.scheduled_at,
            duration_minutes=s.duration_minutes,
            status=SessionStatus(s.status),
            doctor_id=s.doctor_id,
            doctor_name=s.doctor.full_name if s.doctor else "",
            patient_id=s.patient_id,
            patient_name=patient_name,
            locked_at=s.locked_at,
        ))
    return out


@sessions_router.get("/search", response_model=list[SessionSearchHit])
def search_observations(
    q: str = Query(min_length=3),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=50),
    db: Session = Depends(get_db_with_tenant),
    user: User = Depends(require_clinic_member),
):
    if user.role not in (UserRole.DOCTOR.value, UserRole.SUPER_ADMIN.value):
        raise HTTPException(403, "Apenas médicos podem buscar em observações")
    rows = session_repo.search_observations(
        db, company_id=user.company_id, query=q, page=page, size=size,
    )
    out: list[SessionSearchHit] = []
    for r in rows:
        s = session_repo.get_session(db, session_id=r["id"])
        if not s:
            continue
        plain = session_repo.decrypt_observations(s) or ""
        idx = plain.lower().find(q.lower())
        snippet = (plain[max(0, idx - 60): idx + 60] if idx >= 0 else plain[:200]).strip()
        patient = db.get(Patient, s.patient_id)
        patient_name = patient_repo.decrypt_patient(patient).full_name if patient else ""
        out.append(SessionSearchHit(
            id=s.id, patient_id=s.patient_id, patient_name=patient_name,
            scheduled_at=s.scheduled_at, snippet=snippet, rank=float(r["rank"] or 0),
        ))
    return out


# ── ROTAS COM PARÂMETRO DE PATH ──

@sessions_router.get("/{session_id}", response_model=SessionDetail)
def get_session(
    session_id: UUID,
    request: Request,
    db: Session = Depends(get_db_with_tenant),
    user: User = Depends(require_clinic_member),
):
    s = session_repo.get_session(db, session_id=session_id)
    if not s:
        raise HTTPException(404, "Sessão não encontrada")
    audit.write_audit(
        db, company_id=s.company_id, user_id=user.id,
        action=AuditAction.READ, entity_type="clinical_session",
        entity_id=str(s.id), patient_id=s.patient_id,
        **get_request_meta(request), status_code=200,
    )
    return _to_detail(db, s, include_obs=user.role in (UserRole.DOCTOR.value, UserRole.SUPER_ADMIN.value))


@sessions_router.patch("/{session_id}", response_model=SessionDetail)
def update_session(
    session_id: UUID,
    body: SessionUpdate,
    request: Request,
    db: Session = Depends(get_db_with_tenant),
    user: User = Depends(require_clinic_member),
):
    s = session_repo.get_session(db, session_id=session_id)
    if not s:
        raise HTTPException(404, "Sessão não encontrada")

    payload = body.model_dump(exclude_unset=True)
    for k, v in payload.items():
        setattr(s, k, v.value if hasattr(v, "value") else v)
    db.flush()

    audit.write_audit(
        db, company_id=s.company_id, user_id=user.id,
        action=AuditAction.UPDATE, entity_type="clinical_session",
        entity_id=str(s.id), patient_id=s.patient_id,
        payload_diff={k: {"new": v if not hasattr(v, "value") else v.value} for k, v in payload.items()},
        **get_request_meta(request), status_code=200,
    )
    return _to_detail(db, s, include_obs=user.role == UserRole.DOCTOR.value)


@sessions_router.put("/{session_id}/observations", response_model=SessionDetail)
def update_observations(
    session_id: UUID,
    body: SessionObservationsUpdate,
    request: Request,
    autosave: bool = Query(False, description="Se true, marca como auto-save (não bumpa updated_at)"),
    db: Session = Depends(get_db_with_tenant),
    user: User = Depends(require_clinic_member),
):
    if user.role != UserRole.DOCTOR.value:
        raise HTTPException(403, "Apenas médicos editam observações clínicas")
    s = session_repo.get_session(db, session_id=session_id)
    if not s:
        raise HTTPException(404, "Sessão não encontrada")
    try:
        session_repo.update_observations(
            db, session=s, html=body.observations_html, plain=body.observations_plain, autosave=autosave
        )
    except ValueError as e:
        raise HTTPException(409, str(e))

    audit.write_audit(
        db, company_id=s.company_id, user_id=user.id,
        action="autosave" if autosave else AuditAction.UPDATE,
        entity_type="clinical_session_observations",
        entity_id=str(s.id), patient_id=s.patient_id,
        **get_request_meta(request), status_code=200,
    )
    db.refresh(s)
    return _to_detail(db, s, include_obs=True)


@sessions_router.post("/{session_id}/start", response_model=SessionDetail)
def start_session(
    session_id: UUID,
    request: Request,
    db: Session = Depends(get_db_with_tenant),
    user: User = Depends(require_clinic_member),
):
    """Iniciar sessão (eventualmente antecipada) — muda status para in_progress."""
    if user.role != UserRole.DOCTOR.value:
        raise HTTPException(403, "Apenas médicos podem iniciar a sessão")
    s = session_repo.get_session(db, session_id=session_id)
    if not s:
        raise HTTPException(404, "Sessão não encontrada")
    if s.status not in (SessionStatus.SCHEDULED.value, SessionStatus.IN_PROGRESS.value):
        raise HTTPException(400, f"Sessão com status '{s.status}' não pode ser iniciada")
    if s.locked_at:
        raise HTTPException(409, "Sessão bloqueada — crie um adendo")
    s.status = SessionStatus.IN_PROGRESS.value
    db.flush()
    audit.write_audit(
        db, company_id=s.company_id, user_id=user.id,
        action="start", entity_type="clinical_session",
        entity_id=str(s.id), patient_id=s.patient_id,
        payload_diff={"status": {"new": s.status}},
        **get_request_meta(request), status_code=200,
    )
    return _to_detail(db, s, include_obs=True)


@sessions_router.get("/{session_id}/history")
def get_session_history(
    session_id: UUID,
    db: Session = Depends(get_db_with_tenant),
    user: User = Depends(require_clinic_member),
):
    """
    Histórico de alterações — lê audit_logs filtrados.
    Cobre: criação, reagendamentos, mudanças de status, edições de observações,
    lock/adendos. Mostrado no painel lateral da sessão para auditoria visível.
    """
    from sqlalchemy import or_, select as _select
    from app.models import AuditLog, User as UserModel

    s = session_repo.get_session(db, session_id=session_id)
    if not s:
        raise HTTPException(404, "Sessão não encontrada")

    sid_str = str(session_id)
    # Filtra somente ações de modificação — READs poluiriam o histórico do usuário
    # (ainda ficam registradas em audit_logs para compliance/relatórios admin).
    MODIFICATION_ACTIONS = ("create", "update", "delete", "start", "addendum", "lock", "autosave")
    rows = db.scalars(
        _select(AuditLog)
        .where(
            or_(
                (AuditLog.entity_type == "clinical_session") & (AuditLog.entity_id == sid_str),
                (AuditLog.entity_type == "clinical_session_observations") & (AuditLog.entity_id == sid_str),
            ),
            AuditLog.action.in_(MODIFICATION_ACTIONS),
        )
        .order_by(AuditLog.occurred_at.asc())
    ).all()

    # Lookup nomes dos usuários (cache local)
    user_ids = {r.user_id for r in rows if r.user_id}
    users = {u.id: u.full_name for u in db.scalars(_select(UserModel).where(UserModel.id.in_(user_ids))).all()} if user_ids else {}

    # Agrupa auto-saves consecutivos (mesmo usuário, janela de 5 min) em uma única entrada
    from datetime import timedelta
    out: list[dict] = []
    autosave_window = timedelta(minutes=5)
    for r in rows:
        is_autosave = (r.action == "autosave")
        if is_autosave and out:
            last = out[-1]
            if (
                last.get("action") == "autosave_group"
                and last.get("user_id") == r.user_id
                and (r.occurred_at - last["last_at"]) <= autosave_window
            ):
                last["count"] = last.get("count", 1) + 1
                last["last_at"] = r.occurred_at
                continue
            elif last.get("action") == "autosave" and last.get("user_id") == r.user_id and (r.occurred_at - last["occurred_at"]) <= autosave_window:
                # Promove a entrada anterior para "autosave_group"
                last["action"] = "autosave_group"
                last["count"] = 2
                last["last_at"] = r.occurred_at
                continue
        out.append({
            "id": r.id,
            "action": r.action,
            "entity_type": r.entity_type,
            "user_id": r.user_id,
            "user_name": users.get(r.user_id),
            "occurred_at": r.occurred_at,
            "payload_diff": r.payload_diff,
        })
    return out


@sessions_router.post("/{session_id}/lock", response_model=SessionDetail)
def lock_session(
    session_id: UUID,
    db: Session = Depends(get_db_with_tenant),
    user: User = Depends(require_clinic_member),
):
    if user.role not in (UserRole.DOCTOR.value, UserRole.CLINIC_ADMIN.value):
        raise HTTPException(403, "Sem permissão")
    s = session_repo.get_session(db, session_id=session_id)
    if not s:
        raise HTTPException(404, "Sessão não encontrada")
    if s.locked_at:
        raise HTTPException(400, "Já bloqueada")
    s.locked_at = datetime.now(timezone.utc)
    db.flush()
    return _to_detail(db, s, include_obs=user.role == UserRole.DOCTOR.value)


@sessions_router.post("/{session_id}/addendum", response_model=SessionDetail, status_code=201)
def create_addendum(
    session_id: UUID,
    body: SessionObservationsUpdate,
    request: Request,
    db: Session = Depends(get_db_with_tenant),
    user: User = Depends(require_clinic_member),
):
    if user.role != UserRole.DOCTOR.value:
        raise HTTPException(403, "Apenas médicos adicionam adendos")
    parent = session_repo.get_session(db, session_id=session_id)
    if not parent:
        raise HTTPException(404, "Sessão pai não encontrada")
    if not parent.locked_at:
        raise HTTPException(400, "Adendos só fazem sentido em sessões bloqueadas")

    addendum = session_repo.create_session(
        db,
        company_id=parent.company_id,
        patient_id=parent.patient_id,
        doctor_id=user.doctor.id,
        scheduled_at=datetime.now(timezone.utc),
        duration_minutes=0,
        status=SessionStatus.COMPLETED,
    )
    addendum.parent_session_id = parent.id
    db.flush()
    session_repo.update_observations(
        db, session=addendum, html=body.observations_html, plain=body.observations_plain
    )
    db.refresh(addendum)
    audit.write_audit(
        db, company_id=parent.company_id, user_id=user.id,
        action="addendum", entity_type="clinical_session",
        entity_id=str(addendum.id), patient_id=parent.patient_id,
        payload_diff={"parent_session_id": {"new": str(parent.id)}},
        **get_request_meta(request), status_code=201,
    )
    return _to_detail(db, addendum, include_obs=True)


def _to_detail(db: Session, s: ClinicalSession, *, include_obs: bool = False) -> SessionDetail:
    d = db.get(Doctor, s.doctor_id)
    obs = session_repo.decrypt_observations(s) if include_obs else None
    return SessionDetail(
        id=s.id,
        patient_id=s.patient_id,
        doctor_id=s.doctor_id,
        doctor_name=d.full_name if d else "",
        scheduled_at=s.scheduled_at,
        duration_minutes=s.duration_minutes,
        status=SessionStatus(s.status),
        observations_html=obs,
        next_session_suggestion=s.next_session_suggestion,
        locked_at=s.locked_at,
        parent_session_id=s.parent_session_id,
        created_at=s.created_at,
        updated_at=s.updated_at,
        last_autosaved_at=s.last_autosaved_at,
    )
