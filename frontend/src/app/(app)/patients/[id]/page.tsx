"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Edit2, FileText, Calendar, Phone, Mail, MapPin, Briefcase, User, CheckCircle2,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Me, Page, PatientDetail, SessionListItem } from "@/types";
import { Badge, Button, LoadingState, PageHeader, useConfirm, useToast } from "@/components/ui";
import { formatCpf, formatDateTimeBR, formatPhone } from "@/lib/format";

export default function PatientDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const confirm = useConfirm();

  const [me, setMe] = useState<Me | null>(null);
  const [patient, setPatient] = useState<PatientDetail | null>(null);
  const [sessions, setSessions] = useState<Page<SessionListItem> | null>(null);

  async function load() {
    try {
      const [m, p, s] = await Promise.all([
        api<Me>("/auth/me"),
        api<PatientDetail>(`/patients/${id}`),
        api<Page<SessionListItem>>(`/patients/${id}/sessions`, { query: { size: 50 } }),
      ]);
      setMe(m); setPatient(p); setSessions(s);
    } catch (e: any) {
      toast("error", e.message || "Erro ao carregar paciente");
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  // Recepção pode agendar mas não toma decisão clínica nem lê observações.
  const isReceptionist = me?.role === "receptionist";

  async function discharge() {
    const ok = await confirm({
      title: "Dar alta ao paciente?",
      message: "O status mudará para 'alta'. Esta ação pode ser revertida via edição manual.",
      variant: "warning",
      confirmLabel: "Dar alta",
    });
    if (!ok) return;
    try {
      await api(`/patients/${id}/discharge`, { method: "POST" });
      toast("success", "Paciente recebeu alta.");
      load();
    } catch (e: any) {
      toast("error", e.message);
    }
  }

  if (!patient) return <LoadingState message="Carregando paciente" hint="Buscando dados clínicos…" />;

  // Fallback: se o backend não devolveu `age` (ex: cache antigo), calcula daqui.
  const age = (typeof patient.age === "number" && !Number.isNaN(patient.age))
    ? patient.age
    : computeAge(patient.birth_date);
  const genderLabel = patient.gender === "M" ? "Masculino"
    : patient.gender === "F" ? "Feminino"
    : "Sexo não informado";

  return (
    <>
      <PageHeader
        title={patient.full_name}
        description={`${formatCpf(patient.cpf)} • ${age != null ? `${age} anos` : "Idade não informada"} • ${genderLabel}`}
        back={{ href: "/patients" }}
        actions={
          <>
            <Badge dot variant={patient.status === "active" ? "success" : patient.status === "discharged" ? "muted" : "warning"}>
              {patient.status === "active" ? "Ativo" : patient.status === "discharged" ? "Alta" : "Inativo"}
            </Badge>
            <Button variant="secondary" leftIcon={<Edit2 className="w-4 h-4" />}
              onClick={() => router.push(`/patients/${id}/edit` as any)}>
              Editar
            </Button>
            {/* "Dar alta" é decisão clínica — recepção não decide */}
            {!isReceptionist && patient.status === "active" && (
              <Button variant="secondary" leftIcon={<CheckCircle2 className="w-4 h-4" />} onClick={discharge}>
                Dar alta
              </Button>
            )}
            {/* Anamnese é prontuário — recepção não acessa */}
            {!isReceptionist && (
              <Button variant="secondary" leftIcon={<FileText className="w-4 h-4" />}
                onClick={() => router.push(`/patients/${id}/anamnesis` as any)}>
                {patient.has_anamnesis ? "Anamnese" : "Criar anamnese"}
              </Button>
            )}
            <Button leftIcon={<Calendar className="w-4 h-4" />}
              onClick={() => router.push(`/patients/${id}/sessions/new` as any)}>
              Nova sessão
            </Button>
          </>
        }
      />

      {/* Cards de informação */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <InfoCard icon={Phone} label="Telefone" value={formatPhone(patient.phone)} />
        <InfoCard icon={Mail} label="E-mail" value={patient.email} />
        <InfoCard icon={Briefcase} label="Profissão" value={patient.profession} />
        <InfoCard icon={MapPin} label="Endereço" value={patient.address} colSpan={2} />
        <InfoCard icon={User} label="Estado civil" value={patient.marital_status} />
        <InfoCard icon={User} label="Naturalidade" value={patient.naturalidade} />
        <InfoCard icon={User} label="Procedência" value={patient.procedencia} />
        <InfoCard icon={User} label="Religião" value={patient.religion} />
      </div>

      {/* Timeline de sessões */}
      <section className="card-psiclinic">
        <div className="px-5 py-4 border-b border-brand-border bg-brand-bg-subtle flex items-center justify-between">
          <div>
            <h2 className="text-heading-3 text-brand-text">Timeline de sessões</h2>
            <p className="text-caption text-brand-muted">{sessions?.total ?? 0} sessões registradas</p>
          </div>
          <Button variant="secondary" size="sm" leftIcon={<Calendar className="w-4 h-4" />}
            onClick={() => router.push(`/patients/${id}/sessions/new` as any)}>
            Agendar
          </Button>
        </div>

        {sessions && sessions.items.length === 0 ? (
          <div className="p-10 text-center">
            <Calendar className="w-10 h-10 text-brand-muted mx-auto mb-3" />
            <p className="text-body-sm text-brand-muted">Nenhuma sessão registrada ainda.</p>
            <Button className="mt-4" leftIcon={<Calendar className="w-4 h-4" />}
              onClick={() => router.push(`/patients/${id}/sessions/new` as any)}>
              Agendar primeira sessão
            </Button>
          </div>
        ) : (
          <ol className="relative p-5 space-y-3 ml-3 border-l-2 border-brand-border">
            {sessions?.items.map((s) => (
              <li key={s.id} className="relative pl-6">
                <span
                  className={`absolute -left-[9px] top-3 h-3.5 w-3.5 rounded-full ring-4 ring-white ${
                    s.status === "completed" ? "bg-success" :
                    s.status === "scheduled" ? "bg-primary" :
                    s.status === "in_progress" ? "bg-info animate-pulse" :
                    s.status === "cancelled" ? "bg-stone-400" : "bg-error"
                  }`}
                />
                <Link
                  href={`/patients/${id}/sessions/${s.id}` as any}
                  className="block rounded-xl border border-brand-border bg-white p-4 hover:border-primary transition-colors shadow-xs"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-body-sm font-medium text-brand-text">
                        {formatDateTimeBR(s.scheduled_at)}
                      </p>
                      <p className="text-caption text-brand-muted mt-0.5">
                        {s.doctor_name} • {s.duration_minutes} min
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {s.locked_at && <Badge variant="muted">🔒 Bloqueada</Badge>}
                      <Badge variant={
                        s.status === "completed" ? "success" :
                        s.status === "scheduled" ? "primary" :
                        s.status === "in_progress" ? "info" :
                        s.status === "cancelled" ? "muted" : "warning"
                      }>
                        {s.status === "completed" ? "Realizada" :
                          s.status === "scheduled" ? "Agendada" :
                          s.status === "in_progress" ? "Em andamento" :
                          s.status === "cancelled" ? "Cancelada" : "Faltou"}
                      </Badge>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}

/**
 * Calcula idade em anos a partir de "YYYY-MM-DD" (ou Date string ISO).
 * Retorna `null` se a data for inválida — assim a UI mostra "Idade não informada"
 * em vez de "NaN anos".
 */
function computeAge(birthDate?: string | null): number | null {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  if (Number.isNaN(b.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - b.getFullYear();
  const m = today.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < b.getDate())) age -= 1;
  return age >= 0 ? age : null;
}

function InfoCard({
  icon: Icon, label, value, colSpan,
}: { icon: any; label: string; value?: string | null; colSpan?: number }) {
  return (
    <div className={`card-psiclinic p-4 ${colSpan === 2 ? "md:col-span-2" : ""}`}>
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-label-upper uppercase text-brand-muted">{label}</p>
          <p className="text-body-sm text-brand-text mt-0.5 break-words">{value || "—"}</p>
        </div>
      </div>
    </div>
  );
}
