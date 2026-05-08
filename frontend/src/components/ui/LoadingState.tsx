"use client";

/**
 * LoadingState — bloco padrão de carregamento.
 *
 * Variantes:
 *   - "page"    full viewport (usado em layouts e loading.tsx do Next)
 *   - "section" centralizado dentro do conteúdo (default)
 *   - "inline"  pequeno, alinhado horizontalmente — botões, células
 *
 * Mensagem é opcional. Se ausente, usa "Carregando…".
 */
import { cn } from "@/lib/utils";
import { Spinner } from "./Spinner";

interface Props {
  variant?: "page" | "section" | "inline";
  message?: string | null;
  /** Texto auxiliar abaixo da mensagem (ex: "Buscando profissionais"). */
  hint?: string;
  className?: string;
}

export function LoadingState({
  variant = "section",
  message = "Carregando…",
  hint,
  className,
}: Props) {
  if (variant === "inline") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-2 text-body-sm text-brand-muted",
          className,
        )}
      >
        <Spinner size="sm" tone="primary" />
        {message && <span>{message}</span>}
      </span>
    );
  }

  // page e section compartilham layout, mudam só altura mínima
  return (
    <div
      className={cn(
        "w-full flex flex-col items-center justify-center gap-4 animate-fade-in",
        variant === "page" ? "min-h-[60vh]" : "min-h-[200px] py-10",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <div className="relative">
        {/* Halo pulsante por trás do spinner — efeito sutil de "respiração" */}
        <span
          className="absolute inset-0 rounded-full bg-primary/20 animate-ping"
          aria-hidden
        />
        <Spinner variant="ring" size="lg" tone="primary" className="relative" />
      </div>
      {message && (
        <div className="text-center">
          <p className="text-body-sm text-brand-text font-medium">{message}</p>
          {hint && <p className="text-caption text-brand-muted mt-0.5">{hint}</p>}
        </div>
      )}
    </div>
  );
}
