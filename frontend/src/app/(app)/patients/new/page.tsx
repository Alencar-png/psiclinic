"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { User, Home, UserCog } from "lucide-react";
import { api } from "@/lib/api";
import { Button, FormSection, Input, PageHeader, Select, useToast } from "@/components/ui";
import { digits, formatCpf, formatPhone } from "@/lib/format";
import type { Doctor, Page } from "@/types";

const ESTADOS_CIVIS = ["Solteiro(a)","Casado(a)","Divorciado(a)","Viúvo(a)","União estável"];
const CORES_PELE = ["Branca","Preta","Parda","Amarela","Indígena","Não informado"];
const RELIGIOES = ["Católica","Evangélica","Espírita","Sem religião","Outra"];

export default function NewPatientPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    full_name: "", cpf: "", birth_date: "", gender: "",
    mother_name: "", father_name: "",
    address: "", phone: "", email: "",
    naturalidade: "", procedencia: "",
    profession: "", marital_status: "", religion: "", skin_color: "",
    primary_doctor_id: 0,
  });

  useEffect(() => {
    api<Page<Doctor>>("/doctors", { query: { size: 100 } })
      .then((r) => setDoctors(r.items.filter((d) => d.is_active)))
      .catch(() => {});
  }, []);

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
        email: form.email || null,
        primary_doctor_id: form.primary_doctor_id || null,
      };
      const r = await api<{ id: string }>("/patients", { method: "POST", body: payload });
      toast("success", "Paciente cadastrado com sucesso.");
      router.push(`/patients/${r.id}` as any);
    } catch (e: any) {
      toast("error", e.message || "Erro ao cadastrar paciente");
    } finally { setLoading(false); }
  }

  return (
    <>
      <PageHeader title="Novo paciente" back={{ href: "/patients" }} />
      <form onSubmit={handleSubmit} className="max-w-4xl card-psiclinic card-body space-y-8">
        <FormSection title="Identificação" icon={User}>
          <div className="md:col-span-2">
            <Input label="Nome completo" required value={form.full_name}
              onChange={(e) => set("full_name", e.target.value)} />
          </div>
          <Input label="CPF" required value={formatCpf(form.cpf)}
            onChange={(e) => set("cpf", e.target.value)} placeholder="000.000.000-00" />
          <Input label="Data de nascimento" type="date" required value={form.birth_date}
            onChange={(e) => set("birth_date", e.target.value)} />
          <Select label="Sexo" value={form.gender} onChange={(e) => set("gender", e.target.value)}>
            <option value="">—</option>
            <option value="M">Masculino</option>
            <option value="F">Feminino</option>
            <option value="O">Outro</option>
          </Select>
          <Select label="Cor / etnia" value={form.skin_color}
            onChange={(e) => set("skin_color", e.target.value)}>
            <option value="">—</option>
            {CORES_PELE.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Input label="Nome da mãe" value={form.mother_name}
            onChange={(e) => set("mother_name", e.target.value)} />
          <Input label="Nome do pai" value={form.father_name}
            onChange={(e) => set("father_name", e.target.value)} />
        </FormSection>

        <FormSection title="Contato e endereço" icon={Home} iconColor="blue">
          <Input label="Telefone" value={formatPhone(form.phone)}
            onChange={(e) => set("phone", e.target.value)} placeholder="(00) 00000-0000" />
          <Input label="E-mail" type="email" value={form.email}
            onChange={(e) => set("email", e.target.value)} />
          <div className="md:col-span-2">
            <Input label="Endereço" value={form.address}
              onChange={(e) => set("address", e.target.value)} placeholder="Rua, número, bairro, cidade/UF" />
          </div>
          <Input label="Naturalidade" value={form.naturalidade}
            onChange={(e) => set("naturalidade", e.target.value)} hint="Cidade onde nasceu" />
          <Input label="Procedência" value={form.procedencia}
            onChange={(e) => set("procedencia", e.target.value)} hint="Cidade atual" />
        </FormSection>

        <FormSection title="Dados sociais" icon={User} iconColor="violet">
          <Input label="Profissão" value={form.profession}
            onChange={(e) => set("profession", e.target.value)} />
          <Select label="Estado civil" value={form.marital_status}
            onChange={(e) => set("marital_status", e.target.value)}>
            <option value="">—</option>
            {ESTADOS_CIVIS.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
          <Select label="Religião" value={form.religion}
            onChange={(e) => set("religion", e.target.value)}>
            <option value="">—</option>
            {RELIGIOES.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </FormSection>

        <FormSection title="Atribuição clínica" icon={UserCog} iconColor="amber">
          <div className="md:col-span-2">
            <Select label="Médico responsável" value={form.primary_doctor_id}
              onChange={(e) => set("primary_doctor_id", Number(e.target.value))}
              hint="Defina o psiquiatra responsável; outros podem ser adicionados depois.">
              <option value={0}>—</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name} (CRM {d.crm}/{d.crm_uf})
                </option>
              ))}
            </Select>
          </div>
        </FormSection>

        <div className="flex justify-end gap-3 pt-5 border-t border-brand-border">
          <Button type="button" variant="secondary" onClick={() => router.push("/patients")}>Cancelar</Button>
          <Button type="submit" loading={loading}>Cadastrar paciente</Button>
        </div>
      </form>
    </>
  );
}
