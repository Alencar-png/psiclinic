"""
Conexão com PostgreSQL + injeção de tenant context para Row-Level Security.

A cada request autenticado, o middleware chama `set_tenant_context()` que
emite `SET LOCAL app.tenant_id = ...` na transação corrente. As políticas
RLS no banco leem essa variável de sessão.

A separação entre `engine` (sync) e `async_engine` é proposital: a maioria
dos endpoints usa SQLAlchemy 2.0 sync (mais simples), e tarefas pesadas
(export, exec de relatórios) usam async.
"""
from __future__ import annotations

import os
from contextlib import contextmanager
from typing import Iterator, Optional

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import QueuePool

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg://psiclinic:psiclinic@localhost:5432/psiclinic",
)


class Base(DeclarativeBase):
    """Base declarativa do SQLAlchemy 2.x."""


engine = create_engine(
    DATABASE_URL,
    poolclass=QueuePool,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    # echo apenas em dev. Nunca logar queries em prod (vazaria dados clínicos).
    echo=os.getenv("SQL_ECHO", "0") == "1",
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


# ------------------------------------------------------------------------
# Tenant context — atalho usado pela dependency get_db_with_tenant
# ------------------------------------------------------------------------
def set_tenant_context(
    session: Session,
    *,
    tenant_id: Optional[int],
    user_id: Optional[int],
    user_role: Optional[str],
) -> None:
    """
    Injeta variáveis de sessão lidas pelas políticas RLS.

    Usa set_config(name, value, is_local=true) — equivale a SET LOCAL mas
    aceita parâmetros bound (SET LOCAL não aceita). Escopo de transação:
    quando a transação termina (commit/rollback), as variáveis voltam ao
    default. Impede vazamento entre requests que peguem a mesma conexão do pool.
    """
    session.execute(
        text("SELECT set_config('app.tenant_id', :v, true)"),
        {"v": "" if tenant_id is None else str(tenant_id)},
    )
    session.execute(
        text("SELECT set_config('app.user_id', :v, true)"),
        {"v": str(user_id or "")},
    )
    session.execute(
        text("SELECT set_config('app.user_role', :v, true)"),
        {"v": user_role or ""},
    )


@contextmanager
def db_session() -> Iterator[Session]:
    """Context manager para uso fora de FastAPI (jobs, scripts, seeds)."""
    s = SessionLocal()
    try:
        yield s
        s.commit()
    except Exception:
        s.rollback()
        raise
    finally:
        s.close()
