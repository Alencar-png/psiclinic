"""
Configuração central — lê do ambiente. Usado por auth, crypto e schedulers.

Em produção, popule via Docker secrets ou KMS.
"""
from __future__ import annotations

import os
from functools import lru_cache
from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # --- App ---
    app_name: str = "PsiClinic"
    app_env: str = Field(default="dev")  # dev | staging | prod
    api_prefix: str = "/api"

    # --- Database ---
    database_url: str = Field(
        default="postgresql+psycopg://psiclinic:psiclinic@localhost:5432/psiclinic"
    )

    # --- Auth ---
    jwt_secret: str = Field(default="change-me-in-prod")
    jwt_alg: str = "HS256"
    access_token_minutes: int = 15
    refresh_token_days: int = 30

    # --- Crypto ---
    # Master key em base64 (32 bytes). HKDF deriva uma chave por tenant.
    master_encryption_key_b64: str = Field(default="")
    encryption_key_version: int = 1

    # --- LGPD / clinical rules ---
    session_lock_after_days: int = 7  # default; sobrescrito por empresa
    default_data_retention_days: int = 365 * 20  # 20 anos (CFM 1.638)

    # --- 2FA ---
    totp_issuer: str = "PsiClinic"
    require_2fa_for_doctors: bool = False  # ligar em prod

    # --- CORS ---
    cors_origins: str = Field(default="http://localhost:3000")

    # --- Storage (anexos) ---
    storage_backend: str = "local"  # local | s3
    storage_bucket: str = "psiclinic-attachments"
    storage_local_path: str = "./var/attachments"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
