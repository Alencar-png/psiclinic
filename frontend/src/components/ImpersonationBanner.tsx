"use client";

/**
 * Banner persistente que avisa quando o super_admin está acessando o sistema
 * "como" o admin de uma empresa. Lê o claim `impersonator_email` do JWT atual
 * (decodificação somente de leitura — verificação fica no backend).
 *
 * Botão "Voltar" restaura o token original via `tokenStore.stopImpersonation()`
 * e redireciona pra /companies.
 */
import { useRouter } from "next/navigation";
import { ShieldAlert, LogOut } from "lucide-react";
import { tokenStore } from "@/lib/api";
import type { Me } from "@/types";

function decodeJwtPayload(token: string | null): Record<string, any> | null {
  if (!token) return null;
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    // base64url -> base64
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(part.length + ((4 - (part.length % 4)) % 4), "=");
    return JSON.parse(atob(b64));
  } catch {
    return null;
  }
}

interface Props {
  /** O `me` atual já é o usuário impersonado — usamos pra exibir nome/empresa. */
  me: Me;
}

export function ImpersonationBanner({ me }: Props) {
  const router = useRouter();
  if (!tokenStore.isImpersonating) return null;

  const payload = decodeJwtPayload(tokenStore.access);
  const impersonatorEmail = payload?.impersonator_email ?? "super_admin";

  function exit() {
    tokenStore.stopImpersonation();
    router.replace("/companies");
    // Force-refresh pra recarregar /auth/me com o token original
    setTimeout(() => router.refresh(), 50);
  }

  return (
    <div className="sticky top-0 z-40 bg-amber-500 text-amber-950 border-b border-amber-600 shadow-sm">
      <div className="max-w-screen-2xl mx-auto px-4 lg:px-8 py-2.5 flex items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2 min-w-0">
          <ShieldAlert className="w-4 h-4 shrink-0" strokeWidth={2.5} />
          <p className="truncate">
            <span className="font-semibold">Modo impersonação:</span>{" "}
            você está visualizando como{" "}
            <span className="font-semibold">{me.full_name}</span>
            {me.company_name ? <> ({me.company_name})</> : null} — sessão original:{" "}
            <span className="font-mono text-xs">{impersonatorEmail}</span>
          </p>
        </div>
        <button
          onClick={exit}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-md bg-amber-950 text-amber-50 hover:bg-amber-900 px-3 py-1.5 text-xs font-medium"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sair da impersonação
        </button>
      </div>
    </div>
  );
}
