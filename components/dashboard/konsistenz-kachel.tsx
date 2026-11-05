import { Flame } from "lucide-react";
import { formatDatum } from "@/lib/format";
import type { Konsistenz } from "@/lib/engine/konsistenz";
import { cn } from "@/lib/utils";

const zahl = (h: number) => h.toFixed(1);

/**
 * Trainingsstunden der letzten 12 Wochen als Säulen, Budget gestrichelt.
 * Ohne Datenzugriff, server- und client-tauglich.
 */
export function KonsistenzKachel({ k }: { k: Konsistenz }) {
  const aktuell = k.wochen.at(-1);
  const budget = k.budgetH != null && k.budgetH > 0 ? k.budgetH : null;
  // Skala: Budget oder längste Woche, mit etwas Luft nach oben
  const max = Math.max(budget ?? 0, ...k.wochen.map((w) => w.stunden)) * 1.08 || 1;
  const prozent = (h: number) => `${Math.min(100, (h / max) * 100)}%`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-x-2 gap-y-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
            Diese Woche
          </div>
          <div className="flex items-baseline gap-2">
            <span className="stat-display text-4xl leading-none">
              {zahl(aktuell?.stunden ?? 0)} h
            </span>
            {budget != null && (
              <span className="stat-display text-lg text-muted-foreground">von {zahl(budget)} h</span>
            )}
          </div>
        </div>
        {k.serie > 0 && (
          <span className="flex items-center gap-1 whitespace-nowrap rounded-full bg-primary/15 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.06em] text-primary">
            <Flame className="size-3" />
            {k.serie === 1 ? "1 Woche" : `${k.serie} Wochen`} in Folge
          </span>
        )}
      </div>

      <div className="relative h-36">
        {budget != null && (
          <div
            className="absolute inset-x-0 border-t border-dashed border-muted-foreground/50"
            style={{ bottom: prozent(budget) }}
            aria-hidden
          />
        )}
        <div className="flex h-full items-end gap-1.5">
          {k.wochen.map((w, i) => {
            const istAktuell = i === k.wochen.length - 1;
            return (
              <div
                key={w.woche}
                title={`Woche ab ${formatDatum(w.woche)}: ${zahl(w.stunden)} h`}
                aria-label={`Woche ab ${formatDatum(w.woche)}: ${zahl(w.stunden)} Stunden`}
                className={cn(
                  "flex-1 rounded-t-lg",
                  w.stunden > 0
                    ? istAktuell
                      ? "bg-primary"
                      : "bg-primary/40"
                    : "rounded-t-sm bg-muted"
                )}
                style={{ height: w.stunden > 0 ? `max(${prozent(w.stunden)}, 6px)` : "4px" }}
              />
            );
          })}
        </div>
      </div>

      <div className="flex justify-between gap-2 text-xs text-muted-foreground">
        <span>{k.wochen[0] ? formatDatum(k.wochen[0].woche) : ""}</span>
        {budget != null && <span>gestrichelt = Budget</span>}
        <span>diese Woche</span>
      </div>
    </div>
  );
}
