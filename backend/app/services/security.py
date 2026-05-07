"""
Hash de senha (bcrypt), JWT (access + refresh com rotação) e TOTP (2FA).

Decisões:
- bcrypt cost 12 (~250ms) — ataque offline 4 ordens de grandeza mais caro
  que SHA-256 puro. Trade-off de latência aceito.
- access token 15 min (claims: sub, role, tenant). Refresh 30 dias com
  rotação por família.
- TOTP 30s window 1 (aceita ±30s de drift do telefone).
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt
import pyotp

from app.config.settings import get_settings


# ---------- Senhas ----------
def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt(rounds=12)).decode()


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except ValueError:
        return False


# ---------- JWT ----------
def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def create_access_token(
    *, user_id: int, role: str, company_id: int | None, doctor_id: int | None = None
) -> tuple[str, datetime]:
    s = get_settings()
    exp = _now() + timedelta(minutes=s.access_token_minutes)
    payload = {
        "sub": str(user_id),
        "role": role,
        "tenant": company_id,
        "doctor_id": doctor_id,
        "iat": int(_now().timestamp()),
        "exp": int(exp.timestamp()),
        "iss": s.app_name,
        "type": "access",
    }
    return jwt.encode(payload, s.jwt_secret, algorithm=s.jwt_alg), exp


def decode_access_token(token: str) -> dict[str, Any]:
    s = get_settings()
    return jwt.decode(token, s.jwt_secret, algorithms=[s.jwt_alg], issuer=s.app_name)


# ---------- Refresh tokens ----------
def new_refresh_token() -> tuple[str, str, str]:
    """Retorna (raw_token, hash, family_id). Hash é o que vai pro banco."""
    raw = secrets.token_urlsafe(48)
    h = hashlib.sha256(raw.encode()).hexdigest()
    family = uuid.uuid4().hex
    return raw, h, family


def hash_refresh(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


# ---------- TOTP / 2FA ----------
def new_totp_secret() -> str:
    """Base32 (compatível com Google Authenticator)."""
    return pyotp.random_base32()


def totp_provisioning_uri(secret: str, account_email: str) -> str:
    s = get_settings()
    return pyotp.TOTP(secret).provisioning_uri(name=account_email, issuer_name=s.totp_issuer)


def verify_totp(secret: str, code: str) -> bool:
    return pyotp.TOTP(secret).verify(code, valid_window=1)
