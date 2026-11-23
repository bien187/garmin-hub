import { cn } from "@/lib/utils";

/** Veränderung mit Vorzeichen, „±0.0 kg" bei < 50 g, „–" ohne Wert */
export function kgDelta(kg: number | null): string {
  if (kg == null) return "–";
  if (Math.abs(kg) < 0.05) return "±0.0 kg";
  return `${kg > 0 ? "+" : "−"}${Math.abs(kg).toFixed(1)} kg`;
}

/** Schlanke Trendlinie als SVG (ohne Chart-Bibliothek, ohne Füllung) */
export function MiniLinie({ werte, className }: { werte: number[]; className?: string }) {
  if (werte.length < 2) return null;
  const min = Math.min(...werte);
  const max = Math.max(...werte);
  const spanne = max - min || 1;
  const pkt = werte.map((w, i) => [(i / (werte.length - 1)) * 100, 28 - ((w - min) / spanne) * 24]);
  const d = pkt.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const [lx, ly] = pkt.at(-1)!;
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className={cn("overflow-visible", className)} aria-hidden>
      <path d={d} fill="none" stroke="var(--primary)" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r={3} fill="var(--primary)" stroke="var(--background)" strokeWidth={1.5} />
    </svg>
  );
}
