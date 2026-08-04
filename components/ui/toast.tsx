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
        "pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg motion-safe:animate-in motion-safe:slide-in-from-bottom-4 motion-safe:zoom-in-95",
        toast.variant === "error"
          ? "border-status-red/40 bg-card text-foreground"
          : "border-border bg-card text-foreground"
      )}
    >
      <span className="min-w-0 flex-1">{toast.message}</span>
      {toast.actionLabel && (
        <button
          onClick={() => {
            toast.onAction?.();
            onClose();
          }}
          className="min-h-8 shrink-0 rounded-md px-2.5 font-semibold text-primary"
        >
          {toast.actionLabel}
        </button>
      )}
    </div>
  );
}
