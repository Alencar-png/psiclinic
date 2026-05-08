"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ShieldCheck, Mail, Lock, Building2, Info, RotateCcw, AlertTriangle,
  KeyRound, ExternalLink,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  Badge, Button, FormSection, Input, LoadingState, Modal, PageHeader, Select,
  useConfirm, useToast,
} from "@/components/ui";
import type { Me, Page, Role, Company, UserRow } from "@/types";
import {
  ROLE_BADGE_VARIANT, ROLE_DESCRIPTION, ROLE_LABEL, creatableRoles,
} from "@/lib/roles";
import { formatDateTimeBR } from "@/lib/format";

export default function EditUserPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const confirm = useConfirm();

  const [me, setMe] = useState<Me | null>(null);
  const [user, setUser] = useState<UserRow | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);

  // Estados editáveis
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<Role>("receptionist");
  const [companyId, setCompanyId] = useState<string>("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  // Modal de reset de senha
  const [pwdOpen, setPwdOpen] = useState(false);
  const [pwd, setPwd] = useState("");
  const [pwdSaving, setPwdSaving] = useState(false);

  /* ─── Carregamento inicial ─── */
  useEffect(() => {
    Promise.all([
      api<Me>("/auth/me"),
      api<UserRow>(`/users/${id}`),
    ])
      .then(([m, u]) => {
        setMe(m);
        setUser(u);
        setFullName(u.full_name);
        setRole(u.role);
        setCompanyId(u.company_id ? String(u.company_id) : "");
        setIsActive(u.is_active);

        // Doctors/psicólogos têm tela própria — redireciona pra evitar
        // que clinic_admin altere role e quebre o vínculo Doctor↔User.
        if (u.has_doctor_profile && u.doctor_id) {
          toast("info", "Editando profissional clínico — redirecionando…");
          router.replace(`/doctors/${u.doctor_id}/edit` as any);
        }
      })
      .catch((e) => {
        toast("error", e.message || "Erro ao carregar usuário");
        router.replace("/users");
      });
  }, [id, router, toast]);

  // Super_admin: lista de empresas pra possibilitar transferência
  useEffect(() => {
    if (me?.role === "super_admin") {
      api<Page<Company>>("/companies", { query: { size: 100 } })
        .then((r) => setCompanies(r.items))
        .catch(() => {});
    }
  }, [me?.role]);

  /* ─── Permissões derivadas ─── */
  const isSelf = !!me && !!user && me.id === user.id;
  const isSuper = me?.role === "super_admin";
  const allowedRoles = useMemo(() => {
    if (!me || !user) return [];
    const base = creatableRoles(me.role);
    // Garante que o role atual do user esteja entre as opções (mesmo que
    // não seja "criável" — pra exibir corretamente no select)
    return base.includes(user.role) ? base : [user.role, ...base];
  }, [me, user]);
  const canEditRole = !isSelf && !(user?.has_doctor_profile);
  const canTransferCompany = isSuper && !isSelf && role !== "super_admin";

  /* ─── Save ─── */
  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !me) return;

    // Detecta o que mudou — envia só os campos alterados.
    const payload: Record<string, any> = {};
    if (fullName.trim() !== user.full_name) payload.full_name = fullName.trim();
    if (role !== user.role && canEditRole) payload.role = role;
    if (isActive !== user.is_active) payload.is_active = isActive;
    if (canTransferCompany) {
      const newCompany = companyId ? Number(companyId) : null;
      if (newCompany !== user.company_id) payload.company_id = newCompany;
    }

    if (Object.keys(payload).length === 0) {
      toast("info", "Nenhuma alteração para salvar.");
      return;
    }

    // Confirmação extra ao desativar/reativar a si mesmo (na verdade backend já bloqueia
    // mas reforçamos UX) ou ao transferir empresa
    if (payload.company_id !== undefined && user.company_id !== null) {
      const ok = await confirm({
        title: "Transferir usuário de empresa?",
        message: `Este usuário será movido de "${user.company_name}" para a empresa selecionada. Os dados clínicos da empresa anterior permanecem com ela.`,
        variant: "warning",
        confirmLabel: "Transferir",
      });
      if (!ok) return;
    }

    setSaving(true);
    try {
      const updated = await api<UserRow>(`/users/${id}`, {
        method: "PATCH",
        body: payload,
      });
      setUser(updated);
      toast("success", "Alterações salvas.");
    } catch (e: any) {
      toast("error", e.message || "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  }

  /* ─── Reset de senha ─── */
  async function handleResetPassword() {
    if (!pwd || pwd.length < 4) {
      toast("error", "Senha deve ter no mínimo 4 caracteres");
      return;
    }
    setPwdSaving(true);
    try {
      await api(`/users/${id}`, { method: "PATCH", body: { password: pwd } });
      toast("success", "Senha redefinida. Comunique ao usuário.");
      setPwd("");
      setPwdOpen(false);
    } catch (e: any) {
      toast("error", e.message || "Falha ao redefinir senha");
    } finally {
      setPwdSaving(false);
    }
  }

  /* ─── Desativar ─── */
  async function handleDeactivate() {
    if (!user) return;
    const ok = await confirm({
      title: "Desativar usuário",
      message: `Deseja desativar ${user.full_name}?\nEle não poderá fazer login. Pode ser reativado depois mudando o status acima.`,
      variant: "danger",
      confirmLabel: "Desativar",
    });
    if (!ok) return;
    try {
      await api(`/users/${id}`, { method: "DELETE" });
      toast("success", "Usuário desativado.");
      router.push("/users");
    } catch (e: any) {
      toast("error", e.message || "Falha ao desativar");
    }
  }

  /* ─── Render ─── */
  if (!me || !user) {
    return <LoadingState message="Carregando usuário" />;
  }

  return (
    <>
      <PageHeader
        title={`Editar — ${user.full_name}`}
        description={`${user.email} · ${ROLE_LABEL[user.role]}${user.company_name ? ` · ${user.company_name}` : ""}`}
        back={{ href: "/users" }}
      />

      <form onSubmit={handleSave} className="max-w-3xl space-y-6">

        {/* Banner de auto-edição — clarifica o que está bloqueado */}
        {isSelf && (
          <div className="card-psiclinic card-body bg-amber-50 border-amber-200">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-body-sm font-medium text-amber-900">Você está editando sua própria conta</p>
                <p className="text-caption text-amber-800 mt-0.5">
                  Para evitar lock-out: você não pode alterar seu próprio role nem se desativar.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Profissional clínico — info card (já redirecionou no useEffect) */}
        {user.has_doctor_profile && (
          <div className="card-psiclinic card-body bg-info-bg border-info-border">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-info shrink-0 mt-0.5" />
              <div>
                <p className="text-body-sm font-medium text-brand-text">
                  Este usuário tem perfil clínico (CRM/CRP)
                </p>
                <p className="text-caption text-brand-muted mt-0.5">
                  Para alterar especialidade, registro ou desativar, use a tela de Profissionais.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="mt-2"
                  leftIcon={<ExternalLink className="w-4 h-4" />}
                  onClick={() => router.push(`/doctors/${user.doctor_id}/edit` as any)}
                >
                  Abrir em Profissionais
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="card-psiclinic card-body space-y-8">
          {/* Identificação */}
          <FormSection title="Identificação" icon={Mail}>
            <div className="md:col-span-2">
              <Input
                label="Nome completo"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
            <Input
              label="E-mail (login)"
              value={user.email}
              disabled
              hint="O e-mail não pode ser alterado após o cadastro."
            />
            <Input
              label="Último login"
              value={user.last_login_at ? formatDateTimeBR(user.last_login_at) : "Nunca"}
              disabled
            />
          </FormSection>

          {/* Tipo (role) */}
          <FormSection title="Tipo de acesso" icon={ShieldCheck} iconColor="violet">
            <div className="md:col-span-2 space-y-2">
              {!canEditRole && (
                <div className="flex items-center gap-2 text-caption text-brand-muted bg-brand-bg-subtle px-3 py-2 rounded-lg">
                  <Info className="w-4 h-4 shrink-0" />
                  {isSelf
                    ? "Você não pode alterar seu próprio role."
                    : "Role só pode ser alterado em /profissionais para este usuário."}
                </div>
              )}
              {allowedRoles.map((r) => (
                <label
                  key={r}
                  className={`flex items-start gap-3 p-3 rounded-xl border-2 transition-colors ${
                    !canEditRole ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
                  } ${
                    role === r
                      ? "border-primary bg-primary-light/30"
                      : "border-brand-border bg-white hover:border-primary/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="role"
                    value={r}
                    checked={role === r}
                    disabled={!canEditRole}
                    onChange={() => setRole(r)}
                    className="mt-1 accent-primary"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-body-sm font-semibold text-brand-text">{ROLE_LABEL[r]}</p>
                      <Badge dot variant={ROLE_BADGE_VARIANT[r]}>{r}</Badge>
                    </div>
                    <p className="text-caption text-brand-muted mt-0.5">{ROLE_DESCRIPTION[r]}</p>
                  </div>
                </label>
              ))}
            </div>
          </FormSection>

          {/* Empresa (super_admin: mover entre clínicas) */}
          {role !== "super_admin" && (
            <FormSection title="Empresa" icon={Building2} iconColor="blue">
              {canTransferCompany ? (
                <div className="md:col-span-2">
                  <Select
                    label="Clínica vinculada"
                    value={companyId}
                    onChange={(e) => setCompanyId(e.target.value)}
                    hint="Mover este usuário para outra clínica. Dados históricos permanecem com a anterior."
                  >
                    <option value="">— sem clínica —</option>
                    {companies.map((c) => (
                      <option key={c.id} value={String(c.id)}>{c.name}</option>
                    ))}
                  </Select>
                </div>
              ) : (
                <div className="md:col-span-2 flex items-center gap-2 text-body-sm text-brand-muted bg-brand-bg-subtle px-3 py-2 rounded-lg">
                  <Info className="w-4 h-4 shrink-0" />
                  Vinculado a:{" "}
                  <span className="font-medium text-brand-text">
                    {user.company_name ?? "— sem clínica —"}
                  </span>
                </div>
              )}
            </FormSection>
          )}

          {/* Status */}
          <FormSection title="Status da conta" icon={ShieldCheck} iconColor="amber">
            <div className="md:col-span-2 flex items-center gap-3 p-4 rounded-lg bg-brand-bg-subtle border border-brand-border">
              <input
                id="active"
                type="checkbox"
                checked={isActive}
                disabled={isSelf}
                onChange={(e) => setIsActive(e.target.checked)}
                className="w-4 h-4 accent-primary disabled:opacity-50"
              />
              <label htmlFor="active" className="text-body-sm flex-1">
                <strong className="text-brand-text">Conta ativa</strong>
                <p className="text-caption text-brand-muted">
                  Desmarque para impedir login (soft-delete). Pode reativar depois.
                  {isSelf && " Você não pode desativar a si mesmo."}
                </p>
              </label>
              <Badge dot variant={isActive ? "success" : "muted"}>
                {isActive ? "Ativa" : "Inativa"}
              </Badge>
            </div>
          </FormSection>
        </div>

        {/* Ações */}
        <div className="card-psiclinic card-body">
          <h3 className="text-heading-4 text-brand-text mb-4">Ações de segurança</h3>
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="secondary"
              leftIcon={<KeyRound className="w-4 h-4" />}
              onClick={() => setPwdOpen(true)}
            >
              Redefinir senha
            </Button>
            {!isSelf && user.is_active && (
              <Button
                type="button"
                variant="danger"
                leftIcon={<RotateCcw className="w-4 h-4" />}
                onClick={handleDeactivate}
              >
                Desativar conta
              </Button>
            )}
          </div>
          <p className="text-caption text-brand-muted mt-3">
            Toda alteração é registrada em audit_logs.
          </p>
        </div>

        {/* Footer fixo */}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={() => router.push("/users")}>
            Cancelar
          </Button>
          <Button type="submit" loading={saving}>Salvar alterações</Button>
        </div>
      </form>

      {/* ─── Modal: Reset de senha ─── */}
      <Modal
        open={pwdOpen}
        onClose={() => { if (!pwdSaving) { setPwdOpen(false); setPwd(""); } }}
        title="Redefinir senha"
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => { setPwdOpen(false); setPwd(""); }}
              disabled={pwdSaving}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleResetPassword}
              loading={pwdSaving}
              leftIcon={<KeyRound className="w-4 h-4" />}
              disabled={pwd.length < 4}
            >
              Redefinir
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg bg-amber-50 border border-amber-200 p-3 text-amber-900">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="text-caption">
              A nova senha será efetivada imediatamente. Comunique ao usuário e
              oriente-o a trocar no próximo login.
            </p>
          </div>
          <Input
            label="Nova senha temporária"
            type="password"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            placeholder="Mínimo 4 caracteres"
            autoFocus
            leftIcon={<Lock className="w-4 h-4" />}
            hint="Recomendamos pelo menos 8 caracteres com letras, números e símbolos."
          />
        </div>
      </Modal>
    </>
  );
}
