import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  title: string;
  icon: LucideIcon;
  iconColor?: "primary" | "blue" | "violet" | "amber";
  children: ReactNode;
  cols?: 1 | 2 | 3;
  className?: string;
}

const ICON_BG: Record<string, string> = {
  primary: "bg-primary/10 text-primary",
  blue: "bg-blue-50 text-blue-600",
  violet: "bg-violet-50 text-violet-600",
  amber: "bg-amber-50 text-amber-600",
};

export function FormSection({ title, icon: Icon, iconColor = "primary", children, cols = 2, className }: Props) {
  const gridCls = cols === 1 ? "grid-cols-1" : cols === 2 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1 md:grid-cols-3";
  return (
    <section className={className}>
      <div className="flex items-center gap-2 mb-4 pb-2 border-b border-brand-border">
        <div className={cn("p-1.5 rounded-md", ICON_BG[iconColor])}>
          <Icon className="w-4 h-4" />
        </div>
        <h3 className="text-heading-4 font-medium text-brand-text">{title}</h3>
      </div>
      <div className={cn("grid gap-x-4 gap-y-5", gridCls)}>{children}</div>
    </section>
  );
}
