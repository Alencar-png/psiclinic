"""
Schemas para Ficha de Anamnese psiquiátrica.

A anamnese tem ~10 blocos (a-j conforme o prompt). Cada bloco é um sub-modelo.
O payload completo entra em criar/atualizar; o backend gera nova versão.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


# ---------- (a) Identificação ----------
class IdentificationBlock(BaseModel):
    full_name: str
    father_name: str | None = None
    mother_name: str | None = None
    address: str | None = None
    phone: str | None = None
    birth_date: str | None = None  # ISO date
    age: int | None = Field(default=None, ge=0, le=130)
    naturalidade: str | None = None
    procedencia: str | None = None
    profession: str | None = None
    marital_status: str | None = None
    skin_color: str | None = None
    religion: str | None = None


# ---------- (d) Antecedentes pessoais ----------
class PersonalAntecedentsBlock(BaseModel):
    gestation: str | None = None
    birth: str | None = None  # parto
    breastfeeding: str | None = None
    psychomotor_dev: str | None = None
    childhood_diseases: str | None = None
    convulsions: str | None = None  # passado comicial
    head_trauma: str | None = None
    blood_transfusion: str | None = None
    stds: str | None = None
    surgeries: str | None = None
    menarca: str | None = None
    menopausa: str | None = None
    catamenios: str | None = None
    first_sex: str | None = None
    sexual_preference: str | None = None
    migraine: str | None = None
    pms: str | None = None
    smoking: str | None = None
    alcohol: str | None = None
    illicit_drugs: str | None = None


# ---------- (e) Antecedentes sociais ----------
class ParentsBlock(BaseModel):
    relationship: str | None = None
    socioeconomic_status: str | None = None
    children_predilection: str | None = None


class PatientLifeBlock(BaseModel):
    life_with_parents: str | None = None
    family_relationship: str | None = None


class SocialAntecedentsBlock(BaseModel):
    parents: ParentsBlock | None = None
    patient_life: PatientLifeBlock | None = None
    childhood: str | None = None
    school_life: str | None = None
    professional_life: str | None = None
    social_life: str | None = None
    psychosexuality: str | None = None
    premorbid_personality: str | None = None  # calmo/explosivo/...


# ---------- (f) Exame físico ----------
class PhysicalExamBlock(BaseModel):
    general_state: str | None = None
    skin_mucosa: str | None = None
    biotype: str | None = None
    head_neck: str | None = None
    cardiovascular: str | None = None
    respiratory: str | None = None
    digestive: str | None = None
    genitourinary: str | None = None
    locomotor: str | None = None
    neurological_gait: str | None = None
    neurological_static: str | None = None
    neurological_tremors: str | None = None
    neurological_tone: str | None = None
    neurological_reflexes: str | None = None


# ---------- (g) Exame mental ----------
class MentalExamBlock(BaseModel):
    appearance: str | None = None
    attendance_circumstance: str | None = None
    psychomotricity: str | None = None
    mood: str | None = None
    perception: str | None = None  # sensopercepção
    thought: str | None = None
    language: str | None = None
    orientation: str | None = None
    intelligence: str | None = None
    behavior: str | None = None
    consciousness: str | None = None
    memory: str | None = None
    will: str | None = None  # vontade
    judgment: str | None = None
    self_consciousness: str | None = None  # consciência do eu
    rapport: str | None = None
    insight: str | None = None


# ---------- (h) Exames complementares ----------
class ComplementaryExamsBlock(BaseModel):
    notes: str | None = None
    attachment_ids: list[int] = Field(default_factory=list)


# ---------- (j) Conduta + prescrição ----------
class PrescriptionItem(BaseModel):
    drug: str
    dose: str
    route: str | None = None
    frequency: str
    duration_days: int | None = None
    notes: str | None = None


class ConductBlock(BaseModel):
    notes: str | None = None
    prescription_items: list[PrescriptionItem] = Field(default_factory=list)


# ---------- Payload completo ----------
class AnamnesisPayload(BaseModel):
    identification: IdentificationBlock
    hda: str | None = Field(default=None, description="História da Doença Atual")
    family_history: str | None = None
    personal_antecedents: PersonalAntecedentsBlock | None = None
    social_antecedents: SocialAntecedentsBlock | None = None
    physical_exam: PhysicalExamBlock | None = None
    mental_exam: MentalExamBlock | None = None
    complementary_exams: ComplementaryExamsBlock | None = None
    diagnostic_hypothesis: str | None = None
    cid10_codes: list[str] = Field(default_factory=list)
    conduct: ConductBlock | None = None
    change_reason: str | None = Field(
        default=None, description="Por que esta versão foi criada (obrigatório a partir da v2)"
    )


class AnamnesisVersionOut(BaseModel):
    id: int
    version_number: int
    cid10_codes: list[str] = []
    change_reason: str | None
    created_by: int
    created_at: datetime

    class Config:
        from_attributes = True


class AnamnesisOut(BaseModel):
    id: int
    patient_id: str
    current_version: AnamnesisVersionOut | None
    locked_at: datetime | None
    created_at: datetime
    versions_count: int
    payload: AnamnesisPayload | None = Field(
        default=None,
        description="Decifrado da versão corrente; None se o caller não tem permissão",
    )
