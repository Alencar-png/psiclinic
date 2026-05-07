"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Lock, Calendar, FilePlus2, Play, Pencil, History, ChevronDown, ChevronUp,
  Clock, User, FileText, Plus, AlertTriangle,
} from "lucide-react";
import { api } from "@/lib/api";
import { RichTextEditor } from "@/components/clinical/RichTextEditor";
import { useAutoSave } from "@/hooks/useAutoSave";
import {
  Badge, Button, Input, Modal, PageHeader, Select, useConfirm, useToast,
} from "@/components/ui";
import { formatDateTimeBR } from "@/lib/format";
import type { SessionDetail, SessionStatus } from "@/types";

const STATUS_LABEL: Record<SessionStatus, string> = {
  scheduled: "Agendada",
  in_progress: "Em andamento",
  completed: "Realizada",
  cancelled: "Cancelada",
  no_show: "Faltou",
};
const STATUS_VARIANT: Record<SessionStatus, "primary" | "info" | "success" | "muted" | "warning"> = {
  scheduled: "primary",
  in_progress: "info",
  completed: "success",
  cancelled: "muted",
  no_show: "warning",
};

interface HistoryEntry {
  id: number;
  action: string;
  entity_type: string;
  user_id: number | null;
  user_name: string | null;
  occurred_at: string;
  payload_diff: any | null;
  /** Presente apenas em entradas de grupo de auto-save (action="autosave_group"). */
  count?: number;
  last_at?: string;
}

function actionLabel(e: HistoryEntry): string {
  if (e.entity_type === "clinical_session_observations") {
    if (e.action === "autosave_group") return `Auto-save de observações (${e.count}×)`;
    if (e.action === "autosave")       return "Auto-save de observações";
    if (e.action === "update")         return "Observações editadas";
  }
  switch (e.action) {
    case "create":   return "Sessão criada";
    case "update":   return "Sessão alterada";
    case "start":    return "Sessão iniciada";
    case "addendum": return "Adendo criado";
    case "lock":     return "Sessão bloqueada";
    case "delete":   return "Sessão removida";
    default:         return e.action;
  }
}

function diffSummary(d: any): string | null {
  if (!d || typeof d !== "object") return null;
  const parts: string[] = [];
  for (const [k, v] of Object.entries(d)) {
    const val: any = v;
    if (val && typeof val === "object" && "new" in val) {
      const old = "old" in val ? `de ${JSON.stringify(val.old)} → ` : "";
      parts.push(`${k}: ${old}${JSON.stringify(val.new)}`);
    }
  }
  return parts.length ? parts.join(" • ") : null;
}

