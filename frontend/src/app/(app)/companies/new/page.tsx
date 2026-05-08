"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, UserCog, Mail, Phone, MapPin } from "lucide-react";
import { api } from "@/lib/api";
import {
  Button, FormSection, Input, PageHeader, Select, useToast,
} from "@/components/ui";
import { digits, formatCnpj, formatPhone, formatCep } from "@/lib/format";

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

export default function NewCompanyPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "", trade_name: "", cnpj: "", email: "", phone: "",
    address: "", city: "", state: "", zip_code: "",
    technical_responsible_name: "",
    technical_responsible_crm: "",
    technical_responsible_uf: "",
    admin_email: "", admin_full_name: "", admin_password: "",
  });

  function set<K extends keyof typeof form>(k: K, v: any) {
    setForm({ ...form, [k]: v });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      // Strings vazias viram null (backend também normaliza, mas ajuda a manter
      // o payload limpo). digits() do CNPJ/telefone/CEP é tolerante a vazio.
      const clean = (s: string) => s.trim() || null;
      const payload: Record<string, any> = {
        name: form.name.trim(),
        trade_name: clean(form.trade_name),
        cnpj: digits(form.cnpj),
        email: clean(form.email),
        phone: digits(form.phone) || null,
        address: clean(form.address),
        city: clean(form.city),
        state: clean(form.state),
        zip_code: digits(form.zip_code) || null,
        technical_responsible_name: clean(form.technical_responsible_name),
        technical_responsible_crm: clean(form.technical_responsible_crm),
        technical_responsible_uf: clean(form.technical_responsible_uf),
        admin_email: form.admin_email.trim(),
        admin_full_name: clean(form.admin_full_name),
        admin_password: form.admin_password,
      };
      await api("/companies", { method: "POST", body: payload });
      toast("success", "Empresa criada com sucesso.");
      router.push("/companies");
    } catch (e: any) {
      toast("error", e.message || "Erro ao criar empresa");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Nova empresa"
        description="Apenas Razão social, CNPJ, e-mail e senha do administrador são obrigatórios. Demais dados podem ser preenchidos depois."
        back={{ href: "/companies" }}
      />

      <form onSubmit={handleSubmit} className="max-w-4xl card-psiclinic card-body space-y-8">
        <FormSection title="Identificação" icon={Building2}>
          <div className="md:col-span-2">
            <Input label="Razão social" required value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <Input label="Nome fantasia" value={form.trade_name} onChange={(e) => set("trade_name", e.target.value)} />
          <Input
            label="CNPJ" required
            value={formatCnpj(form.cnpj)}
            onChange={(e) => set("cnpj", e.target.value)}
            placeholder="00.000.000/0000-00"
          />
          <Input label="E-mail corporativo" type="email" leftIcon={<Mail className="w-4 h-4" />}
            value={form.email} onChange={(e) => set("email", e.target.value)} />
          <Input label="Telefone" leftIcon={<Phone className="w-4 h-4" />}
            value={formatPhone(form.phone)} onChange={(e) => set("phone", e.target.value)} placeholder="(00) 00000-0000" />
        </FormSection>

        <FormSection title="Endereço (opcional)" icon={MapPin} iconColor="blue" cols={3}>
          <div className="md:col-span-3">
            <Input label="Logradouro" value={form.address} onChange={(e) => set("address", e.target.value)} />
          </div>
          <Input label="Cidade" value={form.city} onChange={(e) => set("city", e.target.value)} />
          <Select label="UF" value={form.state} onChange={(e) => set("state", e.target.value)}>
            <option value="">—</option>
            {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
          </Select>
          <Input label="CEP" value={formatCep(form.zip_code)}
            onChange={(e) => set("zip_code", e.target.value)} placeholder="00000-000" />
        </FormSection>

        <FormSection
          title="Responsável técnico (opcional)"
          icon={UserCog}
          iconColor="violet"
          cols={3}
        >
          <div className="md:col-span-2">
            <Input label="Nome do responsável"
              value={form.technical_responsible_name}
              onChange={(e) => set("technical_responsible_name", e.target.value)}
              hint="Recomendado pela CFM 2.073/2014; pode ser preenchido depois." />
          </div>
          <Input label="CRM" value={form.technical_responsible_crm}
            onChange={(e) => set("technical_responsible_crm", e.target.value)} />
          <Select label="UF do CRM" value={form.technical_responsible_uf}
            onChange={(e) => set("technical_responsible_uf", e.target.value)}>
            <option value="">—</option>
            {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
          </Select>
        </FormSection>

        <FormSection title="Primeiro administrador" icon={UserCog} iconColor="amber">
          <Input label="Nome completo" value={form.admin_full_name}
            onChange={(e) => set("admin_full_name", e.target.value)}
            hint="Se vazio, usaremos a parte do e-mail antes do @." />
          <Input label="E-mail" type="email" required value={form.admin_email}
            onChange={(e) => set("admin_email", e.target.value)} />
          <div className="md:col-span-2">
            <Input label="Senha inicial" type="password" required minLength={6}
              value={form.admin_password} onChange={(e) => set("admin_password", e.target.value)}
              hint="Mínimo 6 caracteres. O administrador deve trocar no primeiro acesso." />
          </div>
        </FormSection>

        <div className="flex justify-end gap-3 pt-5 border-t border-brand-border">
          <Button type="button" variant="secondary" onClick={() => router.push("/companies")}>Cancelar</Button>
          <Button type="submit" loading={loading}>Criar empresa</Button>
        </div>
      </form>
    </>
  );
}
