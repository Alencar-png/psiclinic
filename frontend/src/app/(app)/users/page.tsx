"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck, Edit2, UserPlus, Trash2, ExternalLink, Building2,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Me, Page, Role, UserRow, Company } from "@/types";
import {
  Badge, Button, DataTable, PageHeader, Select, useToast, useConfirm,
  type Column,
} from "@/components/ui";
import { formatDateBR, formatDateTimeBR } from "@/lib/format";
import { ROLE_LABEL, ROLE_BADGE_VARIANT } from "@/lib/roles";

export default function UsersListPage() {
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();

  const [me, setMe] = useState<Me | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [data, setData] = useState<Page<UserRow> | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [filterRole, setFilterRole] = useState<"" | Role>("");
  const [filterCompany, setFilterCompany] = useState<string>("");
  const [filterActive, setFilterActive] = useState<"" | "true" | "false">("");

  // Carrega o `me` p/ saber se é super_admin (filtro de empresa só pra ele)
  useEffect(() => {
    api<Me>("/auth/me").then(setMe).catch(() => {});
  }, []);

  // Super_admin lê empresas pra popular filtro
  useEffect(() => {
    if (me?.role === "super_admin") {
      api<Page<Company>>("/companies", { query: { size: 100 } })
        .then((r) => setCompanies(r.items))
        .catch(() => {});
    }
  }, [me?.role]);

  async function load() {
    setLoading(true);
    try {
      const res = await api<Page<UserRow>>("/users", {
        query: {
          search: search || undefined,
          role: filterRole || undefined,
          company_id: filterCompany ? Number(filterCompany) : undefined,
          is_active: filterActive === "" ? undefined : filterActive === "true",
          page,
          size: 20,
        },
      });
      setData(res);
    } catch (e: any) {
      toast("error", e.message || "Erro ao carregar usuários");
    } finally { setLoading(false); }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, [search, page, filterRole, filterCompany, filterActive]);

  function handleEdit(u: UserRow) {
    // Doctors/psicólogos: redireciona pra /doctors (lá tem CRM/CPF/specialidade)
    if (u.has_doctor_profile && u.doctor_id) {
      router.push(`/doctors/${u.doctor_id}/edit` as any);
      return;
    }
    router.push(`/users/${u.id}/edit` as any);
  }

  async function deactivate(u: UserRow) {
    const ok = await confirm({
      title: "Desativar usuário",
      message: `Deseja desativar ${u.full_name} (${u.email})?\nEle não poderá fazer login. Pode ser reativado depois.`,
      variant: "danger",
      confirmLabel: "Desativar",
    });
    if (!ok) return;
    try {
      await api(`/users/${u.id}`, { method: "DELETE" });
      toast("success", "Usuário desativado.");
      load();
    } catch (e: any) {
      toast("error", e.message || "Erro ao desativar");
    }
  }

  const columns: Column<UserRow>[] = useMemo(() => [
    {
      key: "name",
      header: "Nome",
      render: (u) => (
        <div className="min-w-0">
          <button
            onClick={() => handleEdit(u)}
            className="font-medium text-primary hover:underline text-left"
          >
            {u.full_name}
          </button>
          <p className="text-caption text-brand-muted mt-0.5">{u.email}</p>
        </div>
      ),
    },
    {
      key: "role",
      header: "Tipo",
      render: (u) => (
        <div className="flex items-center gap-2">
          <Badge dot variant={ROLE_BADGE_VARIANT[u.role]}>{ROLE_LABEL[u.role]}</Badge>
          {u.has_doctor_profile && (
            <span title="Tem perfil clínico — edite em /profissionais">
              <ExternalLink className="w-3 h-3 text-brand-muted" />
            </span>
          )}
        </div>
      ),
    },
    {
      key: "company",
      header: "Empresa",
      render: (u) => u.company_name ?? <span className="text-brand-muted">—</span>,
    },
    {
      key: "last_login",
      header: "Último login",
      render: (u) => u.last_login_at
        ? formatDateTimeBR(u.last_login_at)
        : <span className="text-brand-muted">Nunca</span>,
    },
    { key: "created", header: "Criado em", render: (u) => formatDateBR(u.created_at) },
    {
      key: "status",
      header: "Status",
      render: (u) => (
        <Badge dot variant={u.is_active ? "success" : "muted"}>
          {u.is_active ? "Ativo" : "Inativo"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      width: "120px",
      render: (u) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => handleEdit(u)}
            className="p-1.5 rounded-md hover:bg-primary-light text-brand-muted hover:text-primary"
            aria-label="Editar"
            title={u.has_doctor_profile ? "Editar (vai p/ Profissionais)" : "Editar"}
          >
            <Edit2 className="w-4 h-4" />
          </button>
          {u.is_active && me && me.id !== u.id && (
            <button
              onClick={() => deactivate(u)}
              className="p-1.5 rounded-md hover:bg-error-bg text-brand-muted hover:text-error"
              aria-label="Desativar"
              title="Desativar"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      ),
    },
  ], [me?.id]);

  const isSuper = me?.role === "super_admin";

  return (
    <>
      <PageHeader
        title="Usuários"
        description={
          isSuper
            ? "Controle todos os usuários do sistema, em qualquer clínica."
            : "Controle os usuários administrativos da sua clínica."
        }
        actions={
          <Button leftIcon={<UserPlus className="w-4 h-4" />} onClick={() => router.push("/users/new")}>
            Novo usuário
          </Button>
        }
      />

      {/* Filtros */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <Select label="Tipo" value={filterRole} onChange={(e) => { setFilterRole(e.target.value as any); setPage(1); }}>
          <option value="">Todos</option>
          <option value="super_admin">Super administrador</option>
          <option value="clinic_admin">Administrador da clínica</option>
          <option value="doctor">Médico/Psicólogo</option>
          <option value="receptionist">Recepção</option>
        </Select>
        {isSuper && (
          <Select
            label="Empresa"
            value={filterCompany}
            onChange={(e) => { setFilterCompany(e.target.value); setPage(1); }}
          >
            <option value="">Todas</option>
            {companies.map((c) => (
              <option key={c.id} value={String(c.id)}>{c.name}</option>
            ))}
          </Select>
        )}
        <Select label="Status" value={filterActive} onChange={(e) => { setFilterActive(e.target.value as any); setPage(1); }}>
          <option value="">Todos</option>
          <option value="true">Ativos</option>
          <option value="false">Inativos</option>
        </Select>
      </div>

      <DataTable
        title={isSuper ? "Todos os usuários" : "Usuários da clínica"}
        data={data?.items ?? []}
        columns={columns}
        rowKey={(u) => String(u.id)}
        total={data?.total}
        page={page}
        pageSize={data?.size ?? 20}
        onPageChange={setPage}
        search={search}
        onSearchChange={(s) => { setSearch(s); setPage(1); }}
        loading={loading}
        empty="Nenhum usuário encontrado."
      />
    </>
  );
}
