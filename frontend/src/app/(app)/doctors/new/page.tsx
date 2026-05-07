"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserCog, Lock } from "lucide-react";
import { api } from "@/lib/api";
import { Button, FormSection, Input, PageHeader, Select, useToast } from "@/components/ui";
import { digits, formatCpf, formatPhone } from "@/lib/format";

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];
const ESPECIALIDADES = [
  "Psiquiatria",
  "Psiquiatria Infantil",
  "Psicogeriatria",
  "Neurologia",
  "Clínica Médica",
];

export default function NewDoctorPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    full_name: "", cpf: "", crm: "", crm_uf: "", specialty: "", rqe: "",
    email: "", phone: "", password: "",
  });
  function set<K extends keyof typeof form>(k: K, v: any) {
    setForm({ ...form, [k]: v });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const payload: any = {
        ...form,
        cpf: digits(form.cpf),
        phone: digits(form.phone) || null,
        rqe: form.rqe || null,
      };
      if (!payload.password) delete payload.password;
      await api("/doctors", { method: "POST", body: payload });
      toast("success", "Médico cadastrado.");
      router.push("/doctors");
    } catch (e: any) {
      toast("error", e.message || "Erro ao cadastrar");
    } finally { setLoading(false); }
  }

  return (
    <>
      <PageHeader title="Novo médico" back={{ href: "/doctors" }} />
      <form onSubmit={handleSubmit} className="max-w-3xl card-psiclinic card-body space-y-8">
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
          <Input label="CRM" required value={form.crm}
            onChange={(e) => set("crm", e.target.value)} />
          <Select label="UF do CRM" required value={form.crm_uf}
            onChange={(e) => set("crm_uf", e.target.value)}>
            <option value="">—</option>
            {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
          </Select>
          <Input label="RQE" value={form.rqe}
            onChange={(e) => set("rqe", e.target.value)}
            hint="Registro de qualificação (opcional)" />
          <div className="md:col-span-3">
            <Select label="Especialidade" value={form.specialty}
              onChange={(e) => set("specialty", e.target.value)}>
              <option value="">—</option>
              {ESPECIALIDADES.map((e) => <option key={e} value={e}>{e}</option>)}
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
              hint="Se vazio, será gerada uma senha aleatória — comunique ao médico para que ele troque." />
          </div>
        </FormSection>

        <div className="flex justify-end gap-3 pt-5 border-t border-brand-border">
          <Button type="button" variant="secondary" onClick={() => router.push("/doctors")}>Cancelar</Button>
          <Button type="submit" loading={loading}>Cadastrar médico</Button>
        </div>
      </form>
    </>
  );
}
