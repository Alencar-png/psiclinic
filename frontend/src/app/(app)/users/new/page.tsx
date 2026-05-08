"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Mail, Lock, Building2, Info } from "lucide-react";
import { api } from "@/lib/api";
import {
  Button, FormSection, Input, LoadingState, PageHeader, Select, useToast,
} from "@/components/ui";
import type { Me, Page, Role, Company } from "@/types";
import { ROLE_DESCRIPTION, ROLE_LABEL, creatableRoles } from "@/lib/roles";

export default function NewUserPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [me, setMe] = useState<Me | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState<{
    full_name: string;
    email: string;
    role: Role;
    company_id: string;
    password: string;
  }>({
    full_name: "", email: "",
    role: "receptionist",   // default mais seguro
    company_id: "",
    password: "",
  });

  function set<K extends keyof typeof form>(k: K, v: any) {
    setForm({ ...form, [k]: v });
  }

  // Carrega dados auxiliares
  useEffect(() => {
    api<Me>("/auth/me").then((m) => {
      setMe(m);
      // Pré-preenche company_id do clinic_admin (não escolhe, é fixo)
      if (m.role === "clinic_admin" && m.company_id) {
        setForm((f) => ({ ...f, company_id: String(m.company_id) }));
      }
    }).catch(() => router.replace("/dashboard"));
  }, [router]);

  // Super_admin precisa da lista de empresas pra escolher tenant do novo user
  useEffect(() => {
    if (me?.role === "super_admin") {
      api<Page<Company>>("/companies", { query: { size: 100 } })
        .then((r) => setCompanies(r.items))
        .catch(() => {});
    }
  }, [me?.role]);

  const allowedRoles = useMemo(() => me ? creatableRoles(me.role) : [], [me?.role]);
  const needsCompany = form.role !== "super_admin";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!me) return;
    setLoading(true);
    try {
      const payload: Record<string, any> = {
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        role: form.role,
        password: form.password,
      };
      if (form.role !== "super_admin") {
        if (!form.company_id) {
          toast("error", "Selecione a empresa do usuário");
          setLoading(false);
          return;
        }
        payload.company_id = Number(form.company_id);
      }
      await api("/users", { method: "POST", body: payload });
      toast("success", "Usuário criado.");
      router.push("/users");
    } catch (e: any) {
      toast("error", e.message || "Erro ao criar usuário");
    } finally { setLoading(false); }
  }

  if (!me) return <LoadingState message="Carregando" />;

  return (
    <>
      <PageHeader
        title="Novo usuário"
        description="Para criar um médico ou psicólogo, use a tela Profissionais — lá você define CRM/CRP e especialidade."
        back={{ href: "/users" }}
      />

      <form onSubmit={handleSubmit} className="max-w-2xl card-psiclinic card-body space-y-8">

        {/* Tipo do usuário */}
        <FormSection title="Tipo de usuário" icon={ShieldCheck}>
          <div className="md:col-span-2 space-y-2">
            {allowedRoles.map((r) => (
              <label
                key={r}
                className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${
                  form.role === r
                    ? "border-primary bg-primary-light/30"
                    : "border-brand-border bg-white hover:border-primary/50"
                }`}
              >
                <input
                  type="radio"
                  name="role"
                  value={r}
                  checked={form.role === r}
                  onChange={() => set("role", r)}
                  className="mt-1 accent-primary"
                />
                <div>
                  <p className="text-body-sm font-semibold text-brand-text">{ROLE_LABEL[r]}</p>
                  <p className="text-caption text-brand-muted mt-0.5">{ROLE_DESCRIPTION[r]}</p>
                </div>
              </label>
            ))}
          </div>
        </FormSection>

        {/* Empresa */}
        {needsCompany && (
          <FormSection title="Empresa" icon={Building2} iconColor="blue">
            {me.role === "super_admin" ? (
              <div className="md:col-span-2">
                <Select
                  label="Empresa do usuário"
                  required
                  value={form.company_id}
                  onChange={(e) => set("company_id", e.target.value)}
                >
                  <option value="">— selecione —</option>
                  {companies.map((c) => (
                    <option key={c.id} value={String(c.id)}>{c.name}</option>
                  ))}
                </Select>
              </div>
            ) : (
              <div className="md:col-span-2 flex items-center gap-2 text-body-sm text-brand-muted bg-brand-bg-subtle px-3 py-2 rounded-lg">
                <Info className="w-4 h-4 shrink-0" />
                Será criado na sua clínica:{" "}
                <span className="font-medium text-brand-text">{me.company_name}</span>
              </div>
            )}
          </FormSection>
        )}

        {/* Identificação + Acesso */}
        <FormSection title="Identificação e acesso" icon={Mail} iconColor="violet">
          <div className="md:col-span-2">
            <Input
              label="Nome completo" required
              value={form.full_name}
              onChange={(e) => set("full_name", e.target.value)}
            />
          </div>
          <Input
            label="E-mail (login)" type="email" required
            leftIcon={<Mail className="w-4 h-4" />}
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
          />
          <Input
            label="Senha inicial" type="password" required minLength={4}
            leftIcon={<Lock className="w-4 h-4" />}
            value={form.password}
            onChange={(e) => set("password", e.target.value)}
            hint="Mínimo 4 caracteres. Comunique ao usuário para que troque no primeiro acesso."
          />
        </FormSection>

        <div className="flex justify-end gap-3 pt-5 border-t border-brand-border">
          <Button type="button" variant="secondary" onClick={() => router.push("/users")}>
            Cancelar
          </Button>
          <Button type="submit" loading={loading}>Criar usuário</Button>
        </div>
      </form>
    </>
  );
}
