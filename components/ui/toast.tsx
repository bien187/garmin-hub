"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

export interface ToastOptions {
  message: string;
  variant?: "default" | "error";
  /** Aktion (z.B. Rückgängig) */
  actionLabel?: string;
  onAction?: () => void;
  /** Anzeigedauer in ms (Standard 5000; mit Aktion 6000) */
  durationMs?: number;
}

interface ToastIntern extends ToastOptions {
  id: number;
}

const ToastContext = createContext<(o: ToastOptions) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastIntern[]>([]);
  const idRef = useRef(0);

  const entfernen = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback((o: ToastOptions) => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { ...o, id }]);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {/* Über der Navbar, Safe-Area-bewusst */}
      <div
        className="pointer-events-none fixed inset-x-0 z-50 flex flex-col items-center gap-2 px-4"
        style={{ bottom: "calc(var(--nav-h) + var(--sab) + 12px)" }}
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onClose={() => entfernen(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({
  toast,
  onClose,
}: {
  toast: ToastIntern;
  onClose: () => void;
}) {
  const dauer = toast.durationMs ?? (toast.actionLabel ? 6000 : 5000);
  useEffect(() => {
    const t = setTimeout(onClose, dauer);
    return () => clearTimeout(t);
  }, [dauer, onClose]);

  return (
    <div
      className={cn(
        "gh-toast-in pointer-events-auto relative w-full max-w-sm overflow-hidden rounded-xl border bg-card text-foreground shadow-lg",
        toast.variant === "error" ? "border-status-red/40" : "border-border"
      )}
    >
      <div className="flex items-center gap-3 px-3.5 py-2.5 text-[13px]">
        <span className="min-w-0 flex-1">{toast.message}</span>
        {toast.actionLabel && (
          <button
            onClick={() => {
              toast.onAction?.();
              onClose();
            }}
            // sichtbar kompakt, Hit-Area 44px
            className="-my-3 -mr-1.5 flex min-h-11 shrink-0 items-center px-2.5 text-[13px] font-semibold text-primary"
          >
            {toast.actionLabel}
          </button>
        )}
      </div>
      {/* Fortschrittslinie: läuft über die Anzeigedauer ab (bleibt in
          reduced-motion, weil sie Information trägt) */}
      <div
        className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-primary"
        style={{ animation: `gh-toast-bar ${dauer}ms linear forwards` }}
      />
    </div>
  );
}
