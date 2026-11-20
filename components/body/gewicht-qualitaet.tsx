import { KLASSEN, type Klasse } from "@/lib/engine/gewicht";
import { cn } from "@/lib/utils";

/** Farbe je Vergleichbarkeitsklasse — für Badges, Diagrammpunkte und Legende */
export const KLASSEN_FARBE: Record<Klasse, string> = {
  sehr_gut: "#b8f36b",
  gut: "#7fc3a0",
  eingeschraenkt: "#f4d35e",
  gering: "#6b788d",
};

const KLASSEN_KURZ: Record<Klasse, string> = {
  sehr_gut: "sehr gut",
  gut: "gut",
  eingeschraenkt: "eingeschränkt",
  gering: "gering",
};

/** Badge „82 · gut vergleichbar" mit Klassenfarbe */
export function QualitaetsBadge({
  klasse,
  score,
  kurz = false,
  className,
}: {
  klasse: Klasse;
  score: number;
  kurz?: boolean;
  className?: string;
}) {
  const farbe = KLASSEN_FARBE[klasse];
  return (
    <span
      className={cn("inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold whitespace-nowrap", className)}
      style={{ background: `${farbe}22`, color: farbe }}
      title={`${KLASSEN[klasse].label} (Messqualität ${score}/100)`}
    >
      <span className="size-1.5 rounded-full" style={{ background: farbe }} />
      <span className="stat-mono">{score}</span>
      {!kurz && <span className="font-medium">{KLASSEN_KURZ[klasse]}</span>}
    </span>
  );
}
