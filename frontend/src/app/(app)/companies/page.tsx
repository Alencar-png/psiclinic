"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Edit2, LogIn, Trash2, AlertTriangle } from "lucide-react";
import { api, tokenStore } from "@/lib/api";
import type { Company, Page } from "@/types";
import {
  Badge, Button, DataTable, Input, Modal, PageHeader, useToast,
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
  // Modal de delete: armazena a empresa-alvo + texto digitado p/ confirmar.
  const [deleting, setDeleting] = useState<Company | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  // Loading p/ "acessar como" — bloqueia clique duplo.
  const [impersonatingId, setImpersonatingId] = useState<number | null>(null);

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

  async function impersonate(c: Company) {
    setImpersonatingId(c.id);
    try {
      const res = await api<{ access_token: string }>(
        `/companies/${c.id}/impersonate`,
        { method: "POST" },
      );
      tokenStore.startImpersonation(res.access_token);
      toast("success", `Acessando como admin de ${c.name}`);
      // Replace força full reload do layout (pra reler /auth/me com o novo token)
      router.replace("/dashboard");
      setTimeout(() => router.refresh(), 50);
    } catch (e: any) {
      toast("error", e.message || "Não foi possível acessar como admin");
      setImpersonatingId(null);
    }
  }

  function openDelete(c: Company) {
    setDeleting(c);
    setConfirmText("");
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteSubmitting(true);
    try {
      await api(`/companies/${deleting.id}`, {
        method: "DELETE",
        query: { confirm: deleting.name },
      });
      toast("success", `Empresa "${deleting.name}" excluída permanentemente`);
      setDeleting(null);
      setConfirmText("");
      await load();
    } catch (e: any) {
      toast("error", e.message || "Falha ao excluir empresa");
    } finally {
      setDeleteSubmitting(false);
    }
  }

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
      header: "Ações",
      width: "180px",
      render: (c) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => impersonate(c)}
            disabled={impersonatingId === c.id}
            className="p-1.5 rounded-md hover:bg-primary-light text-brand-muted hover:text-primary disabled:opacity-50 disabled:cursor-wait"
            aria-label={`Acessar como admin de ${c.name}`}
            title="Acessar como admin desta empresa"
          >
            <LogIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => router.push(`/companies/${c.id}/edit` as any)}
            className="p-1.5 rounded-md hover:bg-primary-light text-brand-muted hover:text-primary"
            aria-label="Editar"
            title="Editar"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => openDelete(c)}
            className="p-1.5 rounded-md hover:bg-red-50 text-brand-muted hover:text-red-600"
            aria-label={`Excluir ${c.name}`}
            title="Excluir empresa (irreversível)"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  const confirmMatches = !!deleting && confirmText.trim() === deleting.name.trim();

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

      {/* ────────────────────────────────────────────────────────────────
          Modal: confirmação de exclusão hard
          Exige digitar o nome exato — defesa contra clique acidental.
         ──────────────────────────────────────────────────────────────── */}
      <Modal
        open={!!deleting}
        onClose={() => { if (!deleteSubmitting) { setDeleting(null); setConfirmText(""); } }}
        title="Excluir empresa permanentemente"
        size="md"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => { setDeleting(null); setConfirmText(""); }}
              disabled={deleteSubmitting}
            >
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={confirmDelete}
              disabled={!confirmMatches || deleteSubmitting}
              loading={deleteSubmitting}
              leftIcon={<Trash2 className="w-4 h-4" />}
            >
              Excluir definitivamente
            </Button>
          </>
        }
      >
        {deleting && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg bg-red-50 border border-red-200 p-4 text-red-900">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="text-sm leading-relaxed">
                <p className="font-medium">Esta ação é irreversível.</p>
                <p className="mt-1">
                  Serão removidos em cascade: usuários (admin, médicos, recepção),
                  pacientes, sessões clínicas, anamneses e versões, prescrições,
                  consentimentos e tokens de sessão. Os logs de auditoria são
                  preservados (com vínculo nulo).
                </p>
              </div>
            </div>
            <p className="text-sm text-brand-muted">
              Para confirmar, digite o nome exato da empresa:{" "}
              <span className="font-mono font-medium text-brand-text">{deleting.name}</span>
            </p>
            <Input
              autoFocus
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={deleting.name}
              disabled={deleteSubmitting}
            />
          </div>
        )}
      </Modal>
    </>
  );
}
