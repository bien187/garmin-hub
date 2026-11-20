"use client";

import { useState } from "react";
import { Abschnitt } from "@/components/ui/kachel";
import { FortschrittChart } from "@/components/dashboard/fortschritt-chart";
import { FitnessChart, type FitnessPunkt } from "@/components/dashboard/fitness-chart";
import { PaceHrChart } from "@/components/dashboard/pace-hr-chart";
import { KonsistenzKachel } from "@/components/dashboard/konsistenz-kachel";
import type { VerlaufWoche } from "@/lib/engine/wochenstatistik";
import type { Konsistenz } from "@/lib/engine/konsistenz";
import type { PaceWoche } from "@/lib/engine/fortschritt";
import { formatDatumLang } from "@/lib/format";
import { cn } from "@/lib/utils";

type Ansicht = "fortschritt" | "form" | "pace" | "konsistenz";

/**
 * Längerfristige Entwicklung in einem Bereich: eine Ansicht zur Zeit statt
 * vier Diagrammkarten untereinander. Alle bisherigen Auswertungen bleiben.
 */
export function TrendBereich({
  verlauf,
  fitness,
  tsbHeute,
  acwrHeute,
  paceWochen,
  refHr,
  letzteMessung,
  konsistenz,
}: {
  verlauf: VerlaufWoche[];
  fitness: FitnessPunkt[];
  tsbHeute: number | null;
  acwrHeute: number | null;
  paceWochen: PaceWoche[];
  refHr: number | null;
  letzteMessung: string | null;
  konsistenz?: Konsistenz;
}) {
  const [ansicht, setAnsicht] = useState<Ansicht>("fortschritt");
  const ansichten: { id: Ansicht; label: string }[] = [
    { id: "fortschritt", label: "Fortschritt" },
    { id: "form", label: "Form" },
    { id: "pace", label: "Pace bei Puls" },
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

      {ansicht === "form" && (
        <div className="space-y-2">
          <FitnessChart daten={fitness} />
          <p className="text-xs text-muted-foreground">
            {tsbHeute != null && `Form (TSB) heute ${tsbHeute > 0 ? "+" : ""}${tsbHeute}. `}
            {acwrHeute != null &&
              `ACWR ${acwrHeute.toFixed(2)} — ${
                acwrHeute > 1.5 ? "rote Zone, Verletzungsrisiko." : acwrHeute > 1.3 ? "erhöht, Umfang beobachten." : "im Sweet Spot (0.8–1.3)."
              }`}
          </p>
        </div>
      )}

      {ansicht === "pace" && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Median-Pace je Woche bei {refHr ?? "–"} bpm, höhenkorrigiert. Steigt die Linie, bist du bei gleichem Puls
            schneller — der verlässlichste Beleg, dass die Ausdauer wächst.
          </p>
          <PaceHrChart wochen={paceWochen} refHr={refHr} />
          {letzteMessung && <p className="text-xs text-dim-foreground">Letzte Messung: {formatDatumLang(letzteMessung)}</p>}
        </div>
      )}

      {ansicht === "konsistenz" && konsistenz && <KonsistenzKachel k={konsistenz} />}
    </Abschnitt>
  );
}
