"use client";

/**
 * Dashboard moderno — consome /api/dashboard/me (dados reais do banco).
 *
 * Layout adaptativo por role:
 *   - doctor      → KPIs do médico, agenda do dia, sparkline 14d, status, aniversariantes
 *   - clinic_admin / receptionist → KPIs da clínica, agenda do dia, ocupação por médico,
 *                                   donut de status, distribuição por gênero, aniversariantes,
 *                                   últimos pacientes, distribuição semanal
 *   - super_admin → KPIs globais
 *
 * Tudo SVG inline (sem dependência de chart libs) para manter o bundle leve
 * e o tema consistente com o resto do app.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Briefcase,
  Building2,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  Cake,
  CheckCircle2,
  ClipboardList,
  Clock,
  Plus,
  Sparkles,
  Stethoscope,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";
import { api } from "@/lib/api";
import { formatDateTimeBR } from "@/lib/format";
import { Badge, PageHeader } from "@/components/ui";
import { cn } from "@/lib/utils";

/* ───────────────────────── tipos ─────────────────────────── */
type AgendaItem = {
  id: string;
  patient_id: string;
  patient_name: string;
  doctor_id: number;
  doctor_name: string;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
};

type AdminData = {
  kind: "clinic_admin" | "receptionist";
  company_id: number;
  kpis: {
    active_patients: number;
    total_patients: number;
    new_patients_30d: number;
    sessions_today: number;
    sessions_week: number;
    sessions_month: number;
    no_show_30d: number;
    no_show_rate: number | null;
    doctors_active: number;
  };
  today_agenda: AgendaItem[];
  occupancy_by_doctor: { doctor_id: number; doctor: string; specialty: string; sessions: number }[];
  sessions_by_day_14d: { date: string; count: number }[];
  sessions_by_weekday_30d: { weekday: string; count: number }[];
  status_distribution_30d: { status: string; count: number }[];
  patient_status_distribution: { status: string; count: number }[];
  gender_distribution: { gender: string; count: number }[];
  birthdays_this_month: { id: string; full_name: string; day: number; age_turning: number; gender: string | null }[];
  last_patients: { id: string; full_name: string; initials: string; age: number; gender: string | null; status: string; created_at: string | null }[];
};

type DoctorData = {
  kind: "doctor";
  doctor_name: string;
  kpis: {
    active_patients: number;
    sessions_today: number;
    sessions_week: number;
    completed_30d: number;
    no_show_30d: number;
    adherence_rate: number | null;
  };
  today_agenda: AgendaItem[];
  upcoming_sessions: AgendaItem[];
  sessions_by_day_14d: { date: string; count: number }[];
  sessions_by_weekday_30d: { weekday: string; count: number }[];
  status_distribution_30d: { status: string; count: number }[];
  birthdays_this_month: { id: string; full_name: string; day: number; age_turning: number; gender: string | null }[];
};

type SuperData = {
  kind: "super_admin";
  active_companies: number;
  total_sessions: number;
  total_patients: number;
  total_doctors: number;
};

type Dashboard = AdminData | DoctorData | SuperData;

/* ───────────────────────── status helpers ─────────────────────────── */
const STATUS_LABEL: Record<string, string> = {
  scheduled: "Agendada",
  in_progress: "Em curso",
  completed: "Realizada",
  cancelled: "Cancelada",
  no_show: "Faltou",
};
const STATUS_COLOR: Record<string, string> = {
  scheduled: "#0e7490",
  in_progress: "#1d4ed8",
  completed: "#16a34a",
  cancelled: "#a8a29e",
  no_show: "#d97706",
};

