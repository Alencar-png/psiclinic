"""Enums centralizados — referenciados em models e schemas."""
from __future__ import annotations

import enum


class UserRole(str, enum.Enum):
    """Hierarquia de permissões — ver docs/02_authz_matrix.md."""
    SUPER_ADMIN = "super_admin"      # SaaS provider
    CLINIC_ADMIN = "clinic_admin"    # Admin de uma clínica
    DOCTOR = "doctor"                # Médico psiquiatra
    RECEPTIONIST = "receptionist"    # Recepção (sem acesso clínico)


class CompanyStatus(str, enum.Enum):
    ACTIVE = "active"
    SUSPENDED = "suspended"
    CANCELLED = "cancelled"


class ProfessionalType(str, enum.Enum):
    """Tipo do profissional na tabela `doctors` (mantemos esse nome de tabela
    por questão de compatibilidade — engloba todos os profissionais clínicos).

    O label do registro profissional na UI varia conforme o tipo:
    - DOCTOR → CRM (Conselho Regional de Medicina)
    - PSYCHOLOGIST → CRP (Conselho Regional de Psicologia)
    """
    DOCTOR = "doctor"
    PSYCHOLOGIST = "psychologist"


class PatientStatus(str, enum.Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    DISCHARGED = "discharged"  # alta


class SessionStatus(str, enum.Enum):
    SCHEDULED   = "scheduled"     # agendada
    IN_PROGRESS = "in_progress"   # em curso (médico iniciou — pode ser antecipada)
    COMPLETED   = "completed"     # realizada
    CANCELLED   = "cancelled"     # cancelada
    NO_SHOW     = "no_show"       # faltou


class AuditAction(str, enum.Enum):
    READ = "read"
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"
    EXPORT = "export"
    LOGIN = "login"
    LOGIN_FAILED = "login_failed"
    LOGOUT = "logout"


class ConsentPurpose(str, enum.Enum):
    """Bases legais distintas para tratamento — LGPD art. 7º/11."""
    TREATMENT = "treatment"        # Tutela da saúde (art. 11, II, f)
    DATA_SHARING = "data_sharing"  # Compartilhamento com terceiros (precisa consent)
    RESEARCH = "research"
    AUDIO_RECORDING = "audio_recording"
