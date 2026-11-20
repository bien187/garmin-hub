import { ArrowRight, Scale } from "lucide-react";
import { AppLink as Link } from "@/components/basis-pfad";
import { Card } from "@/components/ui/card";
import { KachelKopf } from "@/components/ui/kachel";
import type { GewichtKurz } from "@/lib/server/gewicht-service";
import { relativerTag } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Veränderung mit Vorzeichen, „±0.0 kg" bei < 50 g */
export function kgDelta(kg: number | null): string {
  if (kg == null) return "–";
  if (Math.abs(kg) < 0.05) return "±0.0 kg";
  return `${kg > 0 ? "+" : "−"}${Math.abs(kg).toFixed(1)} kg`;
}

/** Mini-Trendlinie als SVG (ohne Chart-Bibliothek) */
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
      <defs>
        <linearGradient id="gewicht-mini" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L100 32 L0 32 Z`} fill="url(#gewicht-mini)" />
      <path d={d} fill="none" stroke="var(--primary)" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r={2.6} fill="var(--primary)" />
    </svg>
  );
}

/** Dashboard-Karte: aktuelles Gewicht, Trendveränderung, Mini-Trend, letzte Messung */
export function GewichtKarte({ g, heute }: { g: GewichtKurz | null; heute: string }) {
  return (
    <Link href="/body#gewicht" className="group block h-full rounded-xl focus-visible:outline-2 focus-visible:outline-ring">
      <Card className="gh-auf karte-hover h-full">
        <KachelKopf
          icon={Scale}
          ton="lime"
          titel="Gewicht"
          aktion={<ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />}
        />
        {g ? (
          <div className="space-y-3 px-(--card-spacing)">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="flex items-baseline gap-1">
                  <span className="stat-display text-[34px] leading-none">{g.aktuellKg.toFixed(1)}</span>
                  <span className="text-sm text-muted-foreground">kg</span>
                </div>
                <p className="mt-1 text-[11px] text-dim-foreground">
                  Letzte Messung: {relativerTag(g.datum, heute)},{" "}
                  {new Date(g.zeitpunkt).toLocaleTimeString("de-CH", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Europe/Zurich",
                  })}
                </p>
              </div>
              <MiniLinie werte={g.verlauf.map((p) => p.kg)} className="h-10 w-28" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-surface px-3 py-2">
                <div className="text-[10px] tracking-wide text-muted-foreground uppercase">Trend</div>
                <div className="stat-display text-base">{g.trendKg != null ? `${g.trendKg.toFixed(1)} kg` : "–"}</div>
              </div>
              <div className="rounded-xl bg-surface px-3 py-2">
                <div className="text-[10px] tracking-wide text-muted-foreground uppercase">30 Tage</div>
                <div className="stat-display text-base">{kgDelta(g.veraenderung30 ?? g.veraenderung7)}</div>
              </div>
            </div>
          </div>
        ) : (
          <p className="px-(--card-spacing) text-sm text-muted-foreground">
            Noch keine Wägung. Nach dem nächsten Sync erscheinen hier die Messungen deiner Waage.
          </p>
        )}
      </Card>
    </Link>
  );
}
