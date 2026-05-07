# Matriz de autorização

> Linhas = recursos. Colunas = roles. Valores = permissão (✅ pleno / 🟡 parcial / ❌ negado / **N/A** = não aplicável).

| Recurso / ação                        | super_admin | clinic_admin | doctor                  | receptionist |
|---------------------------------------|-------------|--------------|-------------------------|--------------|
| **Empresas (Companies)**              |             |              |                         |              |
| Listar                                | ✅          | ❌           | ❌                       | ❌           |
| Criar                                 | ✅          | ❌           | ❌                       | ❌           |
| Ler própria                           | ✅          | ✅           | ❌ direto                | ❌           |
| Atualizar (todos campos)              | ✅          | ❌           | ❌                       | ❌           |
| Atualizar (subset operacional)        | ✅          | 🟡           | ❌                       | ❌           |
| **Médicos (Doctors)**                 |             |              |                         |              |
| Listar                                | ❌          | ✅ (clínica) | ✅ (clínica)             | ✅ (clínica) |
| Cadastrar                             | ❌          | ✅           | ❌                       | ❌           |
| Editar                                | ❌          | ✅           | ❌                       | ❌           |
| Desativar                             | ❌          | ✅           | ❌                       | ❌           |
| **Pacientes (Patients)**              |             |              |                         |              |
| Listar                                | ❌          | ✅ todos     | 🟡 só os meus¹           | ✅ todos    |
| Cadastrar (dados básicos)             | ❌          | ✅           | ✅                       | ✅          |
| Ver detalhe (PII completo)            | ❌          | ✅           | ✅                       | ❌           |
| Editar                                | ❌          | ✅           | ✅                       | ❌           |
| Dar alta                              | ❌          | ✅           | ✅                       | ❌           |
| **Anamnese**                          |             |              |                         |              |
| Visualizar payload completo           | ✅ (auditoria) | ❌        | ✅                       | ❌           |
| Criar/atualizar (gera versão)         | ❌          | ❌           | ✅                       | ❌           |
| Ver lista de versões                  | ✅          | ❌           | ✅                       | ❌           |
| Bloquear                              | ❌          | ❌           | ✅                       | ❌           |
| **Sessões (metadados)**               |             |              |                         |              |
| Listar do paciente                    | ❌          | ✅           | ✅                       | ✅          |
| Agendar                               | ❌          | ✅           | ✅                       | ✅          |
| Ver detalhes (sem observações)        | ❌          | ✅           | ✅                       | ❌²         |
| Atualizar status (cancelada/faltou)   | ❌          | ✅           | ✅                       | ✅          |
| **Sessões (observações)**             |             |              |                         |              |
| Ler observações livres                | 🟡 auditoria³ | ❌        | ✅                       | ❌           |
| Editar observações                    | ❌          | ❌           | ✅                       | ❌           |
| Bloquear sessão                       | ❌          | ✅           | ✅                       | ❌           |
| Adendo após bloqueio                  | ❌          | ❌           | ✅                       | ❌           |
| Buscar FTS                            | ✅          | ❌           | ✅                       | ❌           |
| **Audit Logs**                        |             |              |                         |              |
| Ler todos                             | ✅          | ❌           | ❌                       | ❌           |
| Ler da própria clínica                | ✅          | ✅           | ❌                       | ❌           |
| Ler ações próprias                    | N/A         | ✅           | ✅                       | ✅          |
| **CID-10**                            |             |              |                         |              |
| Buscar                                | ✅          | ✅           | ✅                       | ✅          |

**Notas**

¹ Configurável via `companies.doctors_see_all_patients`. Default: médico vê só os seus.

² Recepção vê apenas a agenda (data, paciente, status), nunca abre o detalhe.

³ Em produção, sugerimos restringir ainda mais super_admin ao conteúdo clínico. Ver `docs/04_super_admin_least_privilege.md` (TODO).

---

## Como o backend impõe

1. **JWT** carrega `role` e `tenant`.
2. **`require_role(...)`** dependency em FastAPI — guarda o endpoint.
3. **RLS PostgreSQL** — `app.tenant_id` setado por request impede vazamento entre clínicas mesmo se um endpoint esquecer o filtro.
4. **Filtros de repositório** — médico só vê seus pacientes via JOIN em `patient_doctors`.

## Como o frontend ajuda

- `(app)/layout.tsx` esconde itens do menu por role.
- Botões críticos (`Editar observações`, `Bloquear`) só renderizam se role permite.
- Defesa em profundidade: o backend é a fonte de verdade; o frontend só esconde para reduzir confusão.
