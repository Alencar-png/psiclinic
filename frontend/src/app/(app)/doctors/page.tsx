"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserCog, Edit2, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import type { Doctor, Page } from "@/types";
import { Badge, Button, DataTable, PageHeader, useToast, useConfirm, type Column } from "@/components/ui";
import { formatDateBR, formatPhone } from "@/lib/format";

export default function DoctorsListPage() {
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();

  const [data, setData] = useState<Page<Doctor> | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await api<Page<Doctor>>("/doctors", { query: { search: search || undefined, page, size: 20 } });
      setData(res);
    } catch (e: any) {
      toast("error", e.message || "Erro ao carregar médicos");
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [search, page]);

  async function deactivate(d: Doctor) {
    const ok = await confirm({
      title: "Desativar médico",
      message: `Deseja desativar ${d.full_name}?\nO vínculo com a clínica será marcado como inativo. Esta ação pode ser revertida via reativação manual.`,
      variant: "danger",
      confirmLabel: "Desativar",
    });
    if (!ok) return;
    try {
      await api(`/doctors/${d.id}`, { method: "DELETE" });
      toast("success", "Médico desativado.");
      load();
    } catch (e: any) {
      toast("error", e.message || "Erro ao desativar");
    }
  }

  const columns: Column<Doctor>[] = [
    {
      key: "name",
      header: "Nome",
      render: (d) => (
        <Link href={`/doctors/${d.id}/edit`} className="font-medium text-primary hover:underline">
          {d.full_name}
        </Link>
      ),
    },
    { key: "crm", header: "CRM", render: (d) => `${d.crm}/${d.crm_uf}` },
    { key: "specialty", header: "Especialidade", render: (d) => d.specialty ?? "—" },
    { key: "email", header: "E-mail", render: (d) => d.email },
    { key: "phone", header: "Telefone", render: (d) => formatPhone(d.phone) },
    { key: "created", header: "Cadastro", render: (d) => formatDateBR(d.created_at) },
    {
      key: "status",
      header: "Status",
      render: (d) => (
        <Badge dot variant={d.is_active ? "success" : "muted"}>
          {d.is_active ? "Ativo" : "Inativo"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      width: "120px",
      render: (d) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); router.push(`/doctors/${d.id}/edit` as any); }}
            className="p-1.5 rounded-md hover:bg-primary-light text-brand-muted hover:text-primary"
            aria-label="Editar"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          {d.is_active && (
            <button
              onClick={(e) => { e.stopPropagation(); deactivate(d); }}
              className="p-1.5 rounded-md hover:bg-error-bg text-brand-muted hover:text-error"
              aria-label="Desativar"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Médicos"
        description="Gerencie os médicos vinculados à clínica."
        actions={
          <Button leftIcon={<UserCog className="w-4 h-4" />} onClick={() => router.push("/doctors/new")}>
            Novo médico
          </Button>
        }
      />
      <DataTable
        title="Profissionais"
        data={data?.items ?? []}
        columns={columns}
        rowKey={(d) => String(d.id)}
        total={data?.total}
        page={page}
        pageSize={data?.size ?? 20}
        onPageChange={setPage}
        search={search}
        onSearchChange={(s) => { setSearch(s); setPage(1); }}
        loading={loading}
        empty="Nenhum médico cadastrado ainda."
      />
    </>
  );
}
