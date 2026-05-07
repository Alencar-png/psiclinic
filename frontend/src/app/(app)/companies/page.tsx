"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Edit2 } from "lucide-react";
import { api } from "@/lib/api";
import type { Company, Page } from "@/types";
import {
  Badge, Button, DataTable, PageHeader, useToast,
  type Column,
} from "@/components/ui";
import { formatCnpj, formatDateBR } from "@/lib/format";

export default function CompaniesListPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [data, setData] = useState<Page<Company> | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await api<Page<Company>>("/companies", { query: { search: search || undefined, page, size: 20 } });
      setData(res);
    } catch (e: any) {
      toast("error", e.message || "Erro ao carregar empresas");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [search, page]);

  const columns: Column<Company>[] = [
    {
      key: "name",
      header: "Empresa",
      render: (c) => (
        <div>
          <Link href={`/companies/${c.id}/edit`} className="font-medium text-primary hover:underline">{c.name}</Link>
          <p className="text-caption text-brand-muted mt-0.5">{c.trade_name ?? "—"}</p>
        </div>
      ),
    },
    { key: "cnpj", header: "CNPJ", render: (c) => formatCnpj(c.cnpj) },
    { key: "city", header: "Cidade/UF", render: (c) => c.city ? `${c.city}/${c.state ?? "—"}` : "—" },
    { key: "responsavel", header: "Responsável técnico", render: (c) => `${c.technical_responsible_name} (CRM ${c.technical_responsible_crm}/${c.technical_responsible_uf})` },
    { key: "created", header: "Criada em", render: (c) => formatDateBR(c.created_at) },
    {
      key: "status",
      header: "Status",
      render: (c) => (
        <Badge dot variant={c.status === "active" ? "success" : c.status === "suspended" ? "warning" : "error"}>
          {c.status === "active" ? "Ativa" : c.status === "suspended" ? "Suspensa" : "Cancelada"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      width: "80px",
      render: (c) => (
        <button
          onClick={(e) => { e.stopPropagation(); router.push(`/companies/${c.id}/edit` as any); }}
          className="p-1.5 rounded-md hover:bg-primary-light text-brand-muted hover:text-primary"
          aria-label="Editar"
        >
          <Edit2 className="w-4 h-4" />
        </button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Empresas"
        description="Gerencie as clínicas cadastradas no SaaS."
        actions={
          <Button leftIcon={<Building2 className="w-4 h-4" />} onClick={() => router.push("/companies/new")}>
            Nova empresa
          </Button>
        }
      />
      <DataTable
        title="Clínicas"
        data={data?.items ?? []}
        columns={columns}
        rowKey={(c) => String(c.id)}
        total={data?.total}
        page={page}
        pageSize={data?.size ?? 20}
        onPageChange={setPage}
        search={search}
        onSearchChange={(s) => { setSearch(s); setPage(1); }}
        loading={loading}
        empty="Nenhuma empresa cadastrada ainda."
      />
    </>
  );
}
