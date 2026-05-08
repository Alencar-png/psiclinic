"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { UserCog, Lock, Stethoscope } from "lucide-react";
import { api } from "@/lib/api";
import { Button, FormSection, Input, PageHeader, Select, useToast } from "@/components/ui";
import { digits, formatCpf, formatPhone } from "@/lib/format";
import type { ProfessionalType } from "@/types";
import {
  PROFESSIONAL_TYPES,
  registrationLabel,
  SPECIALTIES_BY_TYPE,
} from "@/lib/professional";

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

export default function NewProfessionalPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<{
    professional_type: ProfessionalType;
    full_name: string;
    cpf: string;
    crm: string;
    crm_uf: string;
    specialty: string;
    rqe: string;
    email: string;
    phone: string;
    password: string;
  }>({
    professional_type: "doctor",
    full_name: "", cpf: "", crm: "", crm_uf: "",
    specialty: "", rqe: "",
    email: "", phone: "", password: "",
  });

  function set<K extends keyof typeof form>(k: K, v: any) {
    setForm({ ...form, [k]: v });
  }

  // Reseta especialidade quando troca o tipo (especialidades mudam)
  function setType(t: ProfessionalType) {
    setForm((f) => ({ ...f, professional_type: t, specialty: "" }));
  }

  const regLabel = registrationLabel(form.professional_type);
  const specialties = useMemo(
    () => SPECIALTIES_BY_TYPE[form.professional_type],
    [form.professional_type],
  );
  const isPsychologist = form.professional_type === "psychologist";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const payload: any = {
        professional_type: form.professional_type,
        full_name: form.full_name.trim(),
        cpf: digits(form.cpf),
        crm: form.crm.trim(),
        crm_uf: form.crm_uf,
        specialty: form.specialty || null,
        rqe: form.rqe || null,
        email: form.email.trim(),
        phone: digits(form.phone) || null,
      };
      if (form.password) payload.password = form.password;
      await api("/doctors", { method: "POST", body: payload });
      toast("success", "Profissional cadastrado.");
      router.push("/doctors");
    } catch (e: any) {
      toast("error", e.message || "Erro ao cadastrar");
    } finally { setLoading(false); }
  }

  return (
    <>
      <PageHeader title="Novo profissional" back={{ href: "/doctors" }} />
      <form onSubmit={handleSubmit} className="max-w-3xl card-psiclinic card-body space-y-8">

        {/* Seletor de tipo — domina o resto do formulário */}
        <FormSection title="Tipo de profissional" icon={Stethoscope}>
          <div className="md:col-span-2 grid grid-cols-2 gap-3">
            {PROFESSIONAL_TYPES.map((t) => (
              <button
                type="button"
                key={t.value}
                onClick={() => setType(t.value)}
                className={`p-4 rounded-xl border-2 text-left transition-colors ${
                  form.professional_type === t.value
                    ? "border-primary bg-primary-light/30 text-primary"
                    : "border-brand-border bg-white text-brand-text hover:border-primary/50"
                }`}
              >
                <div className="text-sm font-semibold">{t.label}</div>
                <div className="text-caption text-brand-muted mt-1">
                  Conselho: {registrationLabel(t.value)}
                </div>
              </button>
            ))}
          </div>
        </FormSection>

        <FormSection title="Dados pessoais" icon={UserCog}>
          <div className="md:col-span-2">
            <Input label="Nome completo" required value={form.full_name}
              onChange={(e) => set("full_name", e.target.value)} />
          </div>
          <Input label="CPF" required value={formatCpf(form.cpf)}
            onChange={(e) => set("cpf", e.target.value)} placeholder="000.000.000-00" />
          <Input label="Telefone" value={formatPhone(form.phone)}
            onChange={(e) => set("phone", e.target.value)} placeholder="(00) 00000-0000" />
        </FormSection>

        <FormSection title="Registro profissional" icon={UserCog} iconColor="blue" cols={3}>
          <Input
            label={regLabel}
            required
            value={form.crm}
            onChange={(e) => set("crm", e.target.value)}
            placeholder={`Número do ${regLabel}`}
          />
          <Select
            label={`UF do ${regLabel}`}
            required
            value={form.crm_uf}
            onChange={(e) => set("crm_uf", e.target.value)}
          >
            <option value="">—</option>
            {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
          </Select>
          {/* RQE só para médicos — psicólogos não têm registro de qualificação. */}
          {!isPsychologist && (
            <Input label="RQE" value={form.rqe}
              onChange={(e) => set("rqe", e.target.value)}
              hint="Registro de qualificação (opcional)" />
          )}
          <div className="md:col-span-3">
            <Select label="Especialidade" value={form.specialty}
              onChange={(e) => set("specialty", e.target.value)}>
              <option value="">—</option>
              {specialties.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </div>
        </FormSection>

        <FormSection title="Acesso ao sistema" icon={Lock} iconColor="violet">
          <div className="md:col-span-2">
            <Input label="E-mail (login)" type="email" required value={form.email}
              onChange={(e) => set("email", e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Input label="Senha inicial" type="password" minLength={4} value={form.password}
              onChange={(e) => set("password", e.target.value)}
              hint="Se vazio, será gerada uma senha aleatória — comunique ao profissional para que ele troque." />
          </div>
        </FormSection>

        <div className="flex justify-end gap-3 pt-5 border-t border-brand-border">
          <Button type="button" variant="secondary" onClick={() => router.push("/doctors")}>Cancelar</Button>
          <Button type="submit" loading={loading}>Cadastrar profissional</Button>
        </div>
      </form>
    </>
  );
}