export default function SessionPage() {
  const router = useRouter();
  const { id, sid } = useParams<{ id: string; sid: string }>();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(true);

  // Modal de reagendamento
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [reschedDate, setReschedDate] = useState("");
  const [reschedDuration, setReschedDuration] = useState(50);
  const [reschedSubmitting, setReschedSubmitting] = useState(false);

  async function load() {
    try {
      const [s, h] = await Promise.all([
        api<SessionDetail>(`/sessions/${sid}`),
        api<HistoryEntry[]>(`/sessions/${sid}/history`),
      ]);
      setSession(s);
      setHistory(h);
      setReschedDate(s.scheduled_at.slice(0, 16));
      setReschedDuration(s.duration_minutes);
    } catch (e: any) { toast("error", e.message); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [sid]);

  /* Auto-save de observações */
  const { schedule, status: saveStatus, lastSavedAt } = useAutoSave({
    delayMs: 1500,
    async onSave(html, plain) {
      await api(`/sessions/${sid}/observations?autosave=true`, {
        method: "PUT",
        body: { observations_html: html, observations_plain: plain },
      });
    },
  });

  /* Ações */
  async function startNow() {
    try {
      await api(`/sessions/${sid}/start`, { method: "POST" });
      toast("success", "Sessão iniciada.");
      load();
    } catch (e: any) { toast("error", e.message); }
  }

  async function changeStatus(next: SessionStatus) {
    try {
      await api(`/sessions/${sid}`, { method: "PATCH", body: { status: next } });
      toast("success", `Status alterado para "${STATUS_LABEL[next]}".`);
      load();
    } catch (e: any) { toast("error", e.message); }
  }

  async function submitReschedule(e: React.FormEvent) {
    e.preventDefault();
    if (!reschedDate) return;
    setReschedSubmitting(true);
    try {
      await api(`/sessions/${sid}`, {
        method: "PATCH",
        body: {
          scheduled_at: new Date(reschedDate).toISOString(),
          duration_minutes: reschedDuration,
        },
      });
      toast("success", "Sessão reagendada.");
      setRescheduleOpen(false);
      load();
    } catch (e: any) { toast("error", e.message); }
    finally { setReschedSubmitting(false); }
  }

  async function lock() {
    const ok = await confirm({
      title: "Bloquear sessão?",
      message: "Após bloqueio, observações ficam imutáveis. Para corrigir, será necessário criar um adendo (nova sessão filha).",
      variant: "warning",
      confirmLabel: "Bloquear",
    });
    if (!ok) return;
    try {
      await api(`/sessions/${sid}/lock`, { method: "POST" });
      toast("success", "Sessão bloqueada.");
      load();
    } catch (e: any) { toast("error", e.message); }
  }

  async function createAddendum() {
    const ok = await confirm({
      title: "Criar adendo?",
      message: "Será criada uma nova sessão filha onde você pode adicionar correções/observações ao prontuário.",
      confirmLabel: "Criar adendo",
    });
    if (!ok) return;
    try {
      const r = await api<SessionDetail>(`/sessions/${sid}/addendum`, {
        method: "POST",
        body: { observations_html: "<p>Adendo:</p>", observations_plain: "Adendo:" },
      });
      toast("success", "Adendo criado.");
      router.push(`/patients/${id}/sessions/${r.id}` as any);
    } catch (e: any) { toast("error", e.message); }
  }

  if (!session) return <p className="text-brand-muted text-body-sm">Carregando…</p>;

  const locked = !!session.locked_at;
  const status = session.status;

  return (
    <>
      <PageHeader
        title={`Sessão de ${formatDateTimeBR(session.scheduled_at)}`}
        description={`${session.doctor_name} • ${session.duration_minutes} min`}
        back={{ href: `/patients/${id}` }}
        actions={
          <>
            {locked && <Badge variant="muted">🔒 Bloqueada</Badge>}
            {!locked && status === "scheduled" && (
              <Button leftIcon={<Play className="w-4 h-4" />} onClick={startNow}>
                Iniciar sessão
              </Button>
            )}
            {!locked && status === "in_progress" && (
              <Button variant="primary" leftIcon={<FileText className="w-4 h-4" />}
                onClick={() => changeStatus("completed")}>
                Finalizar como realizada
              </Button>
            )}
            {!locked && (
              <Button variant="secondary" leftIcon={<Pencil className="w-4 h-4" />}
                onClick={() => setRescheduleOpen(true)}>
                Reagendar
              </Button>
            )}
            {!locked && status !== "completed" && (
              <Button variant="secondary" leftIcon={<Lock className="w-4 h-4" />} onClick={lock}>
                Bloquear
              </Button>
            )}
            {locked && (
              <Button leftIcon={<FilePlus2 className="w-4 h-4" />} onClick={createAddendum}>
                Criar adendo
              </Button>
            )}
          </>
        }
      />

      {/* Cards de meta — 3 colunas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <MetaCard icon={Clock} label="Status">
          <Badge dot variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
        </MetaCard>
        <MetaCard icon={Calendar} label="Agendada para">
          <p className="text-body-sm text-brand-text">{formatDateTimeBR(session.scheduled_at)}</p>
          <p className="text-caption text-brand-muted">{session.duration_minutes} minutos</p>
        </MetaCard>
        <MetaCard icon={User} label="Médico">
          <p className="text-body-sm text-brand-text">{session.doctor_name}</p>
        </MetaCard>
      </div>

      {/* Observações */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-heading-3 text-brand-text">Observações da sessão</h2>
          <p className="text-caption text-brand-muted">
            {saveStatus === "saving" && "Salvando…"}
            {saveStatus === "saved" && lastSavedAt && `Salvo às ${lastSavedAt.toLocaleTimeString("pt-BR")}`}
            {saveStatus === "error" && <span className="text-error">Erro ao salvar</span>}
          </p>
        </div>
        {locked && (
          <div className="mb-3 rounded-xl bg-warning-bg border border-warning-border px-4 py-3 text-sm text-warning flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Sessão bloqueada para edição</p>
              <p className="text-caption mt-0.5">Use o botão <strong>Criar adendo</strong> para correções.</p>
            </div>
          </div>
        )}
        <RichTextEditor
          value={session.observations_html ?? ""}
          disabled={locked}
          onChange={(html, plain) => schedule(html, plain)}
        />
        <p className="mt-2 text-caption text-brand-muted">
          Auto-save a cada 1,5s de inatividade. Conteúdo cifrado em repouso (AES-256-GCM).
        </p>
      </section>

      {/* Histórico de alterações */}
      <section className="card-psiclinic">
        <button
          type="button"
          onClick={() => setHistoryOpen((o) => !o)}
          className="w-full px-5 py-3 flex items-center justify-between hover:bg-brand-bg-subtle transition-colors"
        >
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-violet-50">
              <History className="w-4 h-4 text-violet-600" />
            </div>
            <h3 className="text-heading-4 font-medium text-brand-text">
              Histórico de alterações
            </h3>
            <Badge variant="muted">{history.length}</Badge>
          </div>
          {historyOpen ? <ChevronUp className="w-4 h-4 text-brand-muted" /> : <ChevronDown className="w-4 h-4 text-brand-muted" />}
        </button>

        {historyOpen && (
          <div className="border-t border-brand-border">
            {history.length === 0 ? (
              <p className="px-5 py-8 text-center text-body-sm text-brand-muted">
                Sem alterações registradas ainda.
              </p>
            ) : (
              <ol className="divide-y divide-brand-border">
                {history.map((e) => {
                  const summary = diffSummary(e.payload_diff);
                  return (
                    <li key={e.id} className="px-5 py-3 flex items-start gap-3">
                      <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-body-sm font-medium text-brand-text">
                            {actionLabel(e)}
                          </p>
                          <p className="text-caption text-brand-muted shrink-0">
                            {formatDateTimeBR(e.occurred_at)}
                            {e.action === "autosave_group" && e.last_at && (
                              <> – {formatDateTimeBR(e.last_at)}</>
                            )}
                          </p>
                        </div>
                        <p className="text-caption text-brand-muted mt-0.5">
                          por {e.user_name ?? `usuário #${e.user_id ?? "—"}`}
                        </p>
                        {summary && (
                          <p className="text-caption text-brand-text-2 mt-1 break-words font-mono bg-brand-bg-subtle rounded px-2 py-1 inline-block">
                            {summary}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        )}
      </section>

      {/* Modal Reagendar */}
      <Modal
        open={rescheduleOpen}
        onClose={() => setRescheduleOpen(false)}
        title="Reagendar sessão"
        description="A alteração será registrada no histórico."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRescheduleOpen(false)}>Cancelar</Button>
            <Button onClick={submitReschedule} loading={reschedSubmitting}>
              Confirmar reagendamento
            </Button>
          </>
        }
      >
        <form onSubmit={submitReschedule} className="space-y-4">
          <Input
            label="Nova data e hora" type="datetime-local" required
            value={reschedDate} onChange={(e) => setReschedDate(e.target.value)}
          />
          <Input
            label="Duração (minutos)" type="number" min={5} max={240} required
            value={reschedDuration} onChange={(e) => setReschedDuration(Number(e.target.value))}
          />
          <p className="text-caption text-brand-muted">
            Antes: <strong>{formatDateTimeBR(session.scheduled_at)}</strong> ({session.duration_minutes} min)
          </p>
        </form>
      </Modal>
    </>
  );
}

/* ─── MetaCard ─── */
function MetaCard({ icon: Icon, label, children }: { icon: any; label: string; children: React.ReactNode }) {
  return (
    <div className="card-psiclinic p-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-label-upper uppercase text-brand-muted">{label}</p>
          <div className="mt-1">{children}</div>
        </div>
      </div>
    </div>
  );
}
