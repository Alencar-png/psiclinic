"""
Modelos SQLAlchemy 2.x — agregação para Alembic enxergar todas as tabelas.

Importar TUDO aqui é importante: o autogenerate do Alembic só vê o que está
registrado no `Base.metadata`, e o registro acontece quando a classe é
importada.
"""
from app.config.database import Base  # noqa: F401

from .enums import (  # noqa: F401
    UserRole,
    PatientStatus,
    SessionStatus,
    AuditAction,
    CompanyStatus,
)
from .tenant import Company, Plan  # noqa: F401
from .auth import User, RefreshToken  # noqa: F401
from .clinical_actors import Doctor, DoctorClinic  # noqa: F401
from .patients import Patient, PatientDoctor, PatientConsent  # noqa: F401
from .anamnesis import (  # noqa: F401
    Anamnesis,
    AnamnesisVersion,
    AnamnesisAttachment,
)
from .sessions import (  # noqa: F401
    ClinicalSession,
    SessionAttachment,
    Prescription,
    PrescriptionTemplate,
)
from .catalog import CID10  # noqa: F401
from .audit import AuditLog  # noqa: F401

__all__ = [
    "Base",
    "UserRole",
    "PatientStatus",
    "SessionStatus",
    "AuditAction",
    "CompanyStatus",
    "Company",
    "Plan",
    "User",
    "RefreshToken",
    "Doctor",
    "DoctorClinic",
    "Patient",
    "PatientDoctor",
    "PatientConsent",
    "Anamnesis",
    "AnamnesisVersion",
    "AnamnesisAttachment",
    "ClinicalSession",
    "SessionAttachment",
    "Prescription",
    "PrescriptionTemplate",
    "CID10",
    "AuditLog",
]
