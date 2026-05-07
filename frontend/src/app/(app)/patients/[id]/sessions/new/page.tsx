"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Calendar } from "lucide-react";
import { api } from "@/lib/api";
import { Button, FormSection, Input, PageHeader, Select, useToast } from "@/components/ui";
import type { Doctor, Me, Page, SessionStatus } from "@/types";

export default function NewSessionPage() {
  const router = useRouter();
  const { id: patientId } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [me, setMe] = useState<Me | null>(null);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(false);

  // próximo dia útil às 09:00 como default
  const defaultWhen = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  })();

  const [form, setForm] = useState({
    doctor_id: 0,
    scheduled_at: defaultWhen,
    duration_minutes: 50,
    status: "scheduled" as SessionStatus,
  });

  useEffect(() => {
    Promise.all([
      api<Me>("/auth/me"),
      api<Page<Doctor>>("/doctors", { query: { size: 100 } }),
    ]).then(([m, ds]) => {
      setMe(m);
      const list = ds.items.filter((d) => d.is_active);
      setDoctors(list);
      setForm((f) => ({ ...f, doctor_id: m.doctor_id ?? list[0]?.id ?? 0 }));
    }).catch((e) => toast("error", e.message));
  }, [toast]);

  function set<K extends keyof typeof form>(k: K, v: any) {
    setForm({ ...form, [k]: v });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        patient_id: patientId,
        doctor_id: form.doctor_id || null,
        scheduled_at: new Date(form.scheduled_at).toISOString(),
        duration_minutes: form.duration_minutes,
        status: form.status,
      };
      const r = await api<{ id: string }>(`/patients/${patientId}/sessions`, { method: "POST", body: payload });
      toast("success", "Sessão criada.");
      router.push(`/patients/${patientId}/sessions/${r.id}` as any);
    } catch (e: any) {
      toast("error", e.message || "Erro ao criar sessão");
    } finally { setLoading(false); }
  }

  return (
    <>
      <PageHeader title="Nova sessão" back={{ href: `/patients/${patientId}` }} />
      <form onSubmit={handleSubmit} className="max-w-2xl card-psiclinic card-body space-y-8">
        <FormSection title="Agendamento" icon={Calendar}>
          <Input label="Data e hora" type="datetime-local" required
            value={form.scheduled_at} onChange={(e) => set("scheduled_at", e.target.value)} />
          <Input label="Duração (minutos)" type="number" min={5} max={240} required
            value={form.duration_minutes} onChange={(e) => set("duration_minutes", Number(e.target.value))} />
          <Select label="Médico responsável" required value={form.doctor_id}
            onChange={(e) => set("doctor_id", Number(e.target.value))}>
            <option value={0}>—</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.full_name} (CRM {d.crm}/{d.crm_uf})
              </option>
            ))}
          </Select>
          <Select label="Status" value={form.status}
            onChange={(e) => set("status", e.target.value as SessionStatus)}>
            <option value="scheduled">Agendada</option>
            <option value="completed">Realizada</option>
            <option value="cancelled">Cancelada</option>
            <option value="no_show">Faltou</option>
          </Select>
        </FormSection>

        <div className="flex justify-end gap-3 pt-5 border-t border-brand-border">
          <Button type="button" variant="secondary" onClick={() => router.push(`/patients/${patientId}` as any)}>
            Cancelar
          </Button>
          <Button type="submit" loading={loading}>Criar sessão</Button>
        </div>
      </form>
    </>
  );
}
