"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BESTEHEN_SCHNITT, EP_DISZIPLINEN, DisziplinId, berechneNote, notenFarbe } from "@/lib/ep/disziplinen";
import { EpPrognose } from "@/lib/ep/prognose";
import { formatDatum, formatNote, formatDauer } from "@/lib/format";
import { cn } from "@/lib/utils";

function wertLabel(id: DisziplinId, wert: number | null): string {
  if (wert == null) return "—";
  const d = EP_DISZIPLINEN[id];
  if (d.einheit === "sekunden" && id === "lastlauf") return formatDauer(wert);
  if (d.einheit === "sekunden") return `${Math.round(wert)} s`;
  return `${Math.floor(wert)}`;
}

/**
 * EP-Noten nach dem aktuellen Stand: je Disziplin der zuletzt erfasste Wert
 * (keine Prognose) als Notenbalken (1.0–5.0) mit Zielmarke,
 * Bestehens-Linie (3.60) und Klimmzug-Stolperkante.
 */
export function EpWidget({ prognose }: { prognose: EpPrognose }) {
  const reihenfolge: DisziplinId[] = [
    "lastlauf",
    "klimmzuege",
    "liegestuetze",
    "rumpf_seitlich",
    "rumpf_dorsal",
  ];

  const skala = (note: number) => ((note - 1) / 4) * 100; // 1.0 → 0 %, 5.0 → 100 %

  // Balken beim ersten Mount 0→x fahren (§6 Nr. 10); reduced-motion: sofort
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-dim-foreground">
            Gesamtschnitt{prognose.fehlendeDisziplinen.length > 0 ? ` · ${5 - prognose.fehlendeDisziplinen.length} von 5 Disziplinen` : ""}
          </div>
          <div
            className="stat-display text-[28px] leading-none"
            style={{ color: notenFarbe(prognose.schnitt) }}
          >
            {formatNote(prognose.schnitt)}
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <div>Ziel ≥ 4.5</div>
          <div>Bestehen: Schnitt ≥ {BESTEHEN_SCHNITT.toFixed(2)}</div>
          {prognose.ausschluss.length > 0 && (
            <div className="mt-1 font-medium text-status-red">
              1.0 in {prognose.ausschluss.length} Disziplin(en)!
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2.5">
        {reihenfolge.map((id, i) => {
          const d = EP_DISZIPLINEN[id];
          const p = prognose.disziplinen[id];
          const note = p.prognoseNote;
          const zielNote = berechneNote(id, d.ziel.von);
          return (
            <div key={id}>
              <div className="mb-0.5 flex items-baseline justify-between text-xs">
                <span className="font-medium">
                  {d.kurzname}
                  {p.datumLetzte && (
                    <span className="ml-1.5 font-normal text-dim-foreground">{formatDatum(p.datumLetzte)}</span>
                  )}
                </span>
                <span className="stat-mono text-muted-foreground">
                  {wertLabel(id, p.prognoseWert)}
                  <span
                    className="ml-2 font-semibold"
                    style={{ color: notenFarbe(note) }}
                  >
                    {formatNote(note)}
                  </span>
                </span>
              </div>
              <div className="relative h-2.5 overflow-hidden rounded-full bg-muted">
                {note != null && (
                  <div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{
                      width: `${mounted ? skala(note) : 0}%`,
                      background: notenFarbe(note),
                      transition: "width var(--dur-emphasis) var(--ease-emphasis)",
                      transitionDelay: `${i * 40}ms`,
                    }}
                  />
                )}
                {/* Bestehens-Linie: „genügend" ab 3.60 */}
                <div
                  className="absolute inset-y-0 w-px bg-foreground/50"
                  style={{ left: `${skala(BESTEHEN_SCHNITT)}%` }}
                  title={`Genügend ab ${BESTEHEN_SCHNITT.toFixed(2)}`}
                />
                {/* Zielmarke */}
                <div
                  className="absolute inset-y-0 w-0.5 bg-primary"
                  style={{ left: `${skala(zielNote)}%` }}
                  title={`Ziel: ${formatNote(zielNote)}`}
                />
                {/* Klimmzug-Stolperkante: 7 Wdh (3.9) → 8 Wdh (4.5) */}
                {d.stolperkante && (
                  <div
                    className={cn(
                      "absolute inset-y-0 border-x border-dashed border-status-orange/70"
                    )}
                    style={{
                      left: `${skala(berechneNote(id, d.stolperkante.nachWert))}%`,
                      width: `${skala(berechneNote(id, d.stolperkante.vonWert)) - skala(berechneNote(id, d.stolperkante.nachWert))}%`,
                    }}
                    title={d.stolperkante.hinweis}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Link
        href="/plan?tab=benchmarks"
        className="flex min-h-11 items-center text-sm text-primary underline-offset-2 hover:underline"
      >
        Einträge erfassen, anpassen oder löschen → Plan · Benchmarks
      </Link>
      {prognose.fehlendeDisziplinen.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {prognose.fehlendeDisziplinen.length} Disziplin(en) ohne Benchmark —{" "}
          <Link href="/plan?tab=benchmarks" className="text-primary underline-offset-2 hover:underline">
            im Plan-Tab erfassen
          </Link>
          .
        </p>
      )}
    </div>
  );
}
