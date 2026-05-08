"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft, ChevronRight, CalendarDays, ListFilter, Plus, Clock, User,
  CalendarRange,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  Badge, Button, LoadingState, PageHeader, Tabs, TabsList, TabsTrigger, useToast,
} from "@/components/ui";
import type { AgendaItem, SessionStatus } from "@/types";
import { cn } from "@/lib/utils";

/* ─── Helpers de data ─── */
function startOfDay(d: Date): Date { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function startOfWeek(d: Date): Date {
  // Semana começa segunda-feira
  const x = startOfDay(d);
  const dow = (x.getDay() + 6) % 7; // 0 = segunda
  x.setDate(x.getDate() - dow);
  return x;
}
function startOfMonth(d: Date): Date {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}
function addDays(d: Date, n: number): Date { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function addMonths(d: Date, n: number): Date { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; }
function sameDay(a: Date, b: Date): boolean { return a.toDateString() === b.toDateString(); }
function fmtWeekday(d: Date): string {
  return d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
}
function fmtDayLabel(d: Date): string {
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
}
function fmtMonthLabel(d: Date): string {
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
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
/** Cor curta usada nas pílulas dentro das células do mês. */
const STATUS_DOT_BG: Record<SessionStatus, string> = {
  scheduled: "bg-primary",
  in_progress: "bg-blue-500",
  completed: "bg-green-500",
  cancelled: "bg-stone-400",
  no_show: "bg-amber-500",
};

type View = "week" | "month" | "list";

export default function AgendaPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Range de fetch — varia por view. Mes inclui dias do grid (semana anterior+seguinte).
  const range = useMemo(() => {
    if (view === "month") {
      const gridStart = startOfWeek(startOfMonth(anchor));
      const gridEnd = addDays(gridStart, 42); // 6 semanas
      return { start: gridStart, end: gridEnd };
    }
    const ws = startOfWeek(anchor);
    return { start: ws, end: addDays(ws, 7) };
  }, [view, anchor]);

  async function load() {
    setLoading(true);
    try {
      const r = await api<AgendaItem[]>("/sessions", {
        query: { from: range.start.toISOString(), to: range.end.toISOString() },
      });
      setItems(r);
    } catch (e: any) {
      toast("error", e.message || "Erro ao carregar agenda");
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [range.start.getTime(), range.end.getTime()]);

  // Stats cobrem só o intervalo "principal" (semana ou mês corrente — não o grid inteiro).
  const stats = useMemo(() => {
    let filtered = items;
    if (view === "month") {
      const ms = startOfMonth(anchor);
      const me = startOfMonth(addMonths(anchor, 1));
      filtered = items.filter((i) => {
        const t = +new Date(i.scheduled_at);
        return t >= +ms && t < +me;
      });
    }
    const sched = filtered.filter((i) => i.status === "scheduled").length;
    const done = filtered.filter((i) => i.status === "completed").length;
    const noshow = filtered.filter((i) => i.status === "no_show" || i.status === "cancelled").length;
    return { total: filtered.length, sched, done, noshow };
  }, [items, view, anchor]);

  // Navegação: ± 1 unidade da view atual
  function navigate(direction: -1 | 1) {
    if (view === "month") {
      setAnchor((a) => addMonths(a, direction));
    } else {
      setAnchor((a) => addDays(a, direction * 7));
    }
  }

  // Texto do range exibido no header de navegação
  const rangeLabel = useMemo(() => {
    if (view === "month") {
      const lbl = fmtMonthLabel(anchor);
      return lbl.charAt(0).toUpperCase() + lbl.slice(1);
    }
    const ws = startOfWeek(anchor);
    return `${ws.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} — ${
      addDays(ws, 6).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
    }`;
  }, [view, anchor]);

  const totalLabel = view === "month" ? "Sessões no mês" : "Sessões na semana";

  return (
    <>
      <PageHeader
        title="Agenda"
        description="Acompanhe suas próximas sessões e o calendário."
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
        <Stat label={totalLabel} value={stats.total} accent="bg-primary/10 text-primary" />
        <Stat label="Agendadas" value={stats.sched} accent="bg-violet-50 text-violet-600" />
        <Stat label="Realizadas" value={stats.done} accent="bg-success-bg text-success" />
        <Stat label="Canceladas/faltou" value={stats.noshow} accent="bg-stone-100 text-stone-600" />
      </div>

      {/* Navegação + view toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="icon-sm" onClick={() => navigate(-1)}
            aria-label={view === "month" ? "Mês anterior" : "Semana anterior"}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <p className="text-body-sm text-brand-text font-medium px-2 min-w-[220px] text-center capitalize">
            {rangeLabel}
          </p>
          <Button variant="secondary" size="icon-sm" onClick={() => navigate(+1)}
            aria-label={view === "month" ? "Próximo mês" : "Próxima semana"}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        <Tabs value={view} onValueChange={(v) => setView(v as View)}>
          <TabsList>
            <TabsTrigger value="week">
              <CalendarDays className="w-4 h-4" /> Semana
            </TabsTrigger>
            <TabsTrigger value="month">
              <CalendarRange className="w-4 h-4" /> Mês
            </TabsTrigger>
            <TabsTrigger value="list">
              <ListFilter className="w-4 h-4" /> Lista
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {loading && <LoadingState message="Carregando agenda" hint="Buscando sessões do período" />}

      {!loading && view === "week" && (
        <WeekView weekStart={startOfWeek(anchor)} items={items} onClick={(i) =>
          router.push(`/patients/${i.patient_id}/sessions/${i.id}` as any)} />
      )}

      {!loading && view === "month" && (
        <MonthView
          anchor={anchor}
          items={items}
          onClickItem={(i) => router.push(`/patients/${i.patient_id}/sessions/${i.id}` as any)}
          onClickDay={(d) => { setAnchor(d); setView("week"); }}
        />
      )}

      {!loading && view === "list" && (
        <ListView weekStart={startOfWeek(anchor)} items={items} />
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

/* ─── Visão mês (grid 7 col x 6 semanas) ─── */
function MonthView({
  anchor, items, onClickItem, onClickDay,
}: {
  anchor: Date;
  items: AgendaItem[];
  onClickItem: (i: AgendaItem) => void;
  onClickDay: (d: Date) => void;
}) {
  const today = new Date();
  const monthStart = startOfMonth(anchor);
  const gridStart = startOfWeek(monthStart);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  // Agrupa items por dia
  const byDay: Record<string, AgendaItem[]> = {};
  for (const it of items) {
    const d = startOfDay(new Date(it.scheduled_at)).toISOString();
    (byDay[d] ??= []).push(it);
  }
  Object.values(byDay).forEach((arr) =>
    arr.sort((a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at)),
  );

  const weekHeaders = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

  return (
    <div className="card-psiclinic overflow-hidden">
      {/* Cabeçalho com dias da semana */}
      <div className="grid grid-cols-7 border-b border-brand-border bg-brand-bg-subtle">
        {weekHeaders.map((h) => (
          <div key={h} className="px-3 py-2 text-center border-r border-brand-border last:border-r-0">
            <p className="text-label-upper uppercase text-brand-muted">{h}</p>
          </div>
        ))}
      </div>

      {/* Grid 6 semanas */}
      <div className="grid grid-cols-7 grid-rows-6 auto-rows-fr">
        {days.map((d) => {
          const slot = byDay[startOfDay(d).toISOString()] ?? [];
          const inMonth = d.getMonth() === monthStart.getMonth();
          const isToday = sameDay(d, today);
          // Mostra até 3 eventos visíveis. O resto vira "+N mais".
          const VISIBLE = 3;
          const visible = slot.slice(0, VISIBLE);
          const overflow = slot.length - visible.length;

          return (
            <div
              key={d.toISOString()}
              className={cn(
                "min-h-[110px] p-1.5 border-r border-b border-brand-border last:border-r-0",
                "flex flex-col gap-1",
                !inMonth && "bg-stone-50/60",
                isToday && "bg-primary-light/40",
              )}
            >
              {/* Cabeçalho do dia (clicável p/ ir pra view semana daquele dia) */}
              <button
                onClick={() => onClickDay(d)}
                className={cn(
                  "self-end text-caption rounded-md px-1.5 py-0.5 transition-colors",
                  isToday
                    ? "bg-primary text-white font-bold"
                    : inMonth
                      ? "text-brand-text hover:bg-primary-light hover:text-primary-dark"
                      : "text-brand-muted hover:bg-stone-100",
                )}
                title={`Ir para semana de ${d.toLocaleDateString("pt-BR")}`}
              >
                {d.getDate()}
              </button>

              {/* Eventos */}
              <div className="flex-1 flex flex-col gap-1 min-h-0 overflow-hidden">
                {visible.map((it) => (
                  <button
                    key={it.id}
                    onClick={(e) => { e.stopPropagation(); onClickItem(it); }}
                    className={cn(
                      "w-full text-left rounded px-1.5 py-1 border text-[11px] leading-tight",
                      "hover:shadow-sm hover:scale-[1.02] transition-all",
                      "flex items-center gap-1.5 min-w-0",
                      it.status === "completed"   && "bg-success-bg border-success-border",
                      it.status === "scheduled"   && "bg-primary-light border-primary-border",
                      it.status === "in_progress" && "bg-info-bg border-info-border",
                      it.status === "cancelled"   && "bg-stone-100 border-stone-200 opacity-70",
                      it.status === "no_show"     && "bg-warning-bg border-warning-border",
                    )}
                    title={`${fmtTime(it.scheduled_at)} • ${it.patient_name} • ${it.doctor_name}`}
                  >
                    <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", STATUS_DOT_BG[it.status])} />
                    <span className="font-medium tabular-nums shrink-0">{fmtTime(it.scheduled_at)}</span>
                    <span className="truncate text-brand-text">{it.patient_name}</span>
                  </button>
                ))}
                {overflow > 0 && (
                  <button
                    onClick={() => onClickDay(d)}
                    className="text-caption text-primary hover:underline text-left px-1.5"
                  >
                    +{overflow} mais
                  </button>
                )}
              </div>
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
