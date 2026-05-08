/**
 * Versionamento da aplicação + changelog exibido no badge inferior direito.
 *
 * Como usar:
 *   - Bumpe `APP_VERSION` ao fazer um release com mudanças relevantes
 *   - Adicione uma entrada no topo de `CHANGELOG` com `version` igual
 *   - Mantenha `package.json:version` alinhado (não há leitura automática)
 *
 * Convenção: SemVer relaxado.
 *   - 0.X → ainda em evolução, breaking changes possíveis entre minors
 *   - X.Y.0 → mudanças relevantes (novo módulo/tela)
 *   - X.Y.Z → patches/UX/correções
 */
export const APP_VERSION = "0.2.0";

export type ChangelogTag =
  | "feature"   // novo módulo ou tela
  | "fix"       // correção de bug
  | "improve"   // melhoria de UX, perf, segurança
  | "security"  // questões de segurança / RBAC
  | "deprecate";

export interface ChangelogItem {
  tag: ChangelogTag;
  text: string;
}

export interface ChangelogEntry {
  version: string;
  /** Data ISO (YYYY-MM-DD). */
  date: string;
  /** Lista de mudanças desta versão (newest items first). */
  items: ChangelogItem[];
}

/** Lista de versões — mais recente no topo. */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.2.0",
    date: "2026-05-08",
    items: [
      { tag: "feature", text: "Tipo de profissional: cadastro suporta médico (CRM) e psicólogo (CRP) com especialidades distintas" },
      { tag: "feature", text: "Tela de Usuários com CRUD completo, filtros e RBAC (clinic_admin gerencia só sua clínica)" },
      { tag: "feature", text: "Agenda agora tem visão mensal (grid 7×6 com mini-cards de eventos)" },
      { tag: "feature", text: "Super-admin pode acessar como administrador de qualquer clínica e excluir empresas" },
      { tag: "feature", text: "Banner de impersonação ao 'acessar como' admin de outra clínica" },
      { tag: "feature", text: "Versionador com changelog no rodapé (este aqui)" },
      { tag: "improve", text: "Animação de loading consistente em todas as páginas (spinner ring + halo pulsante)" },
      { tag: "improve", text: "Erros do backend agora aparecem legíveis no toast (resolve '[object Object]')" },
      { tag: "improve", text: "Favicon e ícone do app — símbolo Ψ em fundo teal" },
      { tag: "improve", text: "Cadastro de empresas: apenas Razão social, CNPJ, e-mail e senha do admin são obrigatórios" },
      { tag: "fix", text: "Idade do paciente aparecia como 'undefined' no detalhe (faltava no PatientDetail)" },
      { tag: "fix", text: "Recepção não conseguia abrir detalhe do paciente para agendar sessão" },
      { tag: "security", text: "JWT impersonation com claim 'impersonated_by' rastreado em audit_logs" },
    ],
  },
  {
    version: "0.1.0",
    date: "2026-05-07",
    items: [
      { tag: "feature", text: "MVP do PsiClinic — dashboard, agenda semanal, pacientes, sessões e anamnese" },
      { tag: "feature", text: "Multi-tenant com Row-Level Security e roles (super_admin, clinic_admin, doctor, receptionist)" },
      { tag: "security", text: "JWT com refresh-token rotativo e cifragem AES-256-GCM por tenant via HKDF" },
      { tag: "feature", text: "Auto-save de observações clínicas no editor TipTap" },
      { tag: "feature", text: "Audit log append-only para LGPD/CFM 1.638 (retenção de 20 anos)" },
    ],
  },
];

/** Versão "humana" — usada na pílula. */
export const VERSION_LABEL = `v${APP_VERSION}`;
