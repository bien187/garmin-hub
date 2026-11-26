import { Ring } from "@/components/ui/fortschritt";
import { schlafScoreStufe, type ScoreStufe } from "@/lib/engine/schlaf";
import { cn } from "@/lib/utils";

const FARBE: Record<ScoreStufe["ampel"], string> = {
  gruen: "var(--status-green)",
  gelb: "var(--status-yellow)",
  rot: "var(--status-red)",
};

const TEXT: Record<ScoreStufe["ampel"], string> = {
  gruen: "text-status-green",
  gelb: "text-status-yellow",
  rot: "text-status-red",
};

/**
 * Garmin Sleep Score als schlanker Ring (0–100): Zahl in der Mitte,
 * Bewertung darunter, Bogen in der Statusfarbe. Ohne Score nur die Spur.
 */
export function ScoreRing({ score, groesse = 96, className }: { score: number | null; groesse?: number; className?: string }) {
  const stufe = schlafScoreStufe(score);
  const wert = score != null ? Math.round(score) : null;
  return (
    <Ring
      wert={wert ?? 0}
      max={100}
      groesse={groesse}
      dicke={6}
      farbe={stufe ? FARBE[stufe.ampel] : undefined}
      className={className}
      label={wert != null && stufe ? `Garmin Sleep Score ${wert} von 100, ${stufe.label}` : "Garmin Sleep Score nicht verfügbar"}
    >
      <div className="text-center leading-none">
        <div className="stat-display text-[26px]">{wert ?? <span className="text-dim-foreground">–</span>}</div>
        <div className={cn("mt-1 text-[11px]", stufe ? TEXT[stufe.ampel] : "text-dim-foreground")}>{stufe?.label ?? "kein Score"}</div>
      </div>
    </Ring>
  );
}
