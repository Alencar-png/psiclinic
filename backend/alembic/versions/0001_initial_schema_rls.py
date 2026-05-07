"""Initial schema + RLS policies + extensions

Revision ID: 0001_initial
Revises:
Create Date: 2026-05-07 00:00:00

Migration manual (não autogerada). Cria:
  1. Extensões: pgcrypto, pg_trgm, uuid-ossp
  2. Tabelas (via Base.metadata.create_all — captura todas as classes)
  3. Função app.current_tenant() helper
  4. Políticas RLS em todas as tabelas com company_id

Decisões:
- ALTER TABLE ... ENABLE ROW LEVEL SECURITY é IDEMPOTENTE? Sim.
- FORCE RLS é necessário para que owners da tabela também respeitem as
  políticas (sem isso, o usuário do app — se fosse owner — passaria livre).
"""
from __future__ import annotations

from alembic import op

# revision identifiers
revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


# Tabelas que carregam company_id e devem ter RLS de tenant
TENANT_TABLES = [
    "users",
    "doctor_clinics",
    "patients",
    "patient_consents",
    "anamneses",
    "anamnesis_versions",
    "anamnesis_attachments",
    "clinical_sessions",
    "session_attachments",
    "prescriptions",
    "prescription_templates",
    "audit_logs",
]


def upgrade() -> None:
    bind = op.get_bind()

    # ---- 1. Extensões ----
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto;")
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm;")
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";')

    # ---- 2. Cria todas as tabelas a partir do metadata ----
    # Importa app.models para popular Base.metadata com todas as classes.
    from app.config.database import Base
    from app import models  # noqa: F401

    Base.metadata.create_all(bind=bind)

    # ---- 3. Função helper para ler tenant atual ----
    op.execute(
        """
        CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS INTEGER AS $$
        DECLARE
            v TEXT := current_setting('app.tenant_id', true);
        BEGIN
            IF v IS NULL OR v = '' THEN
                RETURN NULL;
            END IF;
            RETURN v::INTEGER;
        END;
        $$ LANGUAGE plpgsql STABLE;
        """
    )
    op.execute(
        """
        CREATE OR REPLACE FUNCTION app_current_role() RETURNS TEXT AS $$
        BEGIN
            RETURN COALESCE(current_setting('app.user_role', true), '');
        END;
        $$ LANGUAGE plpgsql STABLE;
        """
    )

    # ---- 4. Habilita RLS e cria políticas ----
    for tbl in TENANT_TABLES:
        op.execute(f"ALTER TABLE {tbl} ENABLE ROW LEVEL SECURITY;")
        op.execute(f"ALTER TABLE {tbl} FORCE ROW LEVEL SECURITY;")

        # Super-admin: bypass total
        op.execute(
            f"""
            CREATE POLICY p_super_admin_{tbl} ON {tbl}
              USING (app_current_role() = 'super_admin')
              WITH CHECK (app_current_role() = 'super_admin');
            """
        )

        # Tenant isolation: aplicado quando NÃO é super_admin
        op.execute(
            f"""
            CREATE POLICY p_tenant_{tbl} ON {tbl}
              USING (
                  app_current_role() <> 'super_admin'
                  AND company_id = app_current_tenant()
              )
              WITH CHECK (
                  app_current_role() <> 'super_admin'
                  AND company_id = app_current_tenant()
              );
            """
        )

    # ---- 5. Trigger: gera tsvector ao salvar observations? ----
    # Não. O tsvector é gerado pelo app porque ele tem o texto plano
    # ANTES da cifragem. O backend chama:
    #   UPDATE clinical_sessions SET observations_tsv = to_tsvector('portuguese', :plain)
    # Nada a fazer aqui.

    # ---- 6. Trigger: bloqueio de UPDATE em sessões locked ----
    op.execute(
        """
        CREATE OR REPLACE FUNCTION trg_block_locked_session() RETURNS trigger AS $$
        BEGIN
            IF OLD.locked_at IS NOT NULL
               AND NEW.observations_html_enc IS DISTINCT FROM OLD.observations_html_enc
            THEN
                RAISE EXCEPTION 'Sessão % está bloqueada para edição (locked_at=%). Crie um adendo.',
                    OLD.id, OLD.locked_at;
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        """
        CREATE TRIGGER tg_block_locked_session
        BEFORE UPDATE ON clinical_sessions
        FOR EACH ROW EXECUTE FUNCTION trg_block_locked_session();
        """
    )

    # ---- 7. Trigger: imutabilidade de anamnesis_versions ----
    op.execute(
        """
        CREATE OR REPLACE FUNCTION trg_block_anam_version_update() RETURNS trigger AS $$
        BEGIN
            -- Permite só alterar campos de re-cifragem (encryption_key_version + *_enc/*_iv)
            IF NEW.version_number <> OLD.version_number
               OR NEW.created_at <> OLD.created_at
               OR NEW.created_by <> OLD.created_by
               OR NEW.change_reason IS DISTINCT FROM OLD.change_reason
            THEN
                RAISE EXCEPTION 'Versão de anamnese é imutável (id=%)', OLD.id;
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        """
        CREATE TRIGGER tg_block_anam_version_update
        BEFORE UPDATE ON anamnesis_versions
        FOR EACH ROW EXECUTE FUNCTION trg_block_anam_version_update();
        """
    )


def downgrade() -> None:
    # Drop triggers
    op.execute("DROP TRIGGER IF EXISTS tg_block_anam_version_update ON anamnesis_versions;")
    op.execute("DROP FUNCTION IF EXISTS trg_block_anam_version_update();")
    op.execute("DROP TRIGGER IF EXISTS tg_block_locked_session ON clinical_sessions;")
    op.execute("DROP FUNCTION IF EXISTS trg_block_locked_session();")

    # Drop policies
    for tbl in TENANT_TABLES:
        op.execute(f"DROP POLICY IF EXISTS p_super_admin_{tbl} ON {tbl};")
        op.execute(f"DROP POLICY IF EXISTS p_tenant_{tbl} ON {tbl};")
        op.execute(f"ALTER TABLE {tbl} DISABLE ROW LEVEL SECURITY;")

    op.execute("DROP FUNCTION IF EXISTS app_current_tenant();")
    op.execute("DROP FUNCTION IF EXISTS app_current_role();")

    from app.config.database import Base
    from app import models  # noqa: F401

    Base.metadata.drop_all(bind=op.get_bind())

    op.execute("DROP EXTENSION IF EXISTS pg_trgm;")
    # pgcrypto / uuid-ossp deixamos — outras coisas podem usar
