# Checklist LGPD — PsiClinic

> Status referente à implementação do MVP (sprint 1). Itens marcados `[ ]`
> são gaps reconhecidos, com indicação do esforço para fechar.

## Princípios (LGPD art. 6º)

| Princípio | Implementação | Status |
|---|---|---|
| **Finalidade** | `purpose` em `patient_consents` (treatment, data_sharing, research, audio_recording) | ✅ |
| **Adequação / Necessidade** | Apenas campos clínicos necessários; recepção não vê detalhes | ✅ |
| **Livre acesso** | Endpoint `GET /api/patients/{id}/export-personal-data` | ⏳ TODO |
| **Qualidade** | Versionamento de anamnese permite correção rastreável | ✅ |
| **Transparência** | Termo de consentimento por finalidade + `document_url` armazenado | ✅ |
| **Segurança** | RLS + AES-GCM + JWT + 2FA + auditoria | ✅ |
| **Prevenção** | Trigger contra UPDATE de sessão bloqueada / versão imutável | ✅ |
| **Não-discriminação** | Roles separadas; sigilo médico bloqueia clinic_admin do conteúdo clínico | ✅ |
| **Responsabilização** | `audit_logs` append-only com diff de campos | ✅ |

## Bases legais (art. 7º + 11)

| Tratamento | Base legal | Onde |
|---|---|---|
| Identificação do paciente | Art. 11 II `f` (tutela da saúde) | `patients` |
| Anamnese / Sessões / Diagnóstico | Art. 11 II `f` | `anamnesis_versions`, `clinical_sessions` |
| Compartilhamento com terceiros (laboratório, plano de saúde) | Art. 7º I (consentimento) — `purpose=data_sharing` | `patient_consents` |
| Pesquisa científica anonimizada | Art. 7º IV — `purpose=research` | `patient_consents` |
| Gravação de áudio da sessão | Art. 7º I — `purpose=audio_recording` | `patient_consents` |

## Direitos do titular (art. 18)

| Direito | Implementação | Status |
|---|---|---|
| Confirmação da existência | `GET /api/patients/{id}` | ✅ |
| Acesso aos dados | export JSON dos dados pessoais (TODO endpoint dedicado) | ⏳ TODO |
| Correção | `PATCH /api/patients/{id}` + nova versão de anamnese | ✅ |
| Anonimização / bloqueio | Job de retenção (TODO) | ⏳ TODO |
| Portabilidade | Export JSON / PDF (parcial — falta JSON estruturado) | ⏳ TODO |
| Eliminação | **Não aplicável imediato** — CFM 1.638/2002 obriga retenção 20 anos. Substituído por anonimização ao fim do prazo. | 📋 docs |
| Informação sobre compartilhamento | `GET /api/patients/{id}/consents` retorna histórico | ⏳ TODO endpoint |
| Revogação de consentimento | `DELETE /api/patients/{id}/consents/{cid}` (registra `revoked_at`) | ⏳ TODO endpoint |

## Segurança técnica (art. 46-49)

| Item | Implementação |
|---|---|
| **Criptografia em trânsito** | TLS obrigatório no balanceador (Caddy/NGINX). Em dev, HTTP local apenas. |
| **Criptografia em repouso** | AES-256-GCM, chave por tenant via HKDF da master. Anexos com SSE-C. |
| **Hashing de senha** | bcrypt cost 12 |
| **Hashing determinístico de CPF** | HMAC-SHA256 (busca sem decifrar) |
| **Pseudonimização** | UUID em IDs públicos de paciente |
| **Controle de acesso** | RBAC + RLS PostgreSQL (defesa em profundidade) |
| **2FA** | TOTP (RFC 6238) opcional, obrigatório para médicos em prod |
| **Auditoria** | `audit_logs` com IP, UA, path, diff |
| **Backup cifrado** | Recomendado pg_dump + cifragem GPG ou S3 SSE-KMS |
| **Resposta a incidentes** | Runbook em `docs/incident_response.md` (TODO) |

## Tratamento de dados sensíveis (art. 11)

Dados de saúde são **especialmente protegidos**. Aplicamos:

1. **Consentimento explícito** — `patient_consents` com `purpose=treatment`, `signed_text_hash` (SHA-256 do texto completo do termo) e PDF arquivado.
2. **Compartilhamento restrito** — listagem só de pacientes do médico autenticado (a menos que `doctors_see_all_patients=true`).
3. **Tratamento por profissional de saúde** — apenas `role=doctor` lê conteúdo clínico (anamnese e observações). `clinic_admin` vê metadados (data, status), nunca o texto.

## Retenção e descarte

- `companies.data_retention_days` (default 7300 = 20 anos, conforme CFM 1.638/2002).
- Job mensal (TODO `services/retention.py`) anonimiza pacientes com `discharged_at + retention < hoje`:
  - Substitui PII cifrado por bytes nulos
  - Mantém anamnese e sessões (substitui nome do paciente por hash randomizado)
  - Marca `patients.anonymized_at`
- Logs de auditoria mantidos por **5 anos** (independente do paciente).

## Encarregado (DPO)

- Campo `companies.dpo_email` e `dpo_name` (TODO migrar). Endpoint público de contato `/api/companies/{id}/dpo`.
- Página pública de privacidade no frontend (TODO `/politica-de-privacidade`).

## Incidentes

- Detecção: alerta automático quando refresh-token reuso é detectado (já implementado — revoga família e dispara `audit_log`).
- Notificação ANPD: prazo 2 dias úteis. Runbook (TODO).

---

## Itens críticos para produção (CHECK antes de ir ao ar)

- [ ] Trocar `MASTER_ENCRYPTION_KEY_B64` para chave gerada com CSPRNG e armazenada em KMS/Vault.
- [ ] Rotacionar `JWT_SECRET` (≥ 32 bytes aleatórios).
- [ ] Ativar `REQUIRE_2FA_FOR_DOCTORS=true`.
- [ ] HTTPS obrigatório (HSTS + redirect 80→443).
- [ ] Backups noturnos com restore mensal validado.
- [ ] Implementar `/api/patients/{id}/export-personal-data`.
- [ ] Implementar job de anonimização por retenção.
- [ ] Implementar revogação de consentimento (`DELETE` em `patient_consents`).
- [ ] DPO definido e documentado.
- [ ] Política de privacidade pública e termo de consentimento revisados pelo jurídico.
- [ ] Particionar `audit_logs` por mês (ou retenção curta com archive em S3 Object Lock).
