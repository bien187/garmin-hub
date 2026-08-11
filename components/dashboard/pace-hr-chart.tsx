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
import { formatDatum } from "@/lib/format";

export interface PaceWochePunkt {
  /** Montag der Woche (ISO) */
  woche: string;
  /** Median-Pace bei Referenzpuls in s/km */
  paceSKm: number;
}

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
  if (wochen.length < 2) {
    return (
      <div className="flex h-44 items-center justify-center px-4 text-center text-sm text-muted-foreground">
        Noch zu wenig Daten. Es braucht Läufe mit mindestens fünf Minuten
        rund um {refHr ?? "den Referenz"}-bpm — nach zwei bis drei Wochen
        steht die Kurve.
      </div>
    );
  }

  const werte = wochen.map((w) => w.paceSKm);
  const min = Math.min(...werte);
  const max = Math.max(...werte);
  const luft = Math.max(12, (max - min) * 0.3);

  const ersteWoche = wochen[0];
  const letzteWoche = wochen[wochen.length - 1];
  // Negativ = weniger Sekunden pro Kilometer = schneller
  const diff = letzteWoche.paceSKm - ersteWoche.paceSKm;

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="stat-display text-2xl">{paceKurz(letzteWoche.paceSKm)}</span>
        <span className="text-xs text-muted-foreground">min/km</span>
        {Math.abs(diff) >= 2 && (
          <span
            className={`text-[11px] font-medium ${diff < 0 ? "text-status-green" : "text-status-orange"}`}
          >
            {diff < 0 ? "−" : "+"}
            {paceKurz(Math.abs(diff))} seit {formatDatum(ersteWoche.woche)}
          </span>
        )}
      </div>

      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={wochen} margin={{ top: 4, right: 8, bottom: 0, left: -6 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="woche"
              tickFormatter={formatDatum}
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              interval="preserveStartEnd"
              minTickGap={28}
            />
            {/* reversed: schneller (weniger s/km) liegt oben — eine
                steigende Linie heisst damit tatsächlich „schneller" */}
            <YAxis
              reversed
              domain={[min - luft, max + luft]}
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
              labelFormatter={(l) => `Woche ab ${formatDatum(String(l))}`}
              formatter={(value) => [`${paceKurz(Number(value))} /km`, "Median-Pace"]}
            />
            <Line
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
