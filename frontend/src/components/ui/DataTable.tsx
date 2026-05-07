"use client";

import { ReactNode } from "react";
import { Search, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./Button";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  width?: string;
  className?: string;
}

interface Props<T> {
  title?: string;
  description?: string;
  data: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  total?: number;
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  search?: string;
  onSearchChange?: (s: string) => void;
  onCreate?: () => void;
  createLabel?: string;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  empty?: ReactNode;
}

export function DataTable<T>({
  title,
  description,
  data,
  columns,
  rowKey,
  total,
  page = 1,
  pageSize = 20,
  onPageChange,
  search,
  onSearchChange,
  onCreate,
  createLabel = "Novo",
  onRowClick,
  loading,
  empty,
}: Props<T>) {
  const totalPages = total ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total ?? data.length);

  return (
    <div className="card-psiclinic overflow-hidden">
      {/* Header */}
      {(title || onSearchChange || onCreate) && (
        <div className="px-4 sm:px-5 py-4 border-b border-brand-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-brand-bg-subtle">
          <div>
            {title && <h2 className="text-heading-3 text-brand-text">{title}</h2>}
            {description && <p className="text-caption text-brand-muted mt-0.5">{description}</p>}
          </div>
          <div className="flex items-center gap-2">
            {onSearchChange !== undefined && (
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" />
                <input
                  type="text"
                  placeholder="Buscar…"
                  value={search ?? ""}
                  onChange={(e) => onSearchChange(e.target.value)}
                  className="input-psiclinic-sm pl-9 w-full sm:w-[260px]"
                />
              </div>
            )}
            {onCreate && (
              <Button variant="primary" size="md" leftIcon={<Plus className="w-4 h-4" />} onClick={onCreate}>
                {createLabel}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-brand-bg-subtle">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  style={{ width: c.width }}
                  className="px-4 py-2.5 text-left text-label-upper uppercase text-brand-muted tracking-wider whitespace-nowrap"
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-border">
            {loading && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-brand-muted text-body-sm">
                  Carregando…
                </td>
              </tr>
            )}
            {!loading && data.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-brand-muted text-body-sm">
                  {empty ?? "Nenhum registro encontrado."}
                </td>
              </tr>
            )}
            {!loading &&
              data.map((row) => (
                <tr
                  key={rowKey(row)}
                  className={cn(
                    "transition-colors",
                    onRowClick ? "hover:bg-[#F6F3EB] cursor-pointer" : "hover:bg-brand-bg-subtle",
                  )}
                  onClick={() => onRowClick?.(row)}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={cn("px-4 py-3 text-body-sm text-brand-text-2", c.className)}>
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Footer paginação */}
      {total !== undefined && total > 0 && (
        <div className="px-4 sm:px-5 py-3 border-t border-brand-border flex items-center justify-between bg-brand-bg-subtle">
          <p className="text-caption text-brand-muted">
            {start}–{end} de {total}
          </p>
          {onPageChange && (
            <div className="flex items-center gap-1">
              <button
                disabled={page <= 1}
                onClick={() => onPageChange(page - 1)}
                className="btn btn-secondary btn-icon-sm disabled:opacity-30"
                aria-label="Anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-caption text-brand-text px-3">
                {page} / {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => onPageChange(page + 1)}
                className="btn btn-secondary btn-icon-sm disabled:opacity-30"
                aria-label="Próxima"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
