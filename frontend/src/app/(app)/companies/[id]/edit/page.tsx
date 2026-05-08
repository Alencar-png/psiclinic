"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Building2, MapPin, Settings } from "lucide-react";
import { api } from "@/lib/api";
import {
  Button, FormSection, Input, LoadingState, PageHeader, Select, useToast,
} from "@/components/ui";
import { digits, formatPhone, formatCep } from "@/lib/format";
import type { Company, CompanyStatus } from "@/types";

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

export default function EditCompanyPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [c, setC] = useState<Company | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api<Company>(`/companies/${id}`).then(setC).catch((e) => toast("error", e.message));
  }, [id, toast]);

  function set<K extends keyof Company>(k: K, v: any) {
    if (!c) return;
    setC({ ...c, [k]: v });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!c) return;
    setLoading(true);
    try {
      const payload: any = {
        name: c.name, trade_name: c.trade_name, email: c.email,
        phone: digits(c.phone || "") || null,
        address: c.address, city: c.city, state: c.state,
        zip_code: digits(c.zip_code || "") || null,
        status: c.status,
        session_lock_after_days: c.session_lock_after_days,
        doctors_see_all_patients: c.doctors_see_all_patients,
      };
      await api(`/companies/${id}`, { method: "PATCH", body: payload });
      toast("success", "Empresa atualizada.");
      router.push("/companies");
    } catch (e: any) {
      toast("error", e.message || "Erro ao salvar");
    } finally {
      setLoading(false);
    }
  }

  if (!c) return <LoadingState message="Carregando empresa" />;

  return (
    <>
      <PageHeader title={`Editar — ${c.name}`} back={{ href: "/companies" }} />

      <form onSubmit={handleSubmit} className="max-w-4xl card-psiclinic card-body space-y-8">
        <FormSection title="Identificação" icon={Building2}>
          <div className="md:col-span-2">
            <Input label="Razão social" required value={c.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <Input label="Nome fantasia" value={c.trade_name ?? ""} onChange={(e) => set("trade_name", e.target.value)} />
          <Input label="CNPJ" disabled value={c.cnpj} hint="CNPJ não pode ser alterado." />
          <Input label="E-mail" type="email" required value={c.email} onChange={(e) => set("email", e.target.value)} />
          <Input label="Telefone" value={formatPhone(c.phone || "")}
            onChange={(e) => set("phone", e.target.value)} placeholder="(00) 00000-0000" />
        </FormSection>

        <FormSection title="Endereço" icon={MapPin} iconColor="blue" cols={3}>
          <div className="md:col-span-3">
            <Input label="Logradouro" value={c.address ?? ""} onChange={(e) => set("address", e.target.value)} />
          </div>
          <Input label="Cidade" value={c.city ?? ""} onChange={(e) => set("city", e.target.value)} />
          <Select label="UF" value={c.state ?? ""} onChange={(e) => set("state", e.target.value)}>
            <option value="">—</option>
            {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
          </Select>
          <Input label="CEP" value={formatCep(c.zip_code || "")}
            onChange={(e) => set("zip_code", e.target.value)} placeholder="00000-000" />
        </FormSection>

        <FormSection title="Configurações clínicas" icon={Settings} iconColor="violet">
          <Select label="Status" value={c.status}
            onChange={(e) => set("status", e.target.value as CompanyStatus)}>
            <option value="active">Ativa</option>
            <option value="suspended">Suspensa</option>
            <option value="cancelled">Cancelada</option>
          </Select>
          <Input
            label="Bloqueio automático de sessão (dias)"
            type="number" min={1} max={90}
            value={c.session_lock_after_days}
            onChange={(e) => set("session_lock_after_days", Number(e.target.value))}
            hint="Após N dias a observação fica imutável; correções viram adendos."
          />
          <div className="md:col-span-2 flex items-center gap-3 p-4 rounded-lg bg-brand-bg-subtle border border-brand-border">
            <input
              id="docAllPatients"
              type="checkbox"
              checked={c.doctors_see_all_patients}
              onChange={(e) => set("doctors_see_all_patients", e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            <label htmlFor="docAllPatients" className="text-body-sm">
              <strong className="text-brand-text">Médicos veem todos os pacientes da clínica.</strong>
              <p className="text-caption text-brand-muted">
                Quando desativado (recomendado), cada médico vê apenas pacientes a ele atribuídos.
              </p>
            </label>
          </div>
        </FormSection>

        <div className="flex justify-end gap-3 pt-5 border-t border-brand-border">
          <Button type="button" variant="secondary" onClick={() => router.push("/companies")}>Cancelar</Button>
          <Button type="submit" loading={loading}>Salvar alterações</Button>
        </div>
      </form>
    </>
  );
}
