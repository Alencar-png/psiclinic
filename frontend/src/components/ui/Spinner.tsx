"use client";

/**
 * Spinner — animação de carregamento reutilizável.
 *
 * Dois estilos:
 *   - "ring" (default): SVG circular com gradiente cônico que gira (mais
 *     elegante que o loader2 do lucide). Bom p/ inline e blocos.
 *   - "dots": 3 bolinhas pulsantes em onda — bom p/ feedback minimalista
 *     em footers e estados auxiliares.
 *
 * Tamanhos: "sm" (16px), "md" (28px) — default, "lg" (44px), "xl" (64px).
 */
import { cn } from "@/lib/utils";

interface Props {
  variant?: "ring" | "dots";
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  /** Cor base — usa `currentColor` por padrão (herda do parent). */
  tone?: "primary" | "muted" | "white";
}

const SIZE_PX: Record<NonNullable<Props["size"]>, number> = {
  sm: 16,
  md: 28,
  lg: 44,
  xl: 64,
};

const TONE_CLASS: Record<NonNullable<Props["tone"]>, string> = {
  primary: "text-primary",
  muted: "text-brand-muted",
  white: "text-white",
};

export function Spinner({
  variant = "ring",
  size = "md",
  tone = "primary",
  className,
}: Props) {
  if (variant === "dots") {
    return <DotsSpinner size={size} tone={tone} className={className} />;
  }
  return <RingSpinner size={size} tone={tone} className={className} />;
}

function RingSpinner({
  size, tone, className,
}: { size: NonNullable<Props["size"]>; tone: NonNullable<Props["tone"]>; className?: string }) {
  const px = SIZE_PX[size];
  const stroke = Math.max(2, Math.round(px / 12));
  const r = (px - stroke) / 2;
  const c = px / 2;
  // Stroke-dasharray: 25% visível ("arco"), 75% gap. Anima rotação.
  const circ = 2 * Math.PI * r;
  return (
    <span
      role="status"
      aria-label="Carregando"
      className={cn("inline-flex items-center justify-center", TONE_CLASS[tone], className)}
      style={{ width: px, height: px }}
    >
      <svg
        width={px}
        height={px}
        viewBox={`0 0 ${px} ${px}`}
        className="animate-spin"
        // Velocidade ligeiramente mais lenta que o default Tailwind (1s)
        style={{ animationDuration: "0.9s" }}
      >
        {/* Trilha de fundo */}
        <circle
          cx={c} cy={c} r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeOpacity="0.15"
        />
        {/* Arco que gira */}
        <circle
          cx={c} cy={c} r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circ * 0.28} ${circ}`}
          // Começa no topo
          transform={`rotate(-90 ${c} ${c})`}
        />
      </svg>
    </span>
  );
}

function DotsSpinner({
  size, tone, className,
}: { size: NonNullable<Props["size"]>; tone: NonNullable<Props["tone"]>; className?: string }) {
  // 3 bolinhas em sequência. Tamanho do dot e gap escalam com `size`.
  const dotPx = Math.max(4, Math.round(SIZE_PX[size] / 5));
  return (
    <span
      role="status"
      aria-label="Carregando"
      className={cn("inline-flex items-center gap-1.5", TONE_CLASS[tone], className)}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="rounded-full bg-current animate-pulse-dot"
          style={{
            width: dotPx,
            height: dotPx,
            animationDelay: `${i * 0.15}s`,
          }}
        />
      ))}
    </span>
  );
}
