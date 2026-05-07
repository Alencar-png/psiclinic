# PsiClinic — Modelagem de Dados

> Domínio sensível (saúde mental). Todas as tabelas com dados de paciente
> são protegidas por **Row-Level Security (RLS)** filtrando por `company_id`
> e por **criptografia de coluna** nos campos clínicos livres.

---

## 1. Diagrama ER textual

```
┌──────────────────┐
│ companies        │  (TENANT — clínica psiquiátrica)
│ id (PK)          │◄─────────────────────────────────────────┐
│ name             │                                          │
│ cnpj (uniq)      │                                          │
│ plan_id (FK)     │                                          │
│ status           │                                          │
│ data_retention_d │                                          │
└──────────────────┘                                          │
        ▲                                                     │
        │ 1                                                   │
        │                                                     │
        │ N                                                   │
┌───────┴──────────┐         ┌──────────────────────┐         │
│ users            │         │ doctor_clinics (N:N) │         │
│ id (PK)          │         │ doctor_id (PK,FK)    │         │
│ company_id (FK)  │         │ company_id (PK,FK) ──┼─────────┘
│ email (uniq)     │         │ active               │
│ password_hash    │         │ joined_at            │
│ role (enum)      │         └──────────────────────┘
│ totp_secret      │                ▲     ▲
│ is_active        │                │     │
└──────────────────┘                │     │
        ▲                           │     │
        │ 1:1 (médico)              │     │
        │                           │     │
┌───────┴──────────┐                │     │
│ doctors          │────────────────┘     │
│ id (PK)          │                      │
│ user_id (FK uniq)│                      │
│ cpf (uniq)       │                      │
│ crm + crm_uf     │                      │
│ specialty        │                      │
│ photo_url        │                      │
└──────────────────┘                      │
        ▲                                 │
        │ N:N (atendimento)               │
        │                                 │
┌───────▼──────────┐                      │
│ patient_doctors  │                      │
│ patient_id (PK)  │                      │
│ doctor_id (PK) ──┘                      │
│ is_primary       │
│ assigned_at      │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐         ┌──────────────────────┐
│ patients         │         │ patient_consents     │
│ id (PK, uuid)    │◄────────│ patient_id (FK)      │
│ company_id (FK)  │ 1:N     │ purpose              │
│ full_name (enc)  │         │ accepted_at          │
│ cpf (enc, hash)  │         │ revoked_at           │
│ birth_date       │         │ ip_address           │
│ gender           │         │ document_url         │
│ status (enum)    │         └──────────────────────┘
│ encryption_iv    │
└────────┬─────────┘
         │
         ├──── 1:1 ────┐
         │             ▼
         │     ┌──────────────────────┐
         │     │ anamneses            │  (cabeçalho — 1:1 com paciente)
         │     │ id (PK)              │
         │     │ patient_id (uniq)    │
         │     │ current_version_id   │
         │     │ locked_at            │
         │     │ created_by           │
         │     └──────────┬───────────┘
         │                │ 1:N (versionamento)
         │                ▼
         │     ┌────────────────────────────────────────┐
         │     │ anamnesis_versions                     │
         │     │ id (PK)                                │
         │     │ anamnesis_id (FK)                      │
         │     │ version_number                         │
         │     │ identification (jsonb, enc)            │
         │     │ hda_text (enc)                         │
         │     │ family_history (enc)                   │
         │     │ personal_antecedents (jsonb, enc)      │
         │     │ social_antecedents (jsonb, enc)        │
         │     │ physical_exam (jsonb, enc)             │
         │     │ mental_exam (jsonb, enc)               │
         │     │ complementary_exams (jsonb, enc)       │
         │     │ diagnostic_hypothesis (enc)            │
         │     │ cid10_codes (text[])                   │
         │     │ conduct (enc)                          │
         │     │ created_by (FK users)                  │
         │     │ created_at                             │
         │     │ change_reason (text)                   │
         │     └─────────┬──────────────────────────────┘
         │               │ 1:N
         │               ▼
         │     ┌────────────────────────────┐
         │     │ anamnesis_attachments      │
         │     │ id (PK)                    │
         │     │ anamnesis_version_id (FK)  │
         │     │ file_name                  │
         │     │ mime_type                  │
         │     │ object_key (S3)            │
         │     │ encryption_iv              │
         │     └────────────────────────────┘
         │
         ├──── 1:N ────┐
         │             ▼
         │     ┌────────────────────────────────────┐
         │     │ sessions                           │  (N por paciente)
         │     │ id (PK, uuid)                      │
         │     │ patient_id (FK)                    │
         │     │ doctor_id (FK)                     │
         │     │ company_id (FK, denormalizado)     │
         │     │ scheduled_at (datetime)            │
         │     │ duration_minutes                   │
         │     │ status (enum)                      │
         │     │ observations_html (enc, deferred)  │  ← editor rich-text
         │     │ observations_tsv (tsvector)        │  ← FTS sobre texto plano
         │     │ next_session_suggestion (date)     │
         │     │ locked_at                          │
         │     │ created_at, updated_at             │
         │     └────────┬───────────────────────────┘
         │              │ 1:N
         │              ▼
         │     ┌─────────────────────────────────┐
         │     │ session_attachments             │
         │     │ id (PK)                         │
         │     │ session_id (FK)                 │
         │     │ kind (exam|prescription|audio)  │
         │     │ object_key (S3)                 │
         │     │ encryption_iv                   │
         │     └─────────────────────────────────┘
         │
         └──── 1:N ────┐
                       ▼
              ┌─────────────────────────────────┐
              │ prescriptions                   │
              │ id (PK)                         │
              │ session_id (FK)                 │
              │ items (jsonb)                   │  [{drug, dose, freq, dur}]
              │ template_id (FK opcional)       │
              │ pdf_object_key                  │
              └─────────────────────────────────┘

┌──────────────────────────────┐
│ prescription_templates       │   (por médico, reutilizáveis)
│ id (PK)                      │
│ doctor_id (FK)               │
│ company_id (FK)              │
│ name                         │
│ items (jsonb)                │
└──────────────────────────────┘

┌──────────────────────────────┐
│ cid10                        │   (catálogo global, sem company_id)
│ code (PK, ex: F32.0)         │
│ description                  │
│ chapter                      │
└──────────────────────────────┘

┌──────────────────────────────┐
│ plans                        │   (catálogo global)
│ id (PK)                      │
│ name                         │
│ max_doctors                  │
│ max_patients                 │
│ price_cents                  │
└──────────────────────────────┘

┌──────────────────────────────────────────────────┐
│ audit_logs   (append-only — núcleo de compliance)│
│ id (PK)                                          │
│ company_id (FK, nullable p/ super-admin)         │
│ user_id (FK)                                     │
│ action (enum: read/create/update/delete/export)  │
│ entity_type                                      │
│ entity_id                                        │
│ patient_id (FK, nullable)  ◄── crítico p/ LGPD   │
│ ip_address, user_agent                           │
│ http_method, http_path                           │
│ payload_diff (jsonb)                             │
│ occurred_at (idx)                                │
└──────────────────────────────────────────────────┘

┌──────────────────────────────┐
│ refresh_tokens               │
│ id (PK)                      │
│ user_id (FK)                 │
│ token_hash                   │
│ family_id (rotation chain)   │
│ revoked_at, expires_at       │
│ user_agent, ip_address       │
└──────────────────────────────┘
```

