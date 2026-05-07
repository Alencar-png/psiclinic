"use client";

/**
 * Tabs no estilo shadcn/ui (Radix Tabs).
 *
 * Uso:
 *   <Tabs defaultValue="a">
 *     <TabsList>
 *       <TabsTrigger value="a">A</TabsTrigger>
 *       <TabsTrigger value="b">B</TabsTrigger>
 *     </TabsList>
 *     <TabsContent value="a">Conteúdo A</TabsContent>
 *     <TabsContent value="b">Conteúdo B</TabsContent>
 *   </Tabs>
 *
 * Implementação interna: Context API + estado local + roving tabindex
 * + setas de teclado (← → / Home / End). Mesma semântica WAI-ARIA do Radix.
 */
import {
  createContext, useContext, useState, useEffect, useRef, useCallback,
  ReactNode, ButtonHTMLAttributes, KeyboardEvent,
} from "react";
import { cn } from "@/lib/utils";

interface TabsCtx {
  value: string;
  setValue: (v: string) => void;
  registerTrigger: (v: string, el: HTMLButtonElement | null) => void;
  focusByOffset: (current: string, offset: number | "first" | "last") => void;
  orientation: "horizontal" | "vertical";
}
const Ctx = createContext<TabsCtx | null>(null);

interface TabsProps {
  defaultValue?: string;
  value?: string;
  onValueChange?: (v: string) => void;
  orientation?: "horizontal" | "vertical";
  className?: string;
  children: ReactNode;
}

export function Tabs({
  defaultValue, value: controlled, onValueChange,
  orientation = "horizontal", className, children,
}: TabsProps) {
  const [internal, setInternal] = useState(defaultValue ?? "");
  const value = controlled ?? internal;
  const triggers = useRef<Map<string, HTMLButtonElement | null>>(new Map());
  const order = useRef<string[]>([]);

  const setValue = useCallback((v: string) => {
    if (controlled === undefined) setInternal(v);
    onValueChange?.(v);
  }, [controlled, onValueChange]);

  const registerTrigger = useCallback((v: string, el: HTMLButtonElement | null) => {
    triggers.current.set(v, el);
    if (el && !order.current.includes(v)) order.current.push(v);
    if (!el) {
      order.current = order.current.filter((x) => x !== v);
      triggers.current.delete(v);
    }
  }, []);

  const focusByOffset = useCallback((current: string, offset: number | "first" | "last") => {
    const idx = order.current.indexOf(current);
    let next: number;
    if (offset === "first") next = 0;
    else if (offset === "last") next = order.current.length - 1;
    else next = (idx + offset + order.current.length) % order.current.length;
    const targetVal = order.current[next];
    triggers.current.get(targetVal)?.focus();
    setValue(targetVal);
  }, [setValue]);

  return (
    <Ctx.Provider value={{ value, setValue, registerTrigger, focusByOffset, orientation }}>
      <div className={cn("w-full", className)} data-orientation={orientation}>{children}</div>
    </Ctx.Provider>
  );
}

interface ListProps {
  className?: string;
  children: ReactNode;
}
export function TabsList({ className, children }: ListProps) {
  const ctx = useContext(Ctx);
  return (
    <div
      role="tablist"
      aria-orientation={ctx?.orientation}
      className={cn(
        "inline-flex items-center gap-1 rounded-xl bg-brand-bg-subtle p-1 border border-brand-border",
        ctx?.orientation === "vertical" && "flex-col items-stretch",
        className,
      )}
    >
      {children}
    </div>
  );
}

interface TriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
  children: ReactNode;
}
export function TabsTrigger({ value, children, className, ...rest }: TriggerProps) {
  const ctx = useContext(Ctx)!;
  const ref = useRef<HTMLButtonElement | null>(null);
  const active = ctx.value === value;

  useEffect(() => {
    ctx.registerTrigger(value, ref.current);
    return () => ctx.registerTrigger(value, null);
  }, [value, ctx]);

  function onKey(e: KeyboardEvent<HTMLButtonElement>) {
    const isHoriz = ctx.orientation === "horizontal";
    if ((isHoriz && e.key === "ArrowRight") || (!isHoriz && e.key === "ArrowDown")) {
      e.preventDefault(); ctx.focusByOffset(value, +1);
    } else if ((isHoriz && e.key === "ArrowLeft") || (!isHoriz && e.key === "ArrowUp")) {
      e.preventDefault(); ctx.focusByOffset(value, -1);
    } else if (e.key === "Home") { e.preventDefault(); ctx.focusByOffset(value, "first"); }
    else if (e.key === "End")    { e.preventDefault(); ctx.focusByOffset(value, "last"); }
  }

  return (
    <button
      ref={ref}
      type="button"
      role="tab"
      aria-selected={active}
      aria-controls={`tabpanel-${value}`}
      id={`tab-${value}`}
      tabIndex={active ? 0 : -1}
      onClick={() => ctx.setValue(value)}
      onKeyDown={onKey}
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-body-sm font-medium",
        "transition-all duration-200 outline-none",
        "focus-visible:ring-2 focus-visible:ring-primary/40",
        active
          ? "bg-white text-primary-dark shadow-xs border border-brand-border"
          : "text-brand-muted hover:text-brand-text",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

interface ContentProps {
  value: string;
  className?: string;
  children: ReactNode;
}
export function TabsContent({ value, className, children }: ContentProps) {
  const ctx = useContext(Ctx)!;
  if (ctx.value !== value) return null;
  return (
    <div
      role="tabpanel"
      id={`tabpanel-${value}`}
      aria-labelledby={`tab-${value}`}
      tabIndex={0}
      className={cn("mt-4 outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-lg", className)}
    >
      {children}
    </div>
  );
}
