"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { api } from "@/lib/api";
import type { Page, PatientListItem } from "@/types";
import { Badge, Button, DataTable, PageHeader, useToast, type Column } from "@/components/ui";
import { formatDateTimeBR } from "@/lib/format";

export default function PatientsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [data, setData] = useState<Page<PatientListItem> | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await api<Page<PatientListItem>>("/patients", {
        query: { search: search || undefined, page, size: 20 },
      });
      setData(r);
    } catch (e: any) {
      toast("error", e.message || "Erro ao carregar pacientes");
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [search, page]);

  const columns: Column<PatientListItem>[] = [
    {
      key: "name", header: "Nome",
      render: (p) => (
        <Link href={`/patients/${p.id}`} className="font-medium text-primary hover:underline">
          {p.full_name}
        </Link>
      ),
    },
    { key: "age", header: "Idade", render: (p) => `${p.age} anos` },
    { key: "doctor", header: "Médico responsável", render: (p) => p.primary_doctor_name ?? "—" },
    { key: "last", header: "Última sessão", render: (p) => p.last_session_at ? formatDateTimeBR(p.last_session_at) : "—" },
    {
      key: "status", header: "Status",
      render: (p) => (
        <Badge dot variant={p.status === "active" ? "success" : p.status === "discharged" ? "muted" : "warning"}>
          {p.status === "active" ? "Ativo" : p.status === "discharged" ? "Alta" : "Inativo"}
        </Badge>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Pacientes"
        description="Cadastro e prontuário dos pacientes da clínica."
        actions={
          <Button leftIcon={<UserPlus className="w-4 h-4" />} onClick={() => router.push("/patients/new")}>
            Novo paciente
          </Button>
        }
      />
      <DataTable
        title="Lista de pacientes"
        data={data?.items ?? []}
        columns={columns}
        rowKey={(p) => p.id}
        total={data?.total}
        page={page}
        pageSize={data?.size ?? 20}
        onPageChange={setPage}
        search={search}
        onSearchChange={(s) => { setSearch(s); setPage(1); }}
        onRowClick={(p) => router.push(`/patients/${p.id}` as any)}
        loading={loading}
        empty="Nenhum paciente cadastrado. Clique em 'Novo paciente' para começar."
      />
    </>
  );
}
