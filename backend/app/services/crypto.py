"""
Camada de criptografia em repouso.

Modelo:
  - 1 master key em env (rotacionável). Nunca toca disco.
  - Por tenant, deriva uma DEK via HKDF-SHA256(salt=company_id, info="psiclinic-v{n}").
  - Cifragem AES-256-GCM. IV 96 bits aleatório por linha. AAD = "table|column|row_id"
    (impede swap de ciphertext entre linhas/tabelas).
  - Cache de DEKs em memória LRU (chave por (company_id, key_version)) com TTL 1h.

Para CPF (busca exata sem decifrar): HMAC-SHA256(master_hmac_key, cpf_digits).
"""
from __future__ import annotations

import base64
import hmac
import json
import os
import threading
import time
from dataclasses import dataclass
from hashlib import sha256
from typing import Any

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes

from app.config.settings import get_settings


_DEK_CACHE: dict[tuple[int, int], tuple[bytes, float]] = {}
_CACHE_LOCK = threading.Lock()
_CACHE_TTL = 3600  # 1h


@dataclass
class EncryptedField:
    ciphertext: bytes
    iv: bytes
    key_version: int


def _master_key() -> bytes:
    s = get_settings()
    if not s.master_encryption_key_b64:
        raise RuntimeError(
            "MASTER_ENCRYPTION_KEY_B64 não configurada. "
            "Gere com: python -c \"import os, base64; print(base64.b64encode(os.urandom(32)).decode())\""
        )
    return base64.b64decode(s.master_encryption_key_b64)


def _hmac_key() -> bytes:
    """Chave HMAC para hash determinístico de CPF — derivada do master."""
    return HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=b"psiclinic-hmac-salt",
        info=b"psiclinic-hmac-v1",
    ).derive(_master_key())


def _derive_tenant_dek(company_id: int, key_version: int) -> bytes:
    """HKDF — 32 bytes (AES-256)."""
    salt = f"tenant-{company_id}".encode()
    info = f"psiclinic-v{key_version}".encode()
    return HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        info=info,
    ).derive(_master_key())


def get_tenant_dek(company_id: int, key_version: int | None = None) -> tuple[bytes, int]:
    """Retorna (dek, key_version_efetiva). Usa cache LRU simples."""
    s = get_settings()
    kv = key_version or s.encryption_key_version

    cache_key = (company_id, kv)
    now = time.monotonic()
    with _CACHE_LOCK:
        cached = _DEK_CACHE.get(cache_key)
        if cached and now - cached[1] < _CACHE_TTL:
            return cached[0], kv

    dek = _derive_tenant_dek(company_id, kv)
    with _CACHE_LOCK:
        _DEK_CACHE[cache_key] = (dek, now)
        # Limita o cache a 1024 entradas (defensivo)
        if len(_DEK_CACHE) > 1024:
            oldest = min(_DEK_CACHE.items(), key=lambda kv2: kv2[1][1])[0]
            _DEK_CACHE.pop(oldest, None)
    return dek, kv


def encrypt_str(
    plaintext: str | None,
    *,
    company_id: int,
    aad: str,
    key_version: int | None = None,
) -> EncryptedField | None:
    if plaintext is None:
        return None
    dek, kv = get_tenant_dek(company_id, key_version)
    iv = os.urandom(12)
    ct = AESGCM(dek).encrypt(iv, plaintext.encode("utf-8"), aad.encode("utf-8"))
    return EncryptedField(ciphertext=ct, iv=iv, key_version=kv)


def decrypt_str(
    ciphertext: bytes | None,
    iv: bytes | None,
    *,
    company_id: int,
    aad: str,
    key_version: int | None = None,
) -> str | None:
    if ciphertext is None or iv is None:
        return None
    dek, _ = get_tenant_dek(company_id, key_version)
    pt = AESGCM(dek).decrypt(iv, ciphertext, aad.encode("utf-8"))
    return pt.decode("utf-8")


def encrypt_json(
    obj: Any,
    *,
    company_id: int,
    aad: str,
    key_version: int | None = None,
) -> EncryptedField | None:
    if obj is None:
        return None
    return encrypt_str(json.dumps(obj, ensure_ascii=False), company_id=company_id, aad=aad, key_version=key_version)


def decrypt_json(
    ciphertext: bytes | None,
    iv: bytes | None,
    *,
    company_id: int,
    aad: str,
    key_version: int | None = None,
) -> Any:
    s = decrypt_str(ciphertext, iv, company_id=company_id, aad=aad, key_version=key_version)
    return json.loads(s) if s else None


def hmac_cpf(cpf_digits: str) -> str:
    """Hash determinístico para busca exata sem decifrar — só dígitos."""
    only_digits = "".join(c for c in cpf_digits if c.isdigit())
    return hmac.new(_hmac_key(), only_digits.encode(), sha256).hexdigest()
