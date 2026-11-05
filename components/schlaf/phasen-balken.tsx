import { PHASEN, PHASEN_LABEL, type PhasenAnteil, type PhasenName } from "@/lib/engine/schlaf";
import { PHASEN_FARBE } from "./farben";

/** Gestapelter Balken der Phasenminuten mit Legende (Minuten + %) */
export function PhasenBalken({
  phasen,
  legende = true,
}: {
  phasen: Record<PhasenName, PhasenAnteil>;
  legende?: boolean;
}) {
  const summe = PHASEN.reduce((a, p) => a + (phasen[p].minuten ?? 0), 0);
  if (summe <= 0) return <p className="text-xs text-muted-foreground">Keine Phasendaten für diese Nacht.</p>;
  return (
    <div className="space-y-2">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
        {PHASEN.map((p) =>
          phasen[p].minuten ? (
            <div key={p} style={{ width: `${((phasen[p].minuten ?? 0) / summe) * 100}%`, background: PHASEN_FARBE[p] }} />
          ) : null
        )}
      </div>
      {legende && (
        <div className="grid grid-cols-4 gap-1 text-[10px] text-muted-foreground">
          {PHASEN.map((p) => (
            <div key={p} className="min-w-0">
              <div className="flex items-center gap-1">
                <span className="size-2 shrink-0 rounded-full" style={{ background: PHASEN_FARBE[p] }} />
                <span className="truncate">{PHASEN_LABEL[p]}</span>
              </div>
              <div className="stat-mono whitespace-nowrap text-[11px] text-foreground">
                {phasen[p].minuten != null ? `${phasen[p].minuten} min` : "–"}
              </div>
              <div className="stat-mono whitespace-nowrap text-[10px] text-muted-foreground">
                {phasen[p].prozent != null ? `${Math.round(phasen[p].prozent!)} %` : "–"}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
