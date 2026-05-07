"""
FastAPI dependencies — get_db, get_current_user, RBAC guards.

Fluxo crítico de tenant:
  1. Bearer token chega no header Authorization
  2. decode_access_token → user_id, role, tenant_id
  3. Abre sessão do banco
  4. Imediatamente seta SET LOCAL app.tenant_id/app.user_role/app.user_id
  5. A partir desse ponto, qualquer query passa pelas políticas RLS

Se o usuário tentar acessar dados de outro tenant via parâmetro de URL,
o RLS retornará 0 linhas (não 403). É proposital — não vazamos
existência. O endpoint trata 404.
"""
from __future__ import annotations

from typing import Iterator

import jwt
from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.config.database import SessionLocal, set_tenant_context
from app.models import User
from app.models.enums import UserRole
from app.services.security import decode_access_token


bearer = HTTPBearer(auto_error=False)


def get_db_raw() -> Iterator[Session]:
    """DB sem tenant context — só para login/super-admin/health."""
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _get_token_payload(creds: HTTPAuthorizationCredentials | None) -> dict:
    if creds is None or creds.scheme.lower() != "bearer":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Bearer token ausente")
    try:
        return decode_access_token(creds.credentials)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token expirado")
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token inválido")


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db_raw),
) -> User:
    payload = _get_token_payload(creds)
    if payload.get("type") != "access":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Tipo de token inválido")
    user_id = int(payload["sub"])
    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Usuário inativo")
    # Anexa metadados do token p/ middleware de auditoria
    user._jwt_payload = payload  # type: ignore[attr-defined]
    return user


def get_db_with_tenant(
    user: User = Depends(get_current_user),
) -> Iterator[Session]:
    """Sessão DB já com tenant context aplicado pelas políticas RLS."""
    db = SessionLocal()
    try:
        # Para super_admin sem tenant, tenant_id pode ser None — RLS bypass via role
        tenant_id = (
            getattr(user, "_jwt_payload", {}).get("tenant")
            or user.company_id
        )
        set_tenant_context(
            db,
            tenant_id=tenant_id,
            user_id=user.id,
            user_role=user.role,
        )
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


# ---------- RBAC guards ----------
def require_role(*allowed: UserRole):
    """Dependency factory: require_role(UserRole.DOCTOR, UserRole.CLINIC_ADMIN)."""
    allowed_values = {r.value for r in allowed}

    def _guard(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed_values:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"Role '{user.role}' não autorizada. Requer uma de: {', '.join(allowed_values)}",
            )
        return user

    return _guard


def require_clinic_member(user: User = Depends(get_current_user)) -> User:
    """Qualquer perfil com vínculo de clínica (não super-admin)."""
    if user.role == UserRole.SUPER_ADMIN.value:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Super-admin não opera no escopo da clínica"
        )
    if user.company_id is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Usuário sem clínica vinculada")
    return user


def get_request_meta(request: Request) -> dict:
    """Extrai IP/User-Agent para audit log."""
    forwarded = request.headers.get("x-forwarded-for")
    ip = forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else None)
    return {
        "ip_address": ip,
        "user_agent": request.headers.get("user-agent"),
        "http_method": request.method,
        "http_path": str(request.url.path),
    }
