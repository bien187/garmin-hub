"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Bottom-Sheet-Grundgerüst (§6 Nr. 9): Backdrop 0→0.55, Sheet translateY
 * 100%→0, Wisch-nach-unten schliesst (Drag folgt, Schwelle 30 %).
 * Das eine Bestätigungsmuster app-weit — auch als Shell für eigene Inhalte
 * (z.B. Plan-Vorschau) nutzbar.
 */
export function SheetShell({
  open,
  onClose,
  children,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  labelledBy?: string;
}) {
  const [sichtbar, setSichtbar] = useState(false);
  const [dragY, setDragY] = useState(0);
  const sheetRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<number | null>(null);

  // Mount/Unmount mit Schliess-Animation entkoppeln
  useEffect(() => {
    if (open) setSichtbar(true);
  }, [open]);

  const schliessen = useCallback(() => {
    const h = sheetRef.current?.offsetHeight ?? 400;
    setDragY(h);
    window.setTimeout(() => {
      setSichtbar(false);
      setDragY(0);
      onClose();
    }, 240);
  }, [onClose]);

  useEffect(() => {
    if (!sichtbar) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") schliessen();
    };
    window.addEventListener("keydown", onKey);
    // Body-Scroll sperren, solange offen
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [sichtbar, schliessen]);

  if (!sichtbar) return null;

  const onPointerDown = (e: React.PointerEvent) => {
    startRef.current = e.clientY;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (startRef.current == null) return;
    const dy = e.clientY - startRef.current;
    setDragY(Math.max(0, dy));
  };
  const onPointerUp = () => {
    if (startRef.current == null) return;
    const h = sheetRef.current?.offsetHeight ?? 400;
    if (dragY > h * 0.3) schliessen();
    else setDragY(0);
    startRef.current = null;
  };

  const geschlossen = dragY > 0;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black"
        style={{
          opacity: geschlossen ? 0.55 * (1 - dragY / 500) : 0.55,
          animation: geschlossen ? undefined : "gh-dim var(--dur-sheet) var(--ease-sheet) both",
          transition: startRef.current == null ? "opacity 240ms var(--ease-sheet)" : "none",
        }}
        onClick={schliessen}
      />
      {/* Sheet */}
      <div
        ref={sheetRef}
        className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-border bg-card"
        style={{
          transform: `translateY(${dragY}px)`,
          animation: geschlossen ? undefined : "gh-sheet-in var(--dur-sheet) var(--ease-sheet) both",
          transition: startRef.current == null ? "transform 240ms var(--ease-sheet)" : "none",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 10px)",
        }}
      >
        {/* Grabber */}
        <div
          className="flex touch-none justify-center pt-2.5 pb-1"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <div className="h-1 w-9 rounded-full bg-border" />
        </div>
        {children}
      </div>
    </div>
  );
}

/** Bestätigungs-Sheet (Löschen etc.) auf Basis von SheetShell. */
export function ConfirmSheet({
  open,
  onClose,
  title,
  description,
  cancelLabel = "Abbrechen",
  confirmLabel,
  danger = false,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  cancelLabel?: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
}) {
  return (
    <SheetShell open={open} onClose={onClose} labelledBy="confirm-title">
      <div className="px-5 pt-1.5">
        <h2 id="confirm-title" className="text-base font-semibold">
          {title}
        </h2>
        {description && (
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
        <div className="mt-4 flex gap-2.5">
          <button
            onClick={onClose}
            className="min-h-11 flex-1 rounded-lg bg-muted text-sm font-medium"
          >
            {cancelLabel}
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={cn(
              "min-h-11 flex-1 rounded-lg text-sm font-semibold",
              danger
                ? "border border-status-red/50 bg-status-red/10 text-status-red"
                : "bg-primary text-primary-foreground"
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </SheetShell>
  );
}
