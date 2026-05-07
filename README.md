# PsiClinic

Sistema SaaS multi-tenant para clínicas psiquiátricas — prontuário
eletrônico, ficha de anamnese versionada, sessões com observações
livres em rich-text, criptografia em repouso por tenant, RLS PostgreSQL,
auditoria LGPD-friendly.

> **Origem.** Construído ao lado de [`emotion-care`](../emotion-care/) — não
> compartilha banco nem código. Reaproveita padrões de stack (FastAPI +
> Next.js 14 + Tailwind + Alembic + SQLAlchemy 2).

---

## 🚀 Subir em 30 segundos

```bash
# 1) Gerar a master key de criptografia (uma vez):
python -c "import os, base64; print(base64.b64encode(os.urandom(32)).decode())"
# Copie em .env / docker-compose

# 2) Docker
cd psiclinic
docker compose up --build

# 3) Banco vazio? Rode o seed:
docker compose exec backend python -m seeds.seed_demo
```

- API → http://localhost:4200/api/docs
- App → http://localhost:3000
- Logins padrão (após seed):
  - `super@psiclinic.local` / `Super@1234567`
  - `admin@demo.local` / `Admin@1234567`
  - `dr.carla@demo.local` / `Doctor@1234567`

---

## 📂 Layout

```
psiclinic/
├── backend/                  FastAPI + SQLAlchemy 2 + Alembic
│   ├── app/
│   │   ├── config/           settings, database (engine + tenant ctx)
│   │   ├── models/           SQLAlchemy 2 (1 arquivo por contexto)
│   │   ├── schemas/          Pydantic v2
│   │   ├── repositories/     acesso ao banco com tenant ctx aplicado
│   │   ├── services/         crypto (AES-GCM + HKDF), audit, security (JWT/2FA)
│   │   ├── routers/          endpoints REST agrupados por contexto
│   │   ├── middleware/       deps FastAPI (RBAC, tenant injection)
│   │   └── main.py
│   ├── alembic/              migrations (RLS + extensions + triggers)
│   └── seeds/                seed_demo.py
├── frontend/                 Next.js 14 (App Router) + Tailwind
│   └── src/
│       ├── app/
│       │   ├── (app)/        área autenticada (médico, admin, recepção)
│       │   │   ├── dashboard/
│       │   │   ├── patients/[id]/anamnesis/
│       │   │   └── patients/[id]/sessions/[sid]/
│       │   ├── (super)/      super admin
│       │   └── login/
│       ├── components/       UI + clínicos (RichTextEditor)
│       ├── hooks/            useAutoSave
│       └── lib/              api client (refresh automático)
├── docker-compose.yml
└── docs/                     decisões arquiteturais + diagrama ER
```

---

## 🧱 Stack

| Camada | Escolha | Motivo |
|---|---|---|
| Backend | FastAPI 0.115 + SQLAlchemy 2.0 + Alembic | Stack que já temos rodando no Emotion Care; tipagem forte; OpenAPI grátis |
| Banco | PostgreSQL 16 + RLS + pgcrypto + pg_trgm | RLS é defesa-em-profundidade; pgcrypto p/ extensões; trgm p/ busca |
| Auth | JWT (HS256) access 15min + refresh 30d com rotação por família + TOTP | Curto-curto-longo. Roubo de refresh detectado por reuso. |
| Crypto | AES-256-GCM, chave por tenant via HKDF da master | Tenant isolation no nível de chave; rotação por versão. |
| Frontend | Next.js 14 (App Router) + Tailwind + shadcn-style + TipTap | RSC para listagens; client components para editor; CSP-friendly |
| Deploy | Docker Compose (dev); Kubernetes ou Fly.io (prod) | Compose entrega tudo em 1 comando |

---

## 🗺️ Endpoints — visão por contexto

### Auth — `/api/auth`
| Método | Path | Roles | Descrição |
|---|---|---|---|
| POST | `/login` | público | Login (suporta `totp_code`) |
| POST | `/refresh` | público | Rotação de refresh |
| POST | `/logout` | público | Revoga refresh |
| GET | `/me` | qualquer | Dados do usuário corrente |
| POST | `/2fa/enroll` | qualquer | Gera secret TOTP |
| POST | `/2fa/confirm` | qualquer | Confirma e ativa 2FA |
| POST | `/2fa/disable` | qualquer | Desativa 2FA |

### Companies — `/api/companies`
| Método | Path | Roles |
|---|---|---|
| GET | `/companies` | super_admin |
| POST | `/companies` | super_admin |
| GET | `/companies/{id}` | super_admin OU clinic_admin (própria) |
| PATCH | `/companies/{id}` | super_admin (full) / clinic_admin (subset) |

