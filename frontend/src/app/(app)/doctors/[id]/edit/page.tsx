"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { UserCog } from "lucide-react";
import { api } from "@/lib/api";
import { Button, FormSection, Input, LoadingState, PageHeader, Select, useToast } from "@/components/ui";
import { digits, formatPhone } from "@/lib/format";
import type { Doctor } from "@/types";
import {
  formatRegistration,
  professionalTypeLabel,
  registrationLabel,
  SPECIALTIES_BY_TYPE,
} from "@/lib/professional";

export default function EditProfessionalPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [d, setD] = useState<Doctor | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api<Doctor>(`/doctors/${id}`).then(setD).catch((e) => toast("error", e.message));
  }, [id, toast]);

  function set<K extends keyof Doctor>(k: K, v: any) {
    if (!d) return;
    setD({ ...d, [k]: v });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!d) return;
    setLoading(true);
    try {
      const payload = {
        full_name: d.full_name,
        specialty: d.specialty,
        phone: digits(d.phone || "") || null,
        photo_url: d.photo_url,
        is_active: d.is_active,
      };
      await api(`/doctors/${id}`, { method: "PATCH", body: payload });
      toast("success", "Profissional atualizado.");
      router.push("/doctors");
    } catch (e: any) {
      toast("error", e.message || "Erro ao salvar");
    } finally { setLoading(false); }
  }

  if (!d) return <LoadingState message="Carregando profissional" />;

  const specialties = SPECIALTIES_BY_TYPE[d.professional_type];
  const regLabel = registrationLabel(d.professional_type);
  const typeLabel = professionalTypeLabel(d.professional_type, d.full_name);

  return (
    <>
      <PageHeader
        title={`Editar — ${d.full_name}`}
        description={`${typeLabel} · ${formatRegistration(d.professional_type, d.crm, d.crm_uf)}`}
        back={{ href: "/doctors" }}
      />
      <form onSubmit={handleSubmit} className="max-w-3xl card-psiclinic card-body space-y-8">
        <FormSection title="Dados profissionais" icon={UserCog}>
          <div className="md:col-span-2">
            <Input label="Nome completo" required value={d.full_name}
              onChange={(e) => set("full_name", e.target.value)} />
          </div>
          <Input
            label={regLabel}
            disabled
            value={`${d.crm}/${d.crm_uf}`}
            hint={`${regLabel}/UF não pode ser alterado.`}
          />
          <Input label="E-mail" disabled value={d.email} />
          <Select label="Especialidade" value={d.specialty ?? ""}
            onChange={(e) => set("specialty", e.target.value)}>
            <option value="">—</option>
            {specialties.map((e) => <option key={e} value={e}>{e}</option>)}
          </Select>
          <Input label="Telefone" value={formatPhone(d.phone || "")}
            onChange={(e) => set("phone", e.target.value)} placeholder="(00) 00000-0000" />
        </FormSection>

        <div className="flex items-center gap-3 p-4 rounded-lg bg-brand-bg-subtle border border-brand-border">
          <input
            id="active"
            type="checkbox"
            checked={d.is_active}
            onChange={(e) => set("is_active", e.target.checked)}
            className="w-4 h-4 accent-primary"
          />
          <label htmlFor="active" className="text-body-sm">
            <strong className="text-brand-text">Profissional ativo</strong>
            <p className="text-caption text-brand-muted">
              Desmarque para impedir login e novos atendimentos.
            </p>
          </label>
        </div>

        <div className="flex justify-end gap-3 pt-5 border-t border-brand-border">
          <Button type="button" variant="secondary" onClick={() => router.push("/doctors")}>Cancelar</Button>
          <Button type="submit" loading={loading}>Salvar alterações</Button>
        </div>
      </form>
    </>
  );
}
