"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Reorder } from "framer-motion";
import { Check, GripVertical, LayoutGrid, RotateCcw } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export interface DashboardKachel {
  /** stabile ID — sie landet in der gespeicherten Reihenfolge */
  id: string;
  /** Klartextname, den man im Bearbeiten-Modus anfasst */
  titel: string;
  /** Spaltenbreite im Raster (lg) */
  span: 1 | 2 | 3;
  inhalt: ReactNode;
}

const SPAN_KLASSE: Record<number, string> = {
  1: "",
  2: "lg:col-span-2",
  3: "lg:col-span-3",
};

/**
 * Sortiert die Kacheln nach gespeicherter Reihenfolge. Unbekannte IDs aus
 * der Reihenfolge werden ignoriert, neu hinzugekommene Kacheln hängen
 * hinten an — sonst würde eine neue Kachel nach einem Update unsichtbar.
 */
function sortiere(kacheln: DashboardKachel[], reihenfolge: string[]): string[] {
  const vorhanden = new Set(kacheln.map((k) => k.id));
  const ausOrdnung = reihenfolge.filter((id) => vorhanden.has(id));
  const rest = kacheln.map((k) => k.id).filter((id) => !ausOrdnung.includes(id));
  return [...ausOrdnung, ...rest];
}

export function DashboardGrid({
  kacheln,
  reihenfolge,
}: {
  kacheln: DashboardKachel[];
  reihenfolge: string[];
}) {
  const toast = useToast();
  const [ordnung, setOrdnung] = useState<string[]>(() =>
    sortiere(kacheln, reihenfolge)
  );
  const [bearbeiten, setBearbeiten] = useState(false);
  const [speichert, setSpeichert] = useState(false);

  const proId = useMemo(
    () => new Map(kacheln.map((k) => [k.id, k])),
    [kacheln]
  );

  async function speichern(neu: string[]) {
    setSpeichert(true);
    try {
      const res = await fetch("/api/dashboard-layout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reihenfolge: neu }),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast({ message: "Anordnung konnte nicht gespeichert werden.", variant: "error" });
    } finally {
      setSpeichert(false);
    }
  }

  async function fertig() {
    setBearbeiten(false);
    await speichern(ordnung);
  }

  async function zuruecksetzen() {
    const standard = kacheln.map((k) => k.id);
    setOrdnung(standard);
    await speichern([]);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-2">
        {bearbeiten && (
          <button
            onClick={zuruecksetzen}
            className="flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs text-muted-foreground"
          >
            <RotateCcw className="size-3.5" />
            Standard
          </button>
        )}
        <button
          onClick={() => (bearbeiten ? fertig() : setBearbeiten(true))}
          disabled={speichert}
          aria-pressed={bearbeiten}
          className={cn(
            "flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs",
            bearbeiten ? "bg-primary text-primary-foreground font-semibold" : "bg-muted"
          )}
        >
          {bearbeiten ? <Check className="size-3.5" /> : <LayoutGrid className="size-3.5" />}
          {bearbeiten ? "Fertig" : "Anordnen"}
        </button>
      </div>

      {bearbeiten ? (
        <>
          <p className="text-xs text-muted-foreground">
            Kacheln am Griff ziehen, um die Reihenfolge zu ändern. Die
            Anordnung gilt auf allen Geräten.
          </p>
          <Reorder.Group
            axis="y"
            as="div"
            values={ordnung}
            onReorder={setOrdnung}
            className="space-y-2"
          >
            {ordnung.map((id) => {
              const k = proId.get(id);
              if (!k) return null;
              return (
                <Reorder.Item
                  key={id}
                  value={id}
                  as="div"
                  className="flex touch-none items-center gap-3 rounded-xl border border-border bg-card px-3 py-3.5 active:border-primary"
                >
                  <GripVertical className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {k.titel}
                  </span>
                  <span className="stat-mono shrink-0 text-[10px] text-dim-foreground">
                    {k.span === 3 ? "breit" : k.span === 2 ? "mittel" : "schmal"}
                  </span>
                </Reorder.Item>
              );
            })}
          </Reorder.Group>
        </>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {ordnung.map((id) => {
            const k = proId.get(id);
            if (!k) return null;
            return (
              <div key={id} className={SPAN_KLASSE[k.span]}>
                {k.inhalt}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
