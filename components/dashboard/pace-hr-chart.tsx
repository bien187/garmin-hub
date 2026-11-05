"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useMemo } from "react";
import { formatDatum } from "@/lib/format";
import {
  filtereZeitraum,
  verfuegbareZeitraeume,
  zeitachse,
} from "@/lib/engine/zeitachse";
import { ZeitraumUmschalter, useZeitraum } from "./zeitraum-umschalter";

import type { PaceWoche as PaceWochePunkt } from '@/lib/engine/fortschritt';

/** Pace ohne Einheit — die steht an der Achse bzw. im Titel */
function paceKurz(sProKm: number): string {
  const m = Math.floor(sProKm / 60);
  const s = Math.round(sProKm % 60);
  return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, "0")}`;
}

export function PaceHrChart({
  wochen,
  refHr,
}: {
  wochen: PaceWochePunkt[];
  refHr: number | null;
}) {
  const { zeitraum, setZeitraum } = useZeitraum();
  const verfuegbar = useMemo(
    () => verfuegbareZeitraeume(wochen[0]?.bis ?? null, wochen.at(-1)?.bis ?? null),
    [wochen]
  );
  const aktiv = verfuegbar.includes(zeitraum) ? zeitraum : "alles";
  // Eine Woche gehört zum Zeitraum, sobald ihr Ende (bis) darin liegt
  const sichtbar = useMemo(() => filtereZeitraum(wochen, (w) => w.bis, aktiv), [wochen, aktiv]);
  const achse = useMemo(() => zeitachse(sichtbar.map((w) => w.bis), formatDatum), [sichtbar]);

  const alleMessungen = wochen.filter((w) => w.paceSKm != null);
  const messungen = sichtbar.filter((w): w is PaceWochePunkt & {paceSKm:number} => w.paceSKm != null);
  if (alleMessungen.length === 0) {
    return (
      <div className="flex h-44 items-center justify-center px-4 text-center text-sm text-muted-foreground">
        Noch zu wenig Daten. Es braucht Läufe mit mindestens fünf Minuten
        rund um {refHr ?? "den Referenz"}-bpm — nach zwei bis drei Wochen
        steht die Kurve.
      </div>
    );
  }

  const werte = messungen.map((w) => w.paceSKm);
  const min = werte.length ? Math.min(...werte) : 0;
  const max = werte.length ? Math.max(...werte) : 0;
  const luft = Math.max(12, (max - min) * 0.3);

  const ersteWoche = messungen[0];
  const letzteWoche = messungen[messungen.length - 1];
  // Negativ = weniger Sekunden pro Kilometer = schneller
  const diff = ersteWoche && letzteWoche ? letzteWoche.paceSKm - ersteWoche.paceSKm : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {letzteWoche ? (
            <>
              <span className="stat-display text-2xl">{paceKurz(letzteWoche.paceSKm)}</span>
              <span className="text-xs text-muted-foreground">min/km</span>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">Keine Messung in diesem Zeitraum.</span>
          )}
          {ersteWoche && Math.abs(diff) >= 2 && (
            <span
              className={`text-[11px] font-medium ${diff < 0 ? "text-status-green" : "text-status-orange"}`}
            >
              {diff < 0 ? "−" : "+"}
              {paceKurz(Math.abs(diff))} seit {formatDatum(ersteWoche.woche)}
            </span>
          )}
        </div>
        <ZeitraumUmschalter wert={aktiv} verfuegbar={verfuegbar} onChange={setZeitraum} />
      </div>

      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={sichtbar} margin={{ top: 4, right: 8, bottom: 0, left: -6 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="bis"
              ticks={achse.ticks}
              tickFormatter={achse.format}
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              interval={achse.modus === "monat" ? "preserveStart" : "preserveStartEnd"}
              minTickGap={achse.modus === "monat" ? 6 : 28}
            />
            {/* reversed: schneller (weniger s/km) liegt oben — eine
                steigende Linie heisst damit tatsächlich „schneller" */}
            <YAxis
              reversed
              domain={werte.length ? [min - luft, max + luft] : ["auto", "auto"]}
              tickFormatter={(v: number) => paceKurz(v)}
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              width={44}
            />
            <Tooltip
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelFormatter={(l) => `Woche bis ${formatDatum(String(l))}`}
              formatter={(value) => [`${paceKurz(Number(value))} /km`, "Median-Pace"]}
            />
            <Line
              connectNulls={false}
              type="monotone"
              dataKey="paceSKm"
              stroke="var(--primary)"
              strokeWidth={2}
              dot={{ r: 3, fill: "var(--primary)", strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
