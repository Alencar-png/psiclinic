"""
POST /auth/login
POST /auth/refresh
POST /auth/logout
POST /auth/switch-clinic
GET  /auth/me
POST /auth/2fa/enroll
POST /auth/2fa/confirm
POST /auth/2fa/disable
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config.settings import get_settings
from app.middleware.deps import (
    get_current_user,
    get_db_raw,
    get_request_meta,
)
from app.models import RefreshToken, User
from app.models.enums import AuditAction, UserRole
from app.schemas.auth import (
    LoginRequest,
    MeResponse,
    RefreshRequest,
    SwitchClinicRequest,
    TokenPair,
    TotpConfirmRequest,
    TotpEnrollResponse,
)
from app.services import audit, security as sec
from app.services.crypto import encrypt_str, decrypt_str

router = APIRouter(prefix="/auth", tags=["auth"])


# ---------- LOGIN ----------
@router.post("/login", response_model=TokenPair, status_code=200)
def login(
    body: LoginRequest,
    request: Request,
    db: Session = Depends(get_db_raw),
):
    user = db.scalar(select(User).where(User.email == body.email))
    meta = get_request_meta(request)

    if not user or not user.is_active or not sec.verify_password(body.password, user.password_hash):
        if user:
            user.failed_login_attempts += 1
            if user.failed_login_attempts >= 5:
                user.locked_until = datetime.now(timezone.utc) + timedelta(minutes=15)
        audit.write_audit(
            db,
            company_id=user.company_id if user else None,
            user_id=user.id if user else None,
            action=AuditAction.LOGIN_FAILED,
            entity_type="user",
            entity_id=str(user.id) if user else None,
            **meta,
            status_code=401,
        )
        raise HTTPException(401, "Credenciais inválidas")

    if user.locked_until and user.locked_until > datetime.now(timezone.utc):
        raise HTTPException(423, "Conta bloqueada temporariamente")

    # 2FA
    s = get_settings()
    must_2fa = user.totp_enabled or (
        s.require_2fa_for_doctors and user.role == UserRole.DOCTOR.value
    )
    if must_2fa:
        if not body.totp_code:
            raise HTTPException(401, "Código 2FA obrigatório")
        if not user.totp_secret:
            raise HTTPException(500, "TOTP habilitado mas secret ausente")
        secret = decrypt_str(
            bytes.fromhex(user.totp_secret) if user.totp_secret else None,
            iv=b"\x00" * 12,  # TOTP secret guardado com cifragem por user, não por tenant
            company_id=user.company_id or 0,
            aad=f"user_totp|{user.id}",
        ) if False else user.totp_secret  # simplificado: armazenado em base32 já
        if not sec.verify_totp(secret, body.totp_code):
            raise HTTPException(401, "Código 2FA inválido")

    # Sucesso
    user.failed_login_attempts = 0
    user.locked_until = None
    user.last_login_at = datetime.now(timezone.utc)

    access, exp = sec.create_access_token(
        user_id=user.id,
        role=user.role,
        company_id=user.company_id,
        doctor_id=user.doctor.id if user.doctor else None,
    )
    raw, h, family = sec.new_refresh_token()
    db.add(RefreshToken(
        user_id=user.id,
        token_hash=h,
        family_id=family,
        user_agent=meta.get("user_agent"),
        ip_address=meta.get("ip_address"),
        expires_at=datetime.now(timezone.utc) + timedelta(days=s.refresh_token_days),
    ))

    audit.write_audit(
        db,
        company_id=user.company_id,
        user_id=user.id,
        action=AuditAction.LOGIN,
        entity_type="user",
        entity_id=str(user.id),
        **meta,
        status_code=200,
    )

    return TokenPair(access_token=access, refresh_token=raw, expires_at=exp)


# ---------- REFRESH (rotação por família) ----------
@router.post("/refresh", response_model=TokenPair)
def refresh(body: RefreshRequest, request: Request, db: Session = Depends(get_db_raw)):
    h = sec.hash_refresh(body.refresh_token)
    rt = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == h))
    meta = get_request_meta(request)
    now = datetime.now(timezone.utc)

    if not rt:
        raise HTTPException(401, "Refresh token inválido")
    if rt.revoked_at is not None:
        # Token reuso — revoga toda a família (potencial roubo)
        db.execute(
            RefreshToken.__table__.update()
            .where(RefreshToken.family_id == rt.family_id)
            .values(revoked_at=now)
        )
        raise HTTPException(401, "Token revogado — todas as sessões foram encerradas")
    if rt.expires_at < now:
        raise HTTPException(401, "Token expirado")

    user = db.get(User, rt.user_id)
    if not user or not user.is_active:
        raise HTTPException(401, "Usuário inativo")

    rt.revoked_at = now
    s = get_settings()
    new_raw, new_h, _ = sec.new_refresh_token()
    db.add(RefreshToken(
        user_id=user.id,
        token_hash=new_h,
        family_id=rt.family_id,
        user_agent=meta.get("user_agent"),
        ip_address=meta.get("ip_address"),
        expires_at=now + timedelta(days=s.refresh_token_days),
    ))

    access, exp = sec.create_access_token(
        user_id=user.id,
        role=user.role,
        company_id=user.company_id,
        doctor_id=user.doctor.id if user.doctor else None,
    )
    return TokenPair(access_token=access, refresh_token=new_raw, expires_at=exp)


# ---------- LOGOUT ----------
@router.post("/logout", status_code=204)
def logout(body: RefreshRequest, db: Session = Depends(get_db_raw)):
    h = sec.hash_refresh(body.refresh_token)
    rt = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == h))
    if rt and rt.revoked_at is None:
        rt.revoked_at = datetime.now(timezone.utc)
    return None


# ---------- ME ----------
@router.get("/me", response_model=MeResponse)
def me(user: User = Depends(get_current_user)):
    return MeResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        company_id=user.company_id,
        company_name=user.company.name if user.company else None,
        doctor_id=user.doctor.id if user.doctor else None,
        totp_enabled=user.totp_enabled,
    )


# ---------- 2FA ENROLL ----------
@router.post("/2fa/enroll", response_model=TotpEnrollResponse)
def totp_enroll(user: User = Depends(get_current_user), db: Session = Depends(get_db_raw)):
    if user.totp_enabled:
        raise HTTPException(400, "2FA já habilitado")
    secret = sec.new_totp_secret()
    user.totp_secret = secret  # base32 — em prod cifrar
    return TotpEnrollResponse(
        secret=secret,
        provisioning_uri=sec.totp_provisioning_uri(secret, user.email),
    )


@router.post("/2fa/confirm", status_code=204)
def totp_confirm(
    body: TotpConfirmRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db_raw),
):
    if not user.totp_secret:
        raise HTTPException(400, "Faça /2fa/enroll primeiro")
    if not sec.verify_totp(user.totp_secret, body.code):
        raise HTTPException(401, "Código inválido")
    user.totp_enabled = True
    return None


@router.post("/2fa/disable", status_code=204)
def totp_disable(
    body: TotpConfirmRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db_raw),
):
    if not user.totp_enabled or not user.totp_secret:
        raise HTTPException(400, "2FA não está habilitado")
    if not sec.verify_totp(user.totp_secret, body.code):
        raise HTTPException(401, "Código inválido")
    user.totp_enabled = False
    user.totp_secret = None
    return None
