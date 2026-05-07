"use client";

import { ReactNode, useState, useCallback } from "react";
import { AlertTriangle } from "lucide-react";
import { Modal } from "./Modal";
import { Button } from "./Button";

type Variant = "danger" | "warning" | "default";

interface ConfirmOptions {
  title: string;
  message: string | ReactNode;
  variant?: Variant;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface State extends ConfirmOptions {
  open: boolean;
  resolve?: (v: boolean) => void;
}

let setStateGlobal: ((s: State) => void) | null = null;

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({
    open: false, title: "", message: "",
  });
  setStateGlobal = setState;

  const close = useCallback((v: boolean) => {
    state.resolve?.(v);
    setState({ ...state, open: false });
  }, [state]);

  return (
    <>
      {children}
      <Modal
        open={state.open}
        onClose={() => close(false)}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => close(false)}>{state.cancelLabel ?? "Cancelar"}</Button>
            <Button
              variant={state.variant === "danger" ? "danger" : "primary"}
              onClick={() => close(true)}
            >
              {state.confirmLabel ?? "Confirmar"}
            </Button>
          </>
        }
      >
        <div className="flex gap-3">
          <div
            className={
              state.variant === "danger"
                ? "p-2 rounded-lg bg-error-bg text-error h-10 w-10 flex items-center justify-center shrink-0"
                : state.variant === "warning"
                  ? "p-2 rounded-lg bg-warning-bg text-warning h-10 w-10 flex items-center justify-center shrink-0"
                  : "p-2 rounded-lg bg-primary-light text-primary-dark h-10 w-10 flex items-center justify-center shrink-0"
            }
          >
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-heading-3 text-brand-text mb-1">{state.title}</h3>
            <p className="text-body-sm text-brand-muted whitespace-pre-line">{state.message}</p>
          </div>
        </div>
      </Modal>
    </>
  );
}

/**
 * Hook utilitário: `const confirm = useConfirm(); await confirm({ title, message });`
 */
export function useConfirm() {
  return useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setStateGlobal?.({ ...opts, open: true, resolve });
    });
  }, []);
}
