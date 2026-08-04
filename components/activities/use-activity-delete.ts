"use client";

import { useCallback } from "react";
import { useToast } from "@/components/ui/toast";

interface DeleteHandlers {
  /** UI sofort aktualisieren (optimistisch entfernen) */
  onRemoved?: () => void;
  /** UI-Zustand zurücksetzen (Rollback / Undo) */
  onRestore?: () => void;
}

/**
 * Aktivität löschen mit optimistischem Entfernen, 6-s-Undo-Toast und
 * Rollback bei Serverfehler. Löschen ist lokal (Soft-Delete); Garmin bleibt
 * unberührt.
 */
export function useActivityDelete() {
  const toast = useToast();

  return useCallback(
    async (id: number, { onRemoved, onRestore }: DeleteHandlers = {}) => {
      onRemoved?.();
      const res = await fetch(`/api/activities/${id}`, { method: "DELETE" }).catch(
        () => null
      );
      if (!res || !res.ok) {
        onRestore?.();
        toast({
          message: "Löschen fehlgeschlagen. Bitte erneut versuchen.",
          variant: "error",
        });
        return false;
      }
      toast({
        message: "Aktivität aus dem Hub entfernt.",
        actionLabel: "Rückgängig",
        onAction: async () => {
          const r = await fetch(`/api/activities/${id}/restore`, {
            method: "POST",
          }).catch(() => null);
          if (r && r.ok) onRestore?.();
          else
            toast({
              message: "Wiederherstellen fehlgeschlagen.",
              variant: "error",
            });
        },
      });
      return true;
    },
    [toast]
  );
}