---

## 2. Decisões-chave de modelagem

### 2.1 Por que `Doctor` e `User` separados?
Um médico atende em **múltiplas clínicas** (relação N:N via `doctor_clinics`).
`User` carrega credenciais e role; `Doctor` carrega CPF/CRM/dados profissionais.
Isso permite que o mesmo médico (mesmo CRM) tenha um único login, mas escolha
em qual clínica está operando ("workspace switcher").

### 2.2 Por que `patient_id` é UUID e não inteiro sequencial?
Evita enumeration attacks. A LGPD exige ofuscação de identificadores em URLs
quando o recurso for sensível.

### 2.3 Por que `anamneses` tem cabeçalho + `anamnesis_versions`?
Versionamento imutável: toda alteração cria nova `anamnesis_versions` com
snapshot completo + `change_reason`. A tabela `anamneses` apenas aponta para
a versão corrente. **Versões antigas nunca são apagadas** — exigência de
prontuário médico (CFM 1.638/2002 e LGPD com base legal "exercício regular
de direitos").

### 2.4 Por que `observations_html` é deferido + `observations_tsv` separado?
- `observations_html` é grande (rich-text), criptografado, e raramente lido em
  listagens → carregar com `deferred()` e só desserializar/decifrar sob demanda.
- `observations_tsv` é o texto plano extraído (sem tags HTML), gerado por
  trigger, indexado com GIN para busca textual. **Não criptografado** porque
  o tsvector é derivação — guardamos só hashes de termos? Não, vamos guardar
  texto plano em tabela separada `session_search` em schema isolado, com
  ACL extra. (Ver §3 abaixo.)

### 2.5 Por que `company_id` denormalizado em `sessions`?
Sessões herdam tenant do paciente, mas desnormalizar evita joins na política RLS
e no índice — a política vira `company_id = current_setting('app.tenant_id')`.

### 2.6 `audit_logs` com `patient_id` nullable
Acesso a prontuário **sempre** registra `patient_id`. Acesso a entidades
administrativas (médico, plano) registra `entity_type/entity_id`. Permite
relatório "quem viu o prontuário de João nos últimos 90 dias?" — direito do
titular pela LGPD.

### 2.7 Bloqueio de edição (`locked_at`)
- `sessions.locked_at` é preenchido por job após N dias (configurável em
  `companies.session_lock_after_days`, default 7).
- Após bloqueio, edição só por **adendo** (nova sessão tipo "addendum"
  apontando para a original via `parent_session_id`). Espelha CFM
  Resolução 1.821/2007.

---

## 3. Modelo de criptografia em repouso

| Campo                          | Tipo         | Estratégia                              |
|--------------------------------|--------------|------------------------------------------|
| `patients.full_name`           | bytea        | AES-256-GCM, chave por tenant           |
| `patients.cpf` (lookup)        | bytea+hash   | Cifrado **e** hash HMAC-SHA256 indexado |
| `anamnesis_versions.*` clínico | bytea/jsonb  | AES-256-GCM, chave por tenant           |
| `sessions.observations_html`   | bytea        | AES-256-GCM, chave por tenant           |
| Anexos (S3)                    | SSE-C        | Chave por tenant, prefixo do tenant     |

**Derivação de chave** (HKDF-SHA256):
```
master_key (env var, rotacionável)
    │
    ▼  HKDF(salt=company_id, info="psiclinic-v1")
tenant_dek (per-tenant data encryption key, cacheada em memória 1h)
    │
    ▼  AES-GCM(key=tenant_dek, iv=random_96, aad=table+row_id)
ciphertext + iv guardados na linha
```

Rotação: `key_version` incrementa em `master_key`. Job assíncrono recifra
linhas com versão antiga durante janela de manutenção.

---

## 4. Estratégia de Row-Level Security

```sql
-- Em todo session do app (após login):
SET LOCAL app.tenant_id = '<company_id_do_usuario>';
SET LOCAL app.user_role = '<role>';
SET LOCAL app.user_id   = '<user_id>';

-- Política exemplo (pacientes):
CREATE POLICY tenant_isolation ON patients
  USING (company_id = current_setting('app.tenant_id')::int);

-- Super admin bypass:
CREATE POLICY super_admin_all ON patients
  USING (current_setting('app.user_role', true) = 'superAdmin');
```

Tabelas SEM `company_id` (globais): `cid10`, `plans`. Sem RLS — leitura pública,
escrita só super-admin.

Tabela `audit_logs`: política especial — admin da empresa só lê o que pertence à
sua empresa, super-admin lê tudo, médico lê apenas próprias ações.
