import { KLASSEN, type Klasse } from "@/lib/engine/gewicht";
import { cn } from "@/lib/utils";

/** Farbe je Vergleichbarkeitsklasse — für Badges, Diagrammpunkte und Legende */
export const KLASSEN_FARBE: Record<Klasse, string> = {
  sehr_gut: "#a4b99a",
  gut: "#8fa6c1",
  eingeschraenkt: "#d8c27a",
  gering: "#6e7a89",
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
      className={cn("inline-flex h-5 items-center gap-1.5 text-[12px] whitespace-nowrap", className)}
      style={{ color: farbe }}
      title={`${KLASSEN[klasse].label} (Messqualität ${score}/100)`}
    >
      <span className="size-1.5 rounded-full" style={{ background: farbe }} />
      <span className="stat-mono">{score}</span>
      {!kurz && <span className="font-medium">{KLASSEN_KURZ[klasse]}</span>}
    </span>
  );
}
