"use client";

import { useState } from "react";
import { Abschnitt } from "@/components/ui/kachel";
import { FortschrittChart } from "@/components/dashboard/fortschritt-chart";
import { FitnessChart, type FitnessPunkt } from "@/components/dashboard/fitness-chart";
import { AerobChart } from "@/components/dashboard/aerob-chart";
import { KonsistenzKachel } from "@/components/dashboard/konsistenz-kachel";
import type { VerlaufWoche } from "@/lib/engine/wochenstatistik";
import type { Konsistenz } from "@/lib/engine/konsistenz";
import type { AerobeLeistung } from "@/lib/engine/aerobe-leistung";
import { cn } from "@/lib/utils";

type Ansicht = "fortschritt" | "form" | "aerob" | "konsistenz";

/**
 * Längerfristige Entwicklung in einem Bereich: eine Ansicht zur Zeit statt
 * vier Diagrammkarten untereinander. Alle bisherigen Auswertungen bleiben.
 */
export function TrendBereich({
  verlauf,
  fitness,
  acwrHeute,
  aerob,
  heute,
  konsistenz,
}: {
  verlauf: VerlaufWoche[];
  fitness: FitnessPunkt[];
  acwrHeute: number | null;
  /** Aerobic Performance; null = nicht verfügbar */
  aerob: AerobeLeistung | null;
  heute: string;
  konsistenz?: Konsistenz;
}) {
  const [ansicht, setAnsicht] = useState<Ansicht>("fortschritt");
  const ansichten: { id: Ansicht; label: string }[] = [
    { id: "fortschritt", label: "Fortschritt" },
    { id: "form", label: "Form" },
    { id: "aerob", label: "Aerobic Performance" },
    ...(konsistenz ? [{ id: "konsistenz" as const, label: "Konsistenz" }] : []),
  ];

  return (
    <Abschnitt titel="Entwicklung">
      <div role="tablist" aria-label="Ansicht" className="-mt-1 mb-4 flex gap-5 overflow-x-auto border-b border-border">
        {ansichten.map((a) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            aria-selected={ansicht === a.id}
            onClick={() => setAnsicht(a.id)}
            className={cn(
              "-mb-px min-h-10 shrink-0 border-b-2 text-[13px] transition-colors",
              ansicht === a.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {a.label}
          </button>
        ))}
      </div>

      {ansicht === "fortschritt" && <FortschrittChart verlauf={verlauf} />}

      {ansicht === "form" && <FitnessChart daten={fitness} acwr={acwrHeute} />}

      {ansicht === "aerob" &&
        (aerob ? (
          <AerobChart daten={aerob} heute={heute} />
        ) : (
          <p className="text-sm text-muted-foreground">Aerobic Performance ist nicht verfügbar.</p>
        ))}

      {ansicht === "konsistenz" && konsistenz && <KonsistenzKachel k={konsistenz} />}
    </Abschnitt>
  );
}
