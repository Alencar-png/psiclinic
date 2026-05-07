import { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "success" | "warning" | "error" | "info" | "muted";

const VAR: Record<Variant, string> = {
  primary: "badge-primary",
  success: "badge-success",
  warning: "badge-warning",
  error: "badge-error",
  info: "badge-info",
  muted: "badge-muted",
};

interface Props {
  variant?: Variant;
  dot?: boolean;
  children: ReactNode;
  className?: string;
}

export function Badge({ variant = "muted", dot, children, className }: Props) {
  return (
    <span className={cn("badge", VAR[variant], className)}>
      {dot && (
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full",
            variant === "success" && "bg-green-500",
            variant === "warning" && "bg-amber-500",
            variant === "error" && "bg-red-500",
            variant === "info" && "bg-blue-500",
            variant === "primary" && "bg-primary",
            variant === "muted" && "bg-stone-500",
          )}
        />
      )}
      {children}
    </span>
  );
}
