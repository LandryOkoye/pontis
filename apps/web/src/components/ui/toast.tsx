import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "../../lib/cn.ts";

type Kind = "success" | "error" | "info";
interface Toast {
  id: number;
  kind: Kind;
  title: string;
  body?: string;
}

const ToastContext = createContext<((kind: Kind, title: string, body?: string) => void) | null>(
  null,
);

const ICON = { success: CheckCircle2, error: AlertTriangle, info: Info };
const TONE = { success: "text-parity", error: "text-danger", info: "text-ion" };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback(
    (id: number) => setToasts((list) => list.filter((t) => t.id !== id)),
    [],
  );
  const push = useCallback(
    (kind: Kind, title: string, body?: string) => {
      const id = Date.now() + Math.random();
      setToasts((list) => [...list.slice(-3), { id, kind, title, ...(body ? { body } : {}) }]);
      window.setTimeout(() => dismiss(id), 6000);
    },
    [dismiss],
  );
  const value = useMemo(() => push, [push]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-12 z-[90] flex flex-col items-end gap-2 sm:left-auto sm:right-6 sm:w-96"
      >
        {toasts.map((toast) => {
          const Icon = ICON[toast.kind];
          return (
            <div
              key={toast.id}
              role="status"
              className="panel panel-raised pointer-events-auto flex w-full animate-rise items-start gap-3 p-4"
            >
              <Icon className={cn("mt-0.5 size-4 shrink-0", TONE[toast.kind])} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{toast.title}</p>
                {toast.body && <p className="mt-0.5 text-[13px] text-muted">{toast.body}</p>}
              </div>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => dismiss(toast.id)}
                className="text-faint hover:text-text"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const push = useContext(ToastContext);
  if (!push) throw new Error("useToast must be used inside <ToastProvider>");
  return push;
}