### Doctors — `/api/doctors` (escopo do tenant)
| Método | Path | Roles |
|---|---|---|
| GET | `/doctors` | clinic_admin / doctor / receptionist |
| POST | `/doctors` | clinic_admin |
| GET | `/doctors/{id}` | clinic_admin / doctor / receptionist |
| PATCH | `/doctors/{id}` | clinic_admin |

### Patients — `/api/patients`
| Método | Path | Roles |
|---|---|---|
| GET | `/patients` | clinic_admin / doctor (filtra) / receptionist |
| POST | `/patients` | clinic_admin / doctor / receptionist |
| GET | `/patients/{id}` | clinic_admin / doctor (≠ receptionist) |
| PATCH | `/patients/{id}` | clinic_admin / doctor |
| POST | `/patients/{id}/discharge` | doctor / clinic_admin |

### Anamnesis — `/api/patients/{pid}/anamnesis`
| Método | Path | Roles |
|---|---|---|
| GET | `…/anamnesis` | doctor / super_admin |
| PUT | `…/anamnesis` | doctor (cria nova versão) |
| GET | `…/anamnesis/versions` | doctor |
| GET | `…/anamnesis/versions/{vid}` | doctor |
| POST | `…/anamnesis/lock` | doctor |

### Sessions
| Método | Path | Roles |
|---|---|---|
| GET | `/api/patients/{pid}/sessions` | clinic_admin / doctor / receptionist |
| POST | `/api/patients/{pid}/sessions` | clinic_admin / doctor / receptionist |
| GET | `/api/sessions/{id}` | clinic_admin (sem obs) / doctor (com obs) |
| PATCH | `/api/sessions/{id}` | clinic_admin / doctor |
| PUT | `/api/sessions/{id}/observations` | doctor |
| POST | `/api/sessions/{id}/lock` | doctor / clinic_admin |
| POST | `/api/sessions/{id}/addendum` | doctor |
| GET | `/api/sessions/search?q=...` | doctor |

### Catalog
| Método | Path |
|---|---|
| GET | `/api/cid10?q=...` |

### Dashboard
| Método | Path |
|---|---|
| GET | `/api/dashboard/me` |

OpenAPI completo em `/api/docs`.

---

## 🔐 Modelo de segurança

1. **Auth** — JWT access 15min com claims `sub`, `role`, `tenant`, `doctor_id`. Refresh 30d em rotação por família.
2. **RBAC** — 4 roles: `super_admin`, `clinic_admin`, `doctor`, `receptionist`. Guards no FastAPI + verificações finas por endpoint.
3. **Tenant isolation** — Row-Level Security PostgreSQL. Toda tabela com `company_id` tem `ENABLE/FORCE RLS` + 2 políticas (super_admin bypass, tenant filter via `current_setting('app.tenant_id')`).
4. **Crypto em repouso** — AES-256-GCM com chave derivada por tenant (HKDF). Master key em env, rotacionável via `key_version`. CPF tem hash HMAC para busca exata sem decifrar.
5. **Auditoria** — `audit_logs` append-only (trigger pode bloquear UPDATE/DELETE em prod). Todo READ/CREATE/UPDATE/DELETE/EXPORT em prontuário registra quem, quando, o quê + IP/UA + path.
6. **Bloqueio de prontuário** — `clinical_sessions.locked_at` impede UPDATE de observações via trigger. Adendos são novas sessões com `parent_session_id`.
7. **Headers** — Next.js força `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy: no-referrer`, `Permissions-Policy` restritiva.

---

## ✅ Checklist LGPD

Ver `docs/02_lgpd_checklist.md`.

---

## 🛠️ Operação

### Rodar migrations
```bash
docker compose exec backend alembic upgrade head
```

### Criar nova migration
```bash
docker compose exec backend alembic revision --autogenerate -m "add foo"
```

### Rotacionar a master key
1. Gerar nova chave: `python -c "import os, base64; print(base64.b64encode(os.urandom(32)).decode())"`
2. Aumentar `ENCRYPTION_KEY_VERSION` no `.env`.
3. Rodar job de re-cifragem: `docker compose exec backend python -m scripts.rotate_keys` (TODO).
4. Rotacionar chave HMAC quebra busca por CPF — exige migração off-line.

### Backups
- `pg_dump` com flag `--encrypt` ou despejo direto para S3 com SSE-KMS.
- Backups jamais armazenados em texto plano.
- Teste de restore mensal (auditoria).

---

## 🚧 Próximos passos (não MVP)

1. Anexos (upload S3 + cifragem SSE-C por tenant).
2. PDF assinado digitalmente (ICP-Brasil A1/A3) — endpoint `/api/sessions/{id}/export-pdf`.
3. WhatsApp Business API para lembretes.
4. Modo offline (Service Worker + fila de auto-saves).
5. Anonimização programática ao fim da retenção (job mensal).
6. Particionamento de `audit_logs` por mês.
