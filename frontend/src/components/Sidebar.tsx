"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Brain,
  LayoutDashboard,
  Building2,
  UserCog,
  Users,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleUser,
  Menu,
  X,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { tokenStore } from "@/lib/api";
import type { Role, Me } from "@/types";

interface NavItem {
  href: string;
  label: string;
  icon: any;
  roles?: Role[];
}

/**
 * Rótulo PT-BR para o role exibido no perfil do usuário.
 * Para `doctor`, usa o gênero implícito do nome (prefixo "Dra." → feminino,
 * caso contrário masculino) — falha em alguns casos, mas evita o "Médico(a)"
 * cosmético.
 */
function roleLabelPtBr(role: Role, fullName: string): string {
  switch (role) {
    case "super_admin":
      return "Super administrador";
    case "clinic_admin":
      return "Administrador da clínica";
    case "receptionist":
      return "Recepção";
    case "doctor":
      return /^\s*dra\.?\s/i.test(fullName) ? "Médica" : "Médico";
    default:
      return role;
  }
}

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Painel", icon: LayoutDashboard, roles: ["super_admin", "clinic_admin", "doctor", "receptionist"] },
  { href: "/companies", label: "Empresas", icon: Building2, roles: ["super_admin"] },
  { href: "/agenda",    label: "Agenda",   icon: CalendarDays, roles: ["clinic_admin", "doctor", "receptionist"] },
  { href: "/patients",  label: "Pacientes", icon: Users, roles: ["clinic_admin", "doctor", "receptionist"] },
  { href: "/doctors",   label: "Médicos", icon: UserCog, roles: ["clinic_admin"] },
];

interface Props {
  me: Me;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({ me, collapsed, onToggleCollapsed, mobileOpen, onCloseMobile }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  const items = NAV.filter((it) => !it.roles || it.roles.includes(me.role));

  function logout() {
    tokenStore.clear();
    router.replace("/login");
  }

  const widthCls = collapsed ? "w-sidebar-collapsed" : "w-sidebar";

  return (
    <>
      {/* Overlay mobile */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onCloseMobile}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          "bg-primary-dark text-white flex-col transition-all duration-280 ease-sidebar",
          // Desktop: FIXED — sempre na viewport, jamais "sai" no scroll.
          // Layout pai compensa via padding-left dinâmico.
          "lg:flex lg:fixed lg:left-0 lg:top-0 lg:h-screen shrink-0 z-50",
          // Mobile drawer
          "fixed left-0 top-0 h-[100dvh]",
          mobileOpen ? "flex w-sidebar-mobile translate-x-0" : "hidden -translate-x-full",
          "lg:translate-x-0",
          widthCls,
        )}
      >
        {/* Header */}
        <div className="px-5 py-5 flex items-center justify-between gap-2">
          <Link href="/dashboard" className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <Brain className="w-5 h-5 text-white" strokeWidth={2} />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-base font-semibold tracking-tight">PsiClinic</p>
                <p className="text-[10px] text-white/60 truncate">{me.company_name ?? "Super Admin"}</p>
              </div>
            )}
          </Link>
          {/* Mobile close */}
          <button
            onClick={onCloseMobile}
            className="lg:hidden rounded-md p-1.5 hover:bg-white/10"
            aria-label="Fechar menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toggle collapsed (desktop) */}
        <button
          onClick={onToggleCollapsed}
          className="hidden lg:flex absolute -right-3 top-12 w-6 h-6 rounded-full bg-white border border-brand-border items-center justify-center text-brand-muted hover:text-primary shadow-sm"
          aria-label="Recolher menu"
        >
          {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto px-3 mt-2">
          <p className={cn("text-[10px] font-medium text-white/40 uppercase mb-2 px-2", collapsed && "lg:hidden")}>
            Navegação
          </p>
          <ul className="space-y-0.5">
            {items.map((it) => {
              const active = pathname === it.href || pathname.startsWith(it.href + "/");
              const Icon = it.icon;
              return (
                <li key={it.href}>
                  <Link
                    href={it.href as any}
                    onClick={onCloseMobile}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200 relative",
                      active
                        ? "bg-white/15 text-white font-medium"
                        : "text-white/70 hover:bg-white/10 hover:text-white",
                    )}
                  >
                    {active && (
                      <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r bg-cyan-300" />
                    )}
                    <Icon className="w-4.5 h-4.5 shrink-0" size={18} />
                    {!collapsed && <span className="truncate">{it.label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Footer — perfil + logout */}
        <div className="border-t border-white/10 p-3">
          <div className={cn("flex items-center gap-3 px-2 py-2 rounded-lg", collapsed && "lg:justify-center")}>
            <div className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center shrink-0">
              <CircleUser className="w-5 h-5 text-white" />
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-white truncate">{me.full_name}</p>
                <p className="text-[10px] text-white/60">{roleLabelPtBr(me.role, me.full_name)}</p>
              </div>
            )}
          </div>
          <button
            onClick={logout}
            className={cn(
              "mt-2 w-full flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-white/70 hover:bg-white/10 hover:text-white transition-colors",
              collapsed && "lg:justify-center",
            )}
          >
            <LogOut className="w-4 h-4" />
            {!collapsed && <span>Sair</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
