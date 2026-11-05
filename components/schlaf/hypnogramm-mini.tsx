import type { SchlafEpoche } from "@/lib/engine/schlaf-parser";
import { phasenSegmente, PHASEN, PHASEN_LABEL } from "@/lib/engine/schlaf";
import { PHASEN_FARBE, PHASEN_STUFE } from "./farben";

/**
 * Kompaktes Hypnogramm als SVG (server-tauglich): ein Block je Segment,
 * Tief unten, Wach oben. Breite skaliert mit dem Container.
 */
export function HypnogrammMini({
  epochen,
  startMs,
  endeMs,
  className,
}: {
  epochen: SchlafEpoche[];
  startMs: number | null;
  endeMs: number | null;
  className?: string;
}) {
  const seg = phasenSegmente(epochen);
  if (!seg.length) return null;
  const von = startMs ?? seg[0].startMs;
  const bis = endeMs ?? seg[seg.length - 1].endeMs;
  const spanne = Math.max(1, bis - von);
  const B = 300;
  const zeile = 10;
  const H = zeile * 4;
  return (
    <svg
      viewBox={`0 0 ${B} ${H}`}
      preserveAspectRatio="none"
      className={className}
      role="img"
      aria-label={`Hypnogramm: ${PHASEN.map((p) => PHASEN_LABEL[p]).join(", ")} über die Nacht`}
    >
      {[0, 1, 2, 3].map((i) => (
        <line key={i} x1={0} x2={B} y1={i * zeile + zeile / 2} y2={i * zeile + zeile / 2} stroke="var(--border)" strokeWidth={0.5} />
      ))}
      {seg.map((s, i) => {
        const x = ((s.startMs - von) / spanne) * B;
        const w = Math.max(0.6, ((s.endeMs - s.startMs) / spanne) * B);
        const y = (3 - PHASEN_STUFE[s.phase]) * zeile;
        return <rect key={i} x={x} y={y + 1} width={w} height={zeile - 2} rx={1} fill={PHASEN_FARBE[s.phase]} />;
      })}
    </svg>
  );
}
