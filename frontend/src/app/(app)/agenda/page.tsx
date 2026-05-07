"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft, ChevronRight, CalendarDays, ListFilter, Plus, Clock, User,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  Badge, Button, PageHeader, Tabs, TabsList, TabsTrigger, TabsContent, useToast,
} from "@/components/ui";
import type { AgendaItem, SessionStatus } from "@/types";
import { cn } from "@/lib/utils";

/* ─── Helpers de data ─── */
const DAY_MS = 24 * 60 * 60 * 1000;
function startOfDay(d: Date): Date { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function startOfWeek(d: Date): Date {
  // Semana começa segunda-feira
  const x = startOfDay(d);
  const dow = (x.getDay() + 6) % 7; // 0 = segunda
  x.setDate(x.getDate() - dow);
  return x;
}
function addDays(d: Date, n: number): Date { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function sameDay(a: Date, b: Date): boolean { return a.toDateString() === b.toDateString(); }
function fmtWeekday(d: Date): string {
  return d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
}
function fmtDayLabel(d: Date): string {
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

const STATUS_VARIANT: Record<SessionStatus, "primary" | "info" | "success" | "muted" | "warning"> = {
  scheduled: "primary",
  in_progress: "info",
  completed: "success",
  cancelled: "muted",
  no_show: "warning",
};
const STATUS_LABEL: Record<SessionStatus, string> = {
  scheduled: "Agendada",
  in_progress: "Em andamento",
  completed: "Realizada",
  cancelled: "Cancelada",
  no_show: "Faltou",
};

export default function AgendaPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [view, setView] = useState<"week" | "list">("week");
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [loading, setLoading] = useState(false);

  const weekStart = useMemo(() => startOfWeek(anchor), [anchor]);
  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);

  async function load() {
    setLoading(true);
    try {
      const fromIso = weekStart.toISOString();
      const toIso = weekEnd.toISOString();
      const r = await api<AgendaItem[]>("/sessions", { query: { from: fromIso, to: toIso } });
      setItems(r);
    } catch (e: any) {
      toast("error", e.message || "Erro ao carregar agenda");
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [weekStart.getTime()]);

  // Stats: total / agendadas / realizadas
  const stats = useMemo(() => {
    const sched = items.filter((i) => i.status === "scheduled").length;
    const done = items.filter((i) => i.status === "completed").length;
    const noshow = items.filter((i) => i.status === "no_show" || i.status === "cancelled").length;
    return { total: items.length, sched, done, noshow };
  }, [items]);

  return (
    <>
      <PageHeader
        title="Agenda"
        description="Acompanhe suas próximas sessões e o calendário da semana."
        actions={
          <>
            <Button variant="secondary" onClick={() => setAnchor(new Date())}>Hoje</Button>
            <Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => router.push("/patients")}>
              Nova sessão
            </Button>
          </>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <Stat label="Sessões na semana" value={stats.total} accent="bg-primary/10 text-primary" />
        <Stat label="Agendadas" value={stats.sched} accent="bg-violet-50 text-violet-600" />
        <Stat label="Realizadas" value={stats.done} accent="bg-success-bg text-success" />
        <Stat label="Canceladas/faltou" value={stats.noshow} accent="bg-stone-100 text-stone-600" />
      </div>

      {/* Navegação de semana + view toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="icon-sm" onClick={() => setAnchor(addDays(weekStart, -7))} aria-label="Semana anterior">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <p className="text-body-sm text-brand-text font-medium px-2 min-w-[220px] text-center">
            {weekStart.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} —{" "}
            {addDays(weekStart, 6).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
          </p>
          <Button variant="secondary" size="icon-sm" onClick={() => setAnchor(addDays(weekStart, +7))} aria-label="Próxima semana">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        <Tabs value={view} onValueChange={(v) => setView(v as "week" | "list")}>
          <TabsList>
            <TabsTrigger value="week">
              <CalendarDays className="w-4 h-4" /> Semana
            </TabsTrigger>
            <TabsTrigger value="list">
              <ListFilter className="w-4 h-4" /> Lista
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {loading && <p className="text-brand-muted text-body-sm">Carregando…</p>}

      {!loading && view === "week" && (
        <WeekView weekStart={weekStart} items={items} onClick={(i) =>
          router.push(`/patients/${i.patient_id}/sessions/${i.id}` as any)} />
      )}

      {!loading && view === "list" && (
        <ListView weekStart={weekStart} items={items} />
      )}
    </>
  );
}

/* ─── Stat ─── */
function Stat({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="card-psiclinic p-4">
      <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center mb-3", accent)}>
        <CalendarDays className="w-4 h-4" />
      </div>
      <p className="text-caption text-brand-muted">{label}</p>
      <p className="text-2xl font-bold text-brand-text mt-0.5">{value}</p>
    </div>
  );
}

/* ─── Visão semana (grid 7 colunas) ─── */
function WeekView({
  weekStart, items, onClick,
}: { weekStart: Date; items: AgendaItem[]; onClick: (i: AgendaItem) => void }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = new Date();

  // Agrupa items por dia
  const byDay: Record<string, AgendaItem[]> = {};
  for (const it of items) {
    const d = startOfDay(new Date(it.scheduled_at)).toISOString();
    (byDay[d] ??= []).push(it);
  }
  Object.values(byDay).forEach((arr) =>
    arr.sort((a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at)),
  );

  return (
    <div className="card-psiclinic overflow-hidden">
      <div className="grid grid-cols-7 border-b border-brand-border bg-brand-bg-subtle">
        {days.map((d) => {
          const isToday = sameDay(d, today);
          return (
            <div key={d.toISOString()} className={cn(
              "px-3 py-2 text-center border-r border-brand-border last:border-r-0",
              isToday && "bg-primary-light",
            )}>
              <p className={cn(
                "text-label-upper uppercase",
                isToday ? "text-primary-dark font-semibold" : "text-brand-muted",
              )}>{fmtWeekday(d)}</p>
              <p className={cn(
                "text-heading-3 mt-0.5",
                isToday ? "text-primary-dark font-bold" : "text-brand-text",
              )}>{d.getDate()}</p>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-7 min-h-[480px]">
        {days.map((d) => {
          const slot = byDay[startOfDay(d).toISOString()] ?? [];
          const isToday = sameDay(d, today);
          return (
            <div key={d.toISOString()}
              className={cn(
                "p-2 border-r border-brand-border last:border-r-0 space-y-1.5",
                isToday && "bg-primary/[0.02]",
              )}>
              {slot.length === 0 && <p className="text-caption text-brand-muted text-center pt-3">—</p>}
              {slot.map((it) => (
                <button
                  key={it.id}
                  onClick={() => onClick(it)}
                  className={cn(
                    "w-full text-left rounded-lg px-2.5 py-2 border transition-all hover:shadow-sm hover:scale-[1.02]",
                    it.status === "completed"   && "bg-success-bg border-success-border",
                    it.status === "scheduled"   && "bg-primary-light border-primary-border",
                    it.status === "in_progress" && "bg-info-bg border-info-border ring-1 ring-info/30",
                    it.status === "cancelled"   && "bg-stone-100 border-stone-200 opacity-70",
                    it.status === "no_show"     && "bg-warning-bg border-warning-border",
                  )}
                >
                  <p className="text-caption font-semibold text-brand-text flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {fmtTime(it.scheduled_at)}
                  </p>
                  <p className="text-body-sm font-medium text-brand-text mt-0.5 truncate">{it.patient_name}</p>
                  <p className="text-caption text-brand-muted truncate">{it.doctor_name}</p>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Visão lista (agrupa por dia) ─── */
function ListView({ weekStart, items }: { weekStart: Date; items: AgendaItem[] }) {
  const router = useRouter();
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = new Date();
  const byDay: Record<string, AgendaItem[]> = {};
  for (const it of items) {
    const d = startOfDay(new Date(it.scheduled_at)).toISOString();
    (byDay[d] ??= []).push(it);
  }
  Object.values(byDay).forEach((arr) =>
    arr.sort((a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at)),
  );

  if (items.length === 0) {
    return (
      <div className="card-psiclinic p-12 text-center">
        <CalendarDays className="w-10 h-10 text-brand-muted mx-auto mb-3" />
        <p className="text-body-sm text-brand-muted">Nenhuma sessão nesta semana.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {days.map((d) => {
        const slot = byDay[startOfDay(d).toISOString()] ?? [];
        if (slot.length === 0) return null;
        const isToday = sameDay(d, today);
        return (
          <div key={d.toISOString()} className="card-psiclinic">
            <div className={cn(
              "px-5 py-3 border-b border-brand-border flex items-center justify-between",
              isToday ? "bg-primary-light" : "bg-brand-bg-subtle",
            )}>
              <p className={cn(
                "text-heading-4 capitalize",
                isToday ? "text-primary-dark font-semibold" : "text-brand-text",
              )}>
                {isToday ? "Hoje — " : ""}{fmtDayLabel(d)}
              </p>
              <Badge variant={isToday ? "primary" : "muted"}>{slot.length} sessã{slot.length > 1 ? "ões" : "o"}</Badge>
            </div>
            <ul className="divide-y divide-brand-border">
              {slot.map((it) => (
                <li key={it.id}>
                  <button
                    onClick={() => router.push(`/patients/${it.patient_id}/sessions/${it.id}` as any)}
                    className="w-full px-5 py-3 flex items-center justify-between gap-3 hover:bg-brand-bg-subtle text-left transition-colors"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-14 text-right">
                        <p className="text-heading-4 text-brand-text font-medium">{fmtTime(it.scheduled_at)}</p>
                        <p className="text-caption text-brand-muted">{it.duration_minutes}min</p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-body-sm font-medium text-brand-text truncate flex items-center gap-2">
                          <User className="w-3.5 h-3.5 text-brand-muted shrink-0" />
                          {it.patient_name}
                        </p>
                        <p className="text-caption text-brand-muted truncate mt-0.5">{it.doctor_name}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {it.locked_at && <Badge variant="muted">🔒</Badge>}
                      <Badge dot variant={STATUS_VARIANT[it.status]}>{STATUS_LABEL[it.status]}</Badge>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
