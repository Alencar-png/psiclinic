"use client";

/**
 * Badge de versão fixado no canto inferior direito.
 *
 * Click → modal com changelog completo (versões mais recentes no topo).
 * Persiste a última versão vista em localStorage; quando há nova, exibe
 * um indicador pulsante "novo" pra avisar.
 */
import { useEffect, useState } from "react";
import { Sparkles, X, ScrollText } from "lucide-react";
import { CHANGELOG, APP_VERSION, VERSION_LABEL, type ChangelogTag } from "@/lib/version";
import { cn } from "@/lib/utils";

const SEEN_KEY = "psiclinic.changelog.seen";

const TAG_STYLE: Record<ChangelogTag, { label: string; className: string }> = {
  feature:    { label: "Novo",      className: "bg-primary/10 text-primary-dark border-primary/20" },
  improve:    { label: "Melhoria",  className: "bg-blue-50 text-blue-700 border-blue-200" },
  fix:        { label: "Correção",  className: "bg-green-50 text-green-700 border-green-200" },
  security:   { label: "Segurança", className: "bg-amber-50 text-amber-800 border-amber-200" },
  deprecate:  { label: "Removido",  className: "bg-stone-100 text-stone-700 border-stone-300" },
};

export function VersionBadge() {
  const [open, setOpen] = useState(false);
  const [hasNew, setHasNew] = useState(false);

  // Detecta se a versão atual ainda não foi vista pelo usuário
  useEffect(() => {
    if (typeof window === "undefined") return;
    const seen = localStorage.getItem(SEEN_KEY);
    setHasNew(seen !== APP_VERSION);
  }, []);

  function handleOpen() {
    setOpen(true);
    if (typeof window !== "undefined") {
      localStorage.setItem(SEEN_KEY, APP_VERSION);
    }
    setHasNew(false);
  }

  return (
    <>
      {/* Pílula fixed bottom-right (não colide com sidebar mobile/desktop) */}
      <button
        type="button"
        onClick={handleOpen}
        className={cn(
          "fixed bottom-4 right-4 z-30",
          "inline-flex items-center gap-1.5 rounded-full",
          "px-3 py-1.5 text-xs font-medium",
          "bg-white border border-brand-border shadow-md",
          "text-brand-muted hover:text-primary hover:border-primary/40 hover:shadow-lg",
          "transition-all duration-200",
        )}
        aria-label="Ver changelog"
      >
        <Sparkles className={cn("w-3.5 h-3.5", hasNew && "text-primary")} />
        <span className="font-mono">{VERSION_LABEL}</span>
        {hasNew && (
          <span
            className="relative ml-0.5"
            aria-label="Nova versão"
            title="Nova versão — clique para ver"
          >
            <span className="absolute inset-0 rounded-full bg-primary/40 animate-ping" />
            <span className="relative block w-1.5 h-1.5 rounded-full bg-primary" />
          </span>
        )}
      </button>

      {open && <ChangelogModal onClose={() => setOpen(false)} />}
    </>
  );
}

function ChangelogModal({ onClose }: { onClose: () => void }) {
  // Trava scroll do body enquanto o modal está aberto
  useEffect(() => {
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 animate-fade-in">
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-brand-border max-h-[85vh] flex flex-col animate-zoom-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="changelog-title"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-brand-border flex items-start justify-between gap-3">
          <div>
            <h3 id="changelog-title" className="text-heading-3 text-brand-text font-medium flex items-center gap-2">
              <ScrollText className="w-5 h-5 text-primary" />
              Histórico de versões
            </h3>
            <p className="text-body-sm text-brand-muted mt-0.5">
              PsiClinic <span className="font-mono">{VERSION_LABEL}</span> · {CHANGELOG[0]?.date}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-brand-muted hover:text-brand-text rounded-md p-1 hover:bg-brand-bg-muted"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {CHANGELOG.map((entry, idx) => (
            <article key={entry.version} className={idx === 0 ? "" : "pt-5 border-t border-brand-border"}>
              <header className="flex items-baseline gap-3 mb-3">
                <h4 className="text-heading-4 text-brand-text font-semibold">
                  v{entry.version}
                </h4>
                <span className="text-caption text-brand-muted">
                  {formatPtBrDate(entry.date)}
                </span>
                {idx === 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary-dark border border-primary/20">
                    Atual
                  </span>
                )}
              </header>
              <ul className="space-y-2">
                {entry.items.map((it, i) => {
                  const style = TAG_STYLE[it.tag];
                  return (
                    <li key={i} className="flex items-start gap-2.5">
                      <span
                        className={cn(
                          "shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium border",
                          style.className,
                        )}
                      >
                        {style.label}
                      </span>
                      <p className="text-body-sm text-brand-text leading-relaxed">{it.text}</p>
                    </li>
                  );
                })}
              </ul>
            </article>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-brand-border bg-brand-bg-subtle rounded-b-2xl flex items-center justify-between text-caption text-brand-muted">
          <span>
            Build de produção · <span className="font-mono">{APP_VERSION}</span>
          </span>
          <button
            onClick={onClose}
            className="text-primary hover:underline font-medium"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

function formatPtBrDate(iso: string): string {
  // Adiciona T12 pra evitar bug de timezone (data pura "YYYY-MM-DD" vira UTC midnight,
  // que em fuso negativo renderiza um dia antes).
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}
