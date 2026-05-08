"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { User, Home } from "lucide-react";
import { api } from "@/lib/api";
import { Button, FormSection, Input, LoadingState, PageHeader, Select, useToast } from "@/components/ui";
import { digits, formatPhone } from "@/lib/format";
import type { PatientDetail, PatientStatus } from "@/types";

const ESTADOS_CIVIS = ["Solteiro(a)","Casado(a)","Divorciado(a)","Viúvo(a)","União estável"];

export default function EditPatientPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [p, setP] = useState<PatientDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api<PatientDetail>(`/patients/${id}`).then(setP).catch((e) => toast("error", e.message));
  }, [id, toast]);

  function set<K extends keyof PatientDetail>(k: K, v: any) {
    if (!p) return;
    setP({ ...p, [k]: v });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!p) return;
    setLoading(true);
    try {
      const payload: any = {
        full_name: p.full_name,
        address: p.address,
        phone: digits(p.phone || "") || null,
        email: p.email || null,
        profession: p.profession,
        marital_status: p.marital_status,
        status: p.status,
      };
      await api(`/patients/${id}`, { method: "PATCH", body: payload });
      toast("success", "Paciente atualizado.");
      router.push(`/patients/${id}` as any);
    } catch (e: any) {
      toast("error", e.message || "Erro ao salvar");
    } finally { setLoading(false); }
  }

  if (!p) return <LoadingState message="Carregando paciente" />;

  return (
    <>
      <PageHeader title={`Editar — ${p.full_name}`} back={{ href: `/patients/${id}` }} />
      <form onSubmit={handleSubmit} className="max-w-3xl card-psiclinic card-body space-y-8">
        <FormSection title="Identificação" icon={User}>
          <div className="md:col-span-2">
            <Input label="Nome completo" required value={p.full_name}
              onChange={(e) => set("full_name", e.target.value)} />
          </div>
          <Input label="CPF" disabled value={p.cpf} hint="CPF não pode ser alterado." />
          <Input label="Data de nascimento" disabled value={p.birth_date} />
        </FormSection>

        <FormSection title="Contato" icon={Home} iconColor="blue">
          <Input label="Telefone" value={formatPhone(p.phone || "")}
            onChange={(e) => set("phone", e.target.value)} placeholder="(00) 00000-0000" />
          <Input label="E-mail" type="email" value={p.email ?? ""}
            onChange={(e) => set("email", e.target.value)} />
          <div className="md:col-span-2">
            <Input label="Endereço" value={p.address ?? ""}
              onChange={(e) => set("address", e.target.value)} />
          </div>
          <Input label="Profissão" value={p.profession ?? ""}
            onChange={(e) => set("profession", e.target.value)} />
          <Select label="Estado civil" value={p.marital_status ?? ""}
            onChange={(e) => set("marital_status", e.target.value)}>
            <option value="">—</option>
            {ESTADOS_CIVIS.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </FormSection>

        <FormSection title="Status" icon={User} iconColor="amber">
          <Select label="Situação clínica" value={p.status}
            onChange={(e) => set("status", e.target.value as PatientStatus)}>
            <option value="active">Ativo</option>
            <option value="inactive">Inativo</option>
            <option value="discharged">Alta</option>
          </Select>
        </FormSection>

        <div className="flex justify-end gap-3 pt-5 border-t border-brand-border">
          <Button type="button" variant="secondary" onClick={() => router.push(`/patients/${id}` as any)}>Cancelar</Button>
          <Button type="submit" loading={loading}>Salvar alterações</Button>
        </div>
      </form>
    </>
  );
}
