"""
Repositório de Anamnese — sempre cria nova versão (imutabilidade).

Fluxo de criação/atualização:
  1. Busca cabeçalho `anamneses` (cria se não existir).
  2. Pega `version_number` (max + 1).
  3. Cifra cada bloco do payload com AAD = "anamnesis_versions|<bloco>|<anam_id>:<v>".
  4. Insere AnamnesisVersion.
  5. Atualiza anamneses.current_version_id.
"""
from __future__ import annotations

import json
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models import Anamnesis, AnamnesisVersion
from app.services import crypto


def _aad(block: str, version_id: int | None) -> str:
    return f"anam|{block}|{version_id or 'new'}"


def get_or_create_header(
    db: Session, *, patient_id: UUID, company_id: int, created_by: int
) -> Anamnesis:
    existing = db.scalar(
        select(Anamnesis)
        .where(Anamnesis.patient_id == patient_id)
        .options(selectinload(Anamnesis.current_version))
    )
    if existing:
        return existing
    header = Anamnesis(
        patient_id=patient_id,
        company_id=company_id,
        created_by=created_by,
    )
    db.add(header)
    db.flush()
    return header


def _enc_block(value: Any, *, company_id: int, block: str) -> tuple[bytes | None, bytes | None]:
    if value is None:
        return None, None
    if isinstance(value, (dict, list)):
        plain = json.dumps(value, ensure_ascii=False)
    else:
        plain = str(value)
    enc = crypto.encrypt_str(plain, company_id=company_id, aad=_aad(block, None))
    return (enc.ciphertext, enc.iv) if enc else (None, None)


def create_version(
    db: Session,
    *,
    header: Anamnesis,
    payload: dict,
    created_by: int,
) -> AnamnesisVersion:
    cid = header.company_id
    next_n = (
        db.scalar(
            select(func.coalesce(func.max(AnamnesisVersion.version_number), 0))
            .where(AnamnesisVersion.anamnesis_id == header.id)
        )
        or 0
    ) + 1

    if next_n > 1 and not payload.get("change_reason"):
        raise ValueError("change_reason é obrigatório a partir da v2")

    fields = {
        "identification": payload.get("identification"),
        "hda": payload.get("hda"),
        "family_history": payload.get("family_history"),
        "personal_antecedents": payload.get("personal_antecedents"),
        "social_antecedents": payload.get("social_antecedents"),
        "physical_exam": payload.get("physical_exam"),
        "mental_exam": payload.get("mental_exam"),
        "complementary_exams": payload.get("complementary_exams"),
        "diagnostic_hypothesis": payload.get("diagnostic_hypothesis"),
        "conduct": payload.get("conduct"),
    }

    enc_kwargs: dict[str, Any] = {}
    for name, value in fields.items():
        ct, iv = _enc_block(value, company_id=cid, block=name)
        enc_kwargs[f"{name}_enc"] = ct
        enc_kwargs[f"{name}_iv"] = iv

    version = AnamnesisVersion(
        anamnesis_id=header.id,
        company_id=cid,
        version_number=next_n,
        cid10_codes=payload.get("cid10_codes") or [],
        change_reason=payload.get("change_reason"),
        created_by=created_by,
        **enc_kwargs,
    )
    db.add(version)
    db.flush()

    header.current_version_id = version.id
    db.flush()
    return version


def decrypt_version(v: AnamnesisVersion) -> dict:
    cid = v.company_id

    def _dec(name: str) -> Any:
        ct = getattr(v, f"{name}_enc")
        iv = getattr(v, f"{name}_iv")
        plain = crypto.decrypt_str(ct, iv, company_id=cid, aad=_aad(name, None), key_version=v.encryption_key_version)
        if plain is None:
            return None
        # Tenta JSON, se falhar trata como string
        try:
            return json.loads(plain)
        except (json.JSONDecodeError, TypeError):
            return plain

    return {
        "identification": _dec("identification"),
        "hda": _dec("hda"),
        "family_history": _dec("family_history"),
        "personal_antecedents": _dec("personal_antecedents"),
        "social_antecedents": _dec("social_antecedents"),
        "physical_exam": _dec("physical_exam"),
        "mental_exam": _dec("mental_exam"),
        "complementary_exams": _dec("complementary_exams"),
        "diagnostic_hypothesis": _dec("diagnostic_hypothesis"),
        "cid10_codes": v.cid10_codes or [],
        "conduct": _dec("conduct"),
        "change_reason": v.change_reason,
    }
