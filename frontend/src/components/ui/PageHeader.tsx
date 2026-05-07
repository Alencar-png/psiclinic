import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ReactNode } from "react";

interface Props {
  title: string;
  description?: string;
  back?: { href: string; label?: string };
  actions?: ReactNode;
}

export function PageHeader({ title, description, back, actions }: Props) {
  return (
    <div className="page-header">
      <div>
        {back && (
          <Link
            href={back.href as any}
            className="inline-flex items-center gap-1.5 text-body-sm text-brand-muted hover:text-primary mb-2 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {back.label ?? "Voltar"}
          </Link>
        )}
        <h1 className="text-heading-2 text-brand-text">{title}</h1>
        {description && <p className="desc">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