/* ───────────────────────── página ─────────────────────────── */
export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Dashboard>("/dashboard/me")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="card-psiclinic p-6 border-error/40 bg-error-bg/40">
        <p className="text-body-sm text-error font-medium">Erro ao carregar painel</p>
        <p className="text-caption text-brand-muted mt-1">{error}</p>
      </div>
    );
  }
  if (!data) return <DashboardSkeleton />;

  return (
    <>
      <PageHeader
        title={greeting()}
        description={
          data.kind === "doctor" ? `Olá, ${data.doctor_name}. Aqui está o resumo do seu dia.`
          : data.kind === "receptionist" ? "Visão da recepção — agenda, sessões e médicos."
          : data.kind === "clinic_admin" ? "Visão executiva da clínica em tempo real."
          : "Visão SaaS — agregados de todas as empresas."
        }
      />

      {data.kind === "doctor" && <DoctorDashboard data={data} />}
      {(data.kind === "clinic_admin" || data.kind === "receptionist") && <AdminDashboard data={data} />}
      {data.kind === "super_admin" && <SuperDashboard data={data} />}
    </>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

/* ───────────────────────── ADMIN / RECEPCIONISTA ─────────────────────────── */
function AdminDashboard({ data }: { data: AdminData }) {
  const k = data.kpis;
  const isReceptionist = data.kind === "receptionist";

  return (
    <>
      {/* KPIs hero */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <KpiCard
          icon={Users}
          accent="cyan"
          label="Pacientes ativos"
          value={k.active_patients}
          hint={k.new_patients_30d ? `+${k.new_patients_30d} nos últimos 30d` : "estável"}
          trend={k.new_patients_30d > 0 ? "up" : "neutral"}
          spark={data.sessions_by_day_14d.map((d) => d.count)}
        />
        <KpiCard
          icon={CalendarClock}
          accent="violet"
          label="Sessões hoje"
          value={k.sessions_today}
          hint={`${k.sessions_week} esta semana`}
          spark={data.sessions_by_day_14d.map((d) => d.count)}
        />
        <KpiCard
          icon={Activity}
          accent="emerald"
          label="Sessões no mês"
          value={k.sessions_month}
          hint={`${k.doctors_active} médicos ativos`}
          spark={data.sessions_by_day_14d.map((d) => d.count)}
        />
        <KpiCard
          icon={AlertTriangle}
          accent="amber"
          label="Taxa de no-show 30d"
          value={k.no_show_rate != null ? `${k.no_show_rate}%` : "—"}
          hint={`${k.no_show_30d} faltas em 30 dias`}
          trend={k.no_show_rate && k.no_show_rate > 15 ? "down" : "neutral"}
        />
      </div>

      {/* Linha 1: Agenda hoje + Sessões 14d */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-6">
        <div className="xl:col-span-2 card-psiclinic">
          <div className="px-5 py-4 border-b border-brand-border bg-brand-bg-subtle flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <CalendarDays className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-heading-3 text-brand-text">Agenda de hoje</h2>
                <p className="text-caption text-brand-muted">{data.today_agenda.length} sessões programadas</p>
              </div>
            </div>
            {isReceptionist && (
              <Link
                href="/patients"
                className="btn btn-primary btn-sm"
              >
                <Plus className="w-3.5 h-3.5" /> Agendar
              </Link>
            )}
          </div>
          <AgendaList items={data.today_agenda} emptyHint="Nenhuma sessão hoje. Aproveite o café ☕" />
        </div>

        <div className="card-psiclinic">
          <div className="px-5 py-4 border-b border-brand-border bg-brand-bg-subtle">
            <h2 className="text-heading-3 text-brand-text">Sessões — últimos 14 dias</h2>
            <p className="text-caption text-brand-muted">não inclui canceladas</p>
          </div>
          <div className="p-5">
            <BarChart14d data={data.sessions_by_day_14d} />
          </div>
        </div>
      </div>

      {/* Linha 2: Ocupação médicos + Donut de status */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-6">
        <div className="xl:col-span-2 card-psiclinic">
          <div className="px-5 py-4 border-b border-brand-border bg-brand-bg-subtle flex items-center justify-between">
            <h2 className="text-heading-3 text-brand-text">Ocupação por médico (mês corrente)</h2>
            <Badge variant="muted">{data.kpis.sessions_month} sessões totais</Badge>
          </div>
          <div className="divide-y divide-brand-border">
            {data.occupancy_by_doctor.length === 0 && (
              <p className="px-5 py-8 text-center text-brand-muted text-body-sm">Nenhuma sessão este mês.</p>
            )}
            {data.occupancy_by_doctor.map((d, i) => {
              const max = Math.max(...data.occupancy_by_doctor.map((x) => x.sessions));
              const pct = max > 0 ? (d.sessions / max) * 100 : 0;
              const palette = ["bg-primary", "bg-violet-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500"];
              return (
                <div key={d.doctor_id} className="px-5 py-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-primary/10 text-primary-dark flex items-center justify-center font-semibold text-sm">
                        {initialsOf(d.doctor)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-body-sm font-medium text-brand-text truncate">{d.doctor}</p>
                        <p className="text-caption text-brand-muted truncate">{d.specialty || "—"}</p>
                      </div>
                    </div>
                    <p className="text-body-sm font-semibold text-brand-text shrink-0 tabular-nums">{d.sessions}</p>
                  </div>
                  <div className="h-2 rounded-full bg-brand-bg-muted overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all duration-500", palette[i % palette.length])}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card-psiclinic">
          <div className="px-5 py-4 border-b border-brand-border bg-brand-bg-subtle">
            <h2 className="text-heading-3 text-brand-text">Status (30d)</h2>
            <p className="text-caption text-brand-muted">distribuição das sessões</p>
          </div>
          <div className="p-5">
            <Donut
              segments={data.status_distribution_30d.map((s) => ({
                key: s.status,
                label: STATUS_LABEL[s.status] ?? s.status,
                value: s.count,
                color: STATUS_COLOR[s.status] ?? "#6b7280",
              }))}
            />
          </div>
        </div>
      </div>

      {/* Linha 3: Distribuição semanal + Gênero + Status pacientes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="card-psiclinic">
          <div className="px-5 py-4 border-b border-brand-border bg-brand-bg-subtle">
            <h2 className="text-heading-3 text-brand-text">Distribuição semanal</h2>
            <p className="text-caption text-brand-muted">sessões por dia da semana — 30d</p>
          </div>
          <div className="p-5">
            <WeekdayBar data={data.sessions_by_weekday_30d} />
          </div>
        </div>

        <div className="card-psiclinic">
          <div className="px-5 py-4 border-b border-brand-border bg-brand-bg-subtle">
            <h2 className="text-heading-3 text-brand-text">Pacientes por gênero</h2>
            <p className="text-caption text-brand-muted">somente ativos</p>
          </div>
          <div className="p-5 space-y-3">
            {data.gender_distribution.map((g) => {
              const total = data.gender_distribution.reduce((a, b) => a + b.count, 0);
              const pct = total > 0 ? (g.count / total) * 100 : 0;
              const label = g.gender === "F" ? "Feminino" : g.gender === "M" ? "Masculino" : "Não informado";
              const color = g.gender === "F" ? "bg-rose-400" : g.gender === "M" ? "bg-cyan-500" : "bg-stone-400";
              return (
                <div key={g.gender}>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-body-sm text-brand-text">{label}</p>
                    <p className="text-body-sm tabular-nums text-brand-text font-medium">
                      {g.count} <span className="text-caption text-brand-muted">({pct.toFixed(0)}%)</span>
                    </p>
                  </div>
                  <div className="h-2 rounded-full bg-brand-bg-muted overflow-hidden">
                    <div className={cn("h-full transition-all", color)} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card-psiclinic">
          <div className="px-5 py-4 border-b border-brand-border bg-brand-bg-subtle">
            <h2 className="text-heading-3 text-brand-text">Status dos pacientes</h2>
            <p className="text-caption text-brand-muted">total cadastrado</p>
          </div>
          <div className="p-5 space-y-3">
            {data.patient_status_distribution.map((s) => {
              const total = data.patient_status_distribution.reduce((a, b) => a + b.count, 0);
              const pct = total > 0 ? (s.count / total) * 100 : 0;
              const meta: Record<string, { label: string; color: string }> = {
                active: { label: "Ativos", color: "bg-success" },
                inactive: { label: "Inativos", color: "bg-stone-400" },
                discharged: { label: "Alta", color: "bg-info" },
              };
              const m = meta[s.status] || { label: s.status, color: "bg-stone-400" };
              return (
                <div key={s.status}>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-body-sm text-brand-text">{m.label}</p>
                    <p className="text-body-sm tabular-nums text-brand-text font-medium">
                      {s.count} <span className="text-caption text-brand-muted">({pct.toFixed(0)}%)</span>
                    </p>
                  </div>
                  <div className="h-2 rounded-full bg-brand-bg-muted overflow-hidden">
                    <div className={cn("h-full transition-all", m.color)} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Linha 4: Aniversariantes + Últimos pacientes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card-psiclinic">
          <div className="px-5 py-4 border-b border-brand-border bg-brand-bg-subtle flex items-center gap-2">
            <Cake className="w-4 h-4 text-rose-500" />
            <h2 className="text-heading-3 text-brand-text">Aniversariantes do mês</h2>
            <Badge variant="muted" className="ml-auto">{data.birthdays_this_month.length}</Badge>
          </div>
          {data.birthdays_this_month.length === 0 ? (
            <p className="px-5 py-8 text-center text-brand-muted text-body-sm">Nenhum aniversariante este mês.</p>
          ) : (
            <ul className="divide-y divide-brand-border">
              {data.birthdays_this_month.map((b) => (
                <li key={b.id}>
                  <Link
                    href={`/patients/${b.id}` as any}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-brand-bg-subtle transition-colors"
                  >
                    <div className="w-9 h-9 rounded-full bg-rose-50 text-rose-700 flex items-center justify-center text-sm font-semibold shrink-0">
                      {initialsOf(b.full_name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-body-sm font-medium text-brand-text truncate">{b.full_name}</p>
                      <p className="text-caption text-brand-muted">Faz {b.age_turning} anos</p>
                    </div>
                    <Badge variant="primary">Dia {b.day}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card-psiclinic">
          <div className="px-5 py-4 border-b border-brand-border bg-brand-bg-subtle flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-primary" />
            <h2 className="text-heading-3 text-brand-text">Últimos pacientes cadastrados</h2>
          </div>
          {data.last_patients.length === 0 ? (
            <p className="px-5 py-8 text-center text-brand-muted text-body-sm">Nenhum paciente cadastrado ainda.</p>
          ) : (
            <ul className="divide-y divide-brand-border">
              {data.last_patients.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/patients/${p.id}` as any}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-brand-bg-subtle transition-colors"
                  >
                    <div className="w-9 h-9 rounded-full bg-primary/10 text-primary-dark flex items-center justify-center text-sm font-semibold shrink-0">
                      {p.initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-body-sm font-medium text-brand-text truncate">{p.full_name}</p>
                      <p className="text-caption text-brand-muted">
                        {p.age} anos • {p.gender === "F" ? "Feminino" : p.gender === "M" ? "Masculino" : "—"}
                      </p>
                    </div>
                    <Badge variant={p.status === "active" ? "success" : p.status === "discharged" ? "info" : "muted"}>
                      {p.status === "active" ? "Ativo" : p.status === "discharged" ? "Alta" : "Inativo"}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

/* ───────────────────────── DOCTOR ─────────────────────────── */
function DoctorDashboard({ data }: { data: DoctorData }) {
  const k = data.kpis;
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <KpiCard icon={Users} accent="cyan" label="Pacientes ativos" value={k.active_patients} hint="atendidos por você" />
        <KpiCard icon={CalendarClock} accent="violet" label="Hoje" value={k.sessions_today} hint={`${k.sessions_week} esta semana`} />
        <KpiCard icon={CheckCircle2} accent="emerald" label="Realizadas (30d)" value={k.completed_30d} hint={`${k.no_show_30d} faltas`} />
        <KpiCard
          icon={Sparkles}
          accent="amber"
          label="Adesão (30d)"
          value={k.adherence_rate != null ? `${k.adherence_rate}%` : "—"}
          hint="completas / atendidas"
          trend={k.adherence_rate != null && k.adherence_rate >= 80 ? "up" : "neutral"}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-6">
        <div className="xl:col-span-2 card-psiclinic">
          <div className="px-5 py-4 border-b border-brand-border bg-brand-bg-subtle flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-primary" />
            <h2 className="text-heading-3 text-brand-text">Agenda de hoje</h2>
            <Badge variant="muted" className="ml-auto">{data.today_agenda.length}</Badge>
          </div>
          <AgendaList items={data.today_agenda} emptyHint="Nenhuma sessão hoje." />
        </div>

        <div className="card-psiclinic">
          <div className="px-5 py-4 border-b border-brand-border bg-brand-bg-subtle">
            <h2 className="text-heading-3 text-brand-text">Próximas sessões</h2>
            <p className="text-caption text-brand-muted">próximos 7 dias</p>
          </div>
          {data.upcoming_sessions.length === 0 ? (
            <p className="px-5 py-8 text-center text-brand-muted text-body-sm">Sem sessões agendadas.</p>
          ) : (
            <ul className="divide-y divide-brand-border">
              {data.upcoming_sessions.slice(0, 6).map((s) => (
                <li key={s.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-body-sm font-medium text-brand-text truncate">{s.patient_name}</p>
                      <p className="text-caption text-brand-muted">{formatDateTimeBR(s.scheduled_at)}</p>
                    </div>
                    <Clock className="w-4 h-4 text-brand-muted shrink-0" />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-2 card-psiclinic">
          <div className="px-5 py-4 border-b border-brand-border bg-brand-bg-subtle">
            <h2 className="text-heading-3 text-brand-text">Sessões — últimos 14 dias</h2>
            <p className="text-caption text-brand-muted">você</p>
          </div>
          <div className="p-5">
            <BarChart14d data={data.sessions_by_day_14d} />
          </div>
        </div>

        <div className="card-psiclinic">
          <div className="px-5 py-4 border-b border-brand-border bg-brand-bg-subtle">
            <h2 className="text-heading-3 text-brand-text">Status (30d)</h2>
          </div>
          <div className="p-5">
            <Donut
              segments={data.status_distribution_30d.map((s) => ({
                key: s.status,
                label: STATUS_LABEL[s.status] ?? s.status,
                value: s.count,
                color: STATUS_COLOR[s.status] ?? "#6b7280",
              }))}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card-psiclinic">
          <div className="px-5 py-4 border-b border-brand-border bg-brand-bg-subtle">
            <h2 className="text-heading-3 text-brand-text">Distribuição semanal</h2>
            <p className="text-caption text-brand-muted">suas sessões — 30d</p>
          </div>
          <div className="p-5">
            <WeekdayBar data={data.sessions_by_weekday_30d} />
          </div>
        </div>

        <div className="card-psiclinic">
          <div className="px-5 py-4 border-b border-brand-border bg-brand-bg-subtle flex items-center gap-2">
            <Cake className="w-4 h-4 text-rose-500" />
            <h2 className="text-heading-3 text-brand-text">Aniversariantes do mês</h2>
            <Badge variant="muted" className="ml-auto">{data.birthdays_this_month.length}</Badge>
          </div>
          {data.birthdays_this_month.length === 0 ? (
            <p className="px-5 py-8 text-center text-brand-muted text-body-sm">Nenhum aniversariante este mês.</p>
          ) : (
            <ul className="divide-y divide-brand-border">
              {data.birthdays_this_month.slice(0, 6).map((b) => (
                <li key={b.id}>
                  <Link href={`/patients/${b.id}` as any} className="flex items-center gap-3 px-5 py-3 hover:bg-brand-bg-subtle">
                    <div className="w-8 h-8 rounded-full bg-rose-50 text-rose-700 flex items-center justify-center text-xs font-semibold">
                      {initialsOf(b.full_name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-body-sm text-brand-text truncate">{b.full_name}</p>
                      <p className="text-caption text-brand-muted">{b.age_turning} anos no dia {b.day}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

/* ───────────────────────── SUPER ADMIN ─────────────────────────── */
function SuperDashboard({ data }: { data: SuperData }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      <KpiCard icon={Building2}  accent="cyan"    label="Empresas ativas" value={data.active_companies} />
      <KpiCard icon={Users}      accent="violet"  label="Pacientes (total)" value={data.total_patients} />
      <KpiCard icon={Stethoscope} accent="emerald" label="Médicos (total)" value={data.total_doctors} />
      <KpiCard icon={Activity}   accent="amber"   label="Sessões (total)" value={data.total_sessions} />
    </div>
  );
}

/* ─────────────────────── COMPONENTES VISUAIS ─────────────────────── */

const ACCENTS = {
  cyan:    { bg: "bg-cyan-50",    fg: "text-cyan-700",    grad: "from-cyan-500 to-cyan-600",       spark: "stroke-cyan-500" },
  violet:  { bg: "bg-violet-50",  fg: "text-violet-700",  grad: "from-violet-500 to-violet-600",   spark: "stroke-violet-500" },
  emerald: { bg: "bg-emerald-50", fg: "text-emerald-700", grad: "from-emerald-500 to-emerald-600", spark: "stroke-emerald-500" },
  amber:   { bg: "bg-amber-50",   fg: "text-amber-700",   grad: "from-amber-500 to-amber-600",     spark: "stroke-amber-500" },
} as const;

type AccentKey = keyof typeof ACCENTS;

function KpiCard({
  icon: Icon, accent, label, value, hint, trend, spark,
}: {
  icon: any;
  accent: AccentKey;
  label: string;
  value: string | number;
  hint?: string;
  trend?: "up" | "down" | "neutral";
  spark?: number[];
}) {
  const a = ACCENTS[accent];
  return (
    <div className="card-psiclinic p-5 relative overflow-hidden group hover:shadow-card transition-shadow">
      <div className={cn("absolute -top-12 -right-12 w-32 h-32 rounded-full opacity-40 group-hover:opacity-60 transition-opacity", a.bg)} />
      <div className="relative">
        <div className="flex items-start justify-between">
          <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shadow-sm", a.bg)}>
            <Icon className={cn("w-5 h-5", a.fg)} />
          </div>
          {trend === "up" && <TrendingUp className="w-4 h-4 text-success" />}
          {trend === "down" && <TrendingDown className="w-4 h-4 text-error" />}
        </div>
        <p className="text-caption text-brand-muted mt-4 uppercase tracking-wide font-medium">{label}</p>
        <p className="text-3xl font-bold text-brand-text mt-1 tabular-nums">{value}</p>
        {hint && <p className="text-caption text-brand-muted mt-1">{hint}</p>}
        {spark && spark.length > 1 && (
          <Sparkline values={spark} className={cn("mt-3 w-full h-8", a.spark)} />
        )}
      </div>
    </div>
  );
}

/** Sparkline SVG suave. */
function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const w = 120;
  const h = 32;
  const max = Math.max(...values, 1);
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - (v / max) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const area = `0,${h} ${points} ${w},${h}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={className}>
      <polygon points={area} className="fill-current opacity-10" />
      <polyline points={points} className="fill-none stroke-current" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Barra dos últimos 14 dias com tooltip nativo via title. */
function BarChart14d({ data }: { data: { date: string; count: number }[] }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  const today = new Date();

  return (
    <div className="space-y-1.5">
      {/* Trilho das barras — altura fixa, items-end alinha embaixo */}
      <div className="flex items-end gap-1 h-36">
        {data.map((d) => {
          // Garante mínimo visível para barras com 0 não sumirem por completo
          const pct = d.count === 0 ? 0 : Math.max((d.count / max) * 100, 8);
          const dt = new Date(d.date + "T00:00:00");
          const isToday = sameDay(dt, today);
          return (
            <div
              key={d.date}
              className="flex-1 h-full flex flex-col justify-end items-center group relative"
              title={`${dt.toLocaleDateString("pt-BR")}: ${d.count} sessões`}
            >
              {/* Tooltip flutuante */}
              {d.count > 0 && (
                <span className="absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full text-[10px] font-semibold text-brand-text opacity-0 group-hover:opacity-100 transition-opacity bg-white px-1.5 py-0.5 rounded shadow-sm border border-brand-border whitespace-nowrap pointer-events-none z-10">
                  {d.count}
                </span>
              )}
              <div
                className={cn(
                  "w-full rounded-t-md transition-all duration-300",
                  d.count === 0
                    ? "bg-stone-100"
                    : isToday
                      ? "bg-primary"
                      : "bg-cyan-300 group-hover:bg-cyan-500",
                )}
                style={{ height: d.count === 0 ? "4px" : `${pct}%` }}
              />
            </div>
          );
        })}
      </div>

      {/* Labels de dia — fora do trilho, mesma grade */}
      <div className="flex gap-1">
        {data.map((d) => {
          const dt = new Date(d.date + "T00:00:00");
          const isToday = sameDay(dt, today);
          return (
            <div key={d.date} className="flex-1 text-center">
              <span
                className={cn(
                  "text-[10px] tabular-nums",
                  isToday ? "text-primary font-semibold" : "text-brand-muted",
                )}
              >
                {dt.getDate().toString().padStart(2, "0")}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Barra horizontal por dia da semana. */
function WeekdayBar({ data }: { data: { weekday: string; count: number }[] }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={d.weekday} className="flex items-center gap-3">
          <span className="text-caption text-brand-muted w-8">{d.weekday}</span>
          <div className="flex-1 h-5 rounded-md bg-brand-bg-muted overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary to-cyan-400 transition-all"
              style={{ width: `${(d.count / max) * 100}%` }}
            />
          </div>
          <span className="text-caption tabular-nums text-brand-text font-medium w-8 text-right">{d.count}</span>
        </div>
      ))}
    </div>
  );
}

/** Donut chart SVG com legenda. */
function Donut({ segments }: { segments: { key: string; label: string; value: number; color: string }[] }) {
  const total = segments.reduce((a, b) => a + b.value, 0);
  if (total === 0) {
    return <p className="text-center text-brand-muted text-body-sm py-8">Sem dados.</p>;
  }
  const r = 50;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative">
        <svg viewBox="0 0 140 140" className="w-36 h-36 -rotate-90">
          <circle cx="70" cy="70" r={r} fill="none" stroke="#f3f4f6" strokeWidth="14" />
          {segments.map((s) => {
            const dash = (s.value / total) * c;
            const el = (
              <circle
                key={s.key}
                cx="70"
                cy="70"
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth="14"
                strokeDasharray={`${dash} ${c - dash}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            );
            offset += dash;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-3xl font-bold text-brand-text tabular-nums">{total}</p>
          <p className="text-caption text-brand-muted">sessões</p>
        </div>
      </div>
      <ul className="w-full space-y-1.5">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center justify-between text-caption">
            <span className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
              <span className="truncate text-brand-text">{s.label}</span>
            </span>
            <span className="tabular-nums text-brand-muted">
              {s.value} <span className="opacity-60">({((s.value / total) * 100).toFixed(0)}%)</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Lista de itens de agenda — usada por todos os roles. */
function AgendaList({ items, emptyHint }: { items: AgendaItem[]; emptyHint: string }) {
  if (items.length === 0) {
    return (
      <div className="px-5 py-10 text-center">
        <CalendarDays className="w-8 h-8 text-brand-muted mx-auto mb-2 opacity-50" />
        <p className="text-body-sm text-brand-muted">{emptyHint}</p>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-brand-border max-h-[420px] overflow-y-auto">
      {items.map((s) => {
        const dt = new Date(s.scheduled_at);
        const time = dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
        const variant =
          s.status === "completed" ? "success" :
          s.status === "scheduled" ? "primary" :
          s.status === "in_progress" ? "info" :
          s.status === "no_show" ? "warning" : "muted";
        return (
          <li key={s.id}>
            <Link
              href={`/patients/${s.patient_id}/sessions/${s.id}` as any}
              className="flex items-center gap-3 px-5 py-3 hover:bg-brand-bg-subtle transition-colors"
            >
              <div className="w-14 text-right shrink-0">
                <p className="text-heading-4 text-brand-text font-semibold tabular-nums">{time}</p>
                <p className="text-caption text-brand-muted">{s.duration_minutes}min</p>
              </div>
              <div className="w-px h-10 bg-brand-border" />
              <div className="flex-1 min-w-0">
                <p className="text-body-sm font-medium text-brand-text truncate">{s.patient_name}</p>
                <p className="text-caption text-brand-muted truncate flex items-center gap-1.5">
                  <Briefcase className="w-3 h-3" />
                  {s.doctor_name}
                </p>
              </div>
              <Badge dot variant={variant as any} className="shrink-0">{STATUS_LABEL[s.status] ?? s.status}</Badge>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/* ─────────────────────── helpers ─────────────────────── */
function initialsOf(name: string): string {
  return name.split(" ").filter((p) => p.length > 1).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/* ─────────────────────── skeleton ─────────────────────── */
function DashboardSkeleton() {
  return (
    <>
      <div className="mb-6">
        <div className="h-8 w-48 bg-brand-bg-muted rounded animate-pulse mb-2" />
        <div className="h-4 w-72 bg-brand-bg-muted rounded animate-pulse" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card-psiclinic p-5 h-32 bg-brand-bg-muted/40 animate-pulse" />
        ))}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 card-psiclinic h-80 bg-brand-bg-muted/40 animate-pulse" />
        <div className="card-psiclinic h-80 bg-brand-bg-muted/40 animate-pulse" />
      </div>
    </>
  );
}
