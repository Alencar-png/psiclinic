"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Menu } from "lucide-react";
import { api, tokenStore } from "@/lib/api";
import type { Me } from "@/types";
import { Sidebar } from "@/components/Sidebar";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { LoadingState } from "@/components/ui";
import { ToastProvider } from "@/components/ui/Toast";
import { ConfirmDialogProvider } from "@/components/ui/ConfirmDialog";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!tokenStore.access) {
      router.replace("/login");
      return;
    }
    api<Me>("/auth/me")
      .then(setMe)
      .catch(() => router.replace("/login"))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <LoadingState variant="page" message="Carregando seu workspace" hint="Verificando credenciais…" />
      </div>
    );
  }
  if (!me) return null;

  return (
    <ToastProvider>
      <ConfirmDialogProvider>
        {/*
          Sidebar é FIXED em desktop — main tem padding-left dinâmico para
          compensar (260px expandida, 76px recolhida).
          Em mobile a sidebar é drawer fixed sobreposto, então no mobile o
          main não recebe padding.
        */}
        <Sidebar
          me={me}
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed((c) => !c)}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
        />
        <div
          className={`min-h-screen flex flex-col bg-stone-50 transition-[padding] duration-280 ease-sidebar ${
            collapsed ? "lg:pl-sidebar-collapsed" : "lg:pl-sidebar"
          }`}
        >
          {/* Banner de impersonação — sticky no topo, só aparece se super_admin
              está logado como admin de uma empresa. */}
          <ImpersonationBanner me={me} />

          {/* Botão hambúrguer (apenas mobile) */}
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden fixed top-4 left-4 z-30 h-10 w-10 bg-white border border-brand-border rounded-lg flex items-center justify-center shadow-sm"
            aria-label="Abrir menu"
          >
            <Menu className="w-5 h-5 text-brand-text" />
          </button>

          <main className="flex-1 min-w-0 p-6 lg:p-10 lg:pt-8">{children}</main>

          <footer className="py-3 px-6 border-t border-brand-border bg-white flex items-center justify-center gap-3 text-[11px] text-brand-muted">
            <a href="#" className="hover:text-primary">Termos de Uso</a>
            <span>•</span>
            <a href="#" className="hover:text-primary">Política de Privacidade</a>
          </footer>
        </div>
      </ConfirmDialogProvider>
    </ToastProvider>
  );
}
