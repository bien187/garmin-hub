import Link from "next/link";
import { EP_DISZIPLINEN, DisziplinId, berechneNote } from "@/lib/ep/disziplinen";
import { EpPrognose } from "@/lib/ep/prognose";
import { formatNote, formatDauer } from "@/lib/format";
import { cn } from "@/lib/utils";

function notenFarbe(note: number | null): string {
  if (note == null) return "var(--muted-foreground)";
  if (note >= 4.5) return "var(--status-green)";
  if (note >= 4.0) return "var(--status-yellow)";
  if (note > 1.0) return "var(--status-orange)";
  return "var(--status-red)";
}

function wertLabel(id: DisziplinId, wert: number | null): string {
  if (wert == null) return "—";
  const d = EP_DISZIPLINEN[id];
  if (d.einheit === "sekunden" && id === "lastlauf") return formatDauer(wert);
  if (d.einheit === "sekunden") return `${Math.round(wert)} s`;
  return `${Math.floor(wert)}`;
}

/**
 * EP-Prognose: 5 Disziplinen als horizontale Notenbalken (1.0–5.0) mit
 * Zielmarke, Note-4.0-Linie und Klimmzug-Stolperkante.
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

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Prognose Gesamtschnitt
          </div>
          <div
            className="stat-display text-5xl leading-none"
            style={{ color: notenFarbe(prognose.schnitt) }}
          >
            {formatNote(prognose.schnitt)}
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <div>Ziel ≥ 4.5</div>
          <div>Bestehen ≥ 4.0</div>
          {prognose.ausschluss.length > 0 && (
            <div className="mt-1 font-medium text-status-red">
              1.0 in {prognose.ausschluss.length} Disziplin(en)!
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2.5">
        {reihenfolge.map((id) => {
          const d = EP_DISZIPLINEN[id];
          const p = prognose.disziplinen[id];
          const note = p.prognoseNote;
          const zielNote = berechneNote(id, d.ziel.von);
          return (
            <div key={id}>
              <div className="mb-0.5 flex items-baseline justify-between text-xs">
                <span className="font-medium">{d.kurzname}</span>
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
                    className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                    style={{ width: `${skala(note)}%`, background: notenFarbe(note) }}
                  />
                )}
                {/* Note-4.0-Linie */}
                <div
                  className="absolute inset-y-0 w-px bg-foreground/50"
                  style={{ left: `${skala(4.0)}%` }}
                  title="Note 4.0"
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

      {prognose.fehlendeDisziplinen.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {prognose.fehlendeDisziplinen.length} Disziplin(en) ohne Benchmark —{" "}
          <Link href="/plan" className="text-primary underline-offset-2 hover:underline">
            im Plan-Tab erfassen
          </Link>
          .
        </p>
      )}
    </div>
  );
}
