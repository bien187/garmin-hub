import { HypnogrammMini } from "./hypnogramm-mini";
import { PhasenBalken } from "./phasen-balken";
import { PHASEN_FARBE } from "./farben";
import { PHASEN, PHASEN_LABEL, type SchlafAnalyse } from "@/lib/engine/schlaf";
import type { SchlafEpoche } from "@/lib/engine/schlaf-parser";

/** Ein Wert der Zeile Schlaf-HF · HRV · Atmung */
function Wert({ label, wert, einheit }: { label: string; wert: string | null; einheit?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="stat-display text-[15px] whitespace-nowrap">
        {wert ?? <span className="text-dim-foreground">–</span>}
        {wert && einheit && <span className="ml-0.5 text-xs text-muted-foreground">{einheit}</span>}
      </div>
    </div>
  );
}

/**
 * Überblick einer Nacht (Dashboard und Kopf der Schlafseite, je unter dem
 * Score-Ring): Phasen-Zeitleiste, Phasenanteile als Balken, Tief · Leicht ·
 * REM · Wach in Minuten und Prozent, dazu Schlaf-HF, HRV und Atmung.
 * Server- und client-tauglich.
 */
export function NachtUeberblick({ epochen, analyse }: { epochen: SchlafEpoche[]; analyse: SchlafAnalyse }) {
  const a = analyse;
  const z = a.zusammenfassung;
  return (
    <div className="space-y-4">
      {/* Verlauf der Nacht: Phasen-Zeitleiste und Anteile */}
      <div className="space-y-2">
        <HypnogrammMini epochen={epochen} startMs={z.startMs} endeMs={z.endeMs} className="h-12 w-full" />
        <PhasenBalken phasen={a.phasen} legende={false} />
      </div>

      <dl className="grid grid-cols-4 gap-2">
        {PHASEN.map((p) => (
          <div key={p} className="min-w-0">
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="size-1.5 shrink-0 rounded-full" style={{ background: PHASEN_FARBE[p] }} />
              {PHASEN_LABEL[p]}
            </dt>
            <dd className="stat-display mt-0.5 text-[15px] whitespace-nowrap">
              {a.phasen[p].minuten != null ? (
                <>
                  {a.phasen[p].minuten}
                  <span className="ml-0.5 text-xs text-muted-foreground">min</span>
                </>
              ) : (
                <span className="text-dim-foreground">–</span>
              )}
            </dd>
            <dd className="text-xs text-dim-foreground tabular-nums">
              {a.phasen[p].prozent != null ? `${Math.round(a.phasen[p].prozent!)} %` : "–"}
            </dd>
          </div>
        ))}
      </dl>

      <div className="grid grid-cols-3 gap-2 border-t border-border pt-3">
        <Wert label="Schlaf-HF Ø" wert={a.hr ? String(Math.round(a.hr.mittel)) : null} einheit="bpm" />
        <Wert label="HRV Nacht" wert={a.hrv ? String(Math.round(a.hrv.mittel)) : null} einheit="ms" />
        <Wert label="Atmung Ø" wert={a.atem ? a.atem.mittel.toFixed(1) : null} einheit="/min" />
      </div>
    </div>
  );
}
