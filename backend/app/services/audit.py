"""
Service de auditoria — chamado pelo middleware HTTP e por handlers
explícitos quando ações sensíveis acontecem fora do request cycle (ex:
re-cifragem de chave em background).

Regra de ouro: audit_log NUNCA falha o request principal. Se o insert do
log dá erro, gravamos warning no logger estruturado e seguimos. Em prod,
o logger envia para um sink imutável (ex: Loki + S3 com Object Lock).
"""
from __future__ import annotations

import logging
import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy.orm import Session

from app.models import AuditLog
from app.models.enums import AuditAction

logger = logging.getLogger("psiclinic.audit")


def _jsonable(v: Any) -> Any:
    """Converte tipos não-JSON-serializáveis para forma persistável em JSONB.

    Cobre os casos mais comuns que aparecem em payload_diff:
      - datetime/date → ISO 8601 string
      - UUID → str
      - bytes → omitido (`<bytes>`) — nunca persistir bytes em audit_log
      - dict/list → recursivo
      - enum → .value (quem chamou geralmente já fez isso, mas defensivo)
    """
    if v is None or isinstance(v, (str, int, float, bool)):
        return v
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    if isinstance(v, uuid.UUID):
        return str(v)
    if isinstance(v, bytes):
        return "<bytes>"
    if isinstance(v, dict):
        return {str(k): _jsonable(val) for k, val in v.items()}
    if isinstance(v, (list, tuple, set)):
        return [_jsonable(x) for x in v]
    if hasattr(v, "value") and not isinstance(v, type):  # enum-like
        return _jsonable(v.value)
    return str(v)


def write_audit(
    db: Session,
    *,
    company_id: int | None,
    user_id: int | None,
    action: AuditAction | str,
    entity_type: str,
    entity_id: str | None = None,
    patient_id: Any | None = None,
    http_method: str | None = None,
    http_path: str | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    payload_diff: dict | None = None,
    status_code: int | None = None,
    error_message: str | None = None,
    autocommit: bool = False,
) -> None:
    """Insere uma linha de audit log."""
    try:
        action_value = action.value if hasattr(action, "value") else str(action)
        # Sanitiza payload_diff — JSONB rejeita datetime/date/UUID/bytes nativos.
        safe_diff = _jsonable(payload_diff) if payload_diff is not None else None
        log = AuditLog(
            company_id=company_id,
            user_id=user_id,
            patient_id=patient_id,
            action=action_value,
            entity_type=entity_type,
            entity_id=str(entity_id) if entity_id is not None else None,
            http_method=http_method,
            http_path=http_path,
            ip_address=ip_address,
            user_agent=user_agent,
            payload_diff=safe_diff,
            status_code=status_code,
            error_message=error_message,
        )
        db.add(log)
        if autocommit:
            db.commit()
        else:
            db.flush()
    except Exception as exc:  # nunca derruba o fluxo principal
        logger.error("audit_write_failed", extra={"err": str(exc)})


def diff_dict(old: dict, new: dict) -> dict:
    """Retorna {field: {'old': ..., 'new': ...}} sem valores cifrados.
    Apenas registra que campos cifrados mudaram, sem o valor.
    Sanitiza datetimes/UUIDs/etc para que o resultado seja JSON-serializável.
    """
    encrypted_fields = {f for f in old.keys() | new.keys() if f.endswith("_enc") or f.endswith("_iv")}
    out: dict[str, dict[str, Any]] = {}
    for key in old.keys() | new.keys():
        if old.get(key) == new.get(key):
            continue
        if key in encrypted_fields:
            out[key.replace("_enc", "").replace("_iv", "")] = {"changed": True}
        else:
            out[key] = {"old": _jsonable(old.get(key)), "new": _jsonable(new.get(key))}
    return out
