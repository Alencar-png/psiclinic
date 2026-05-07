import { useEffect, useRef, useState } from "react";

interface Options {
  delayMs?: number;
  onSave: (html: string, plain: string) => Promise<void>;
}

/**
 * Hook de auto-save com debounce. Útil para editores de prontuário onde
 * perda de dados é inaceitável e o servidor não suporta CRDT.
 *
 * Estados expostos:
 *   - status: "idle" | "saving" | "saved" | "error"
 *   - lastSavedAt: Date | null
 */
export function useAutoSave({ delayMs = 1500, onSave }: Options) {
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<{ html: string; plain: string } | null>(null);

  function schedule(html: string, plain: string) {
    pendingRef.current = { html, plain };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const p = pendingRef.current;
      if (!p) return;
      setStatus("saving");
      try {
        await onSave(p.html, p.plain);
        setStatus("saved");
        setLastSavedAt(new Date());
      } catch {
        setStatus("error");
      }
    }, delayMs);
  }

  // Cleanup
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return { schedule, status, lastSavedAt };
}
