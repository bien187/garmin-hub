"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { VerlaufWoche } from "@/lib/engine/wochenstatistik";
import { formatDatum, formatPaceKurz } from "@/lib/format";
import { cn } from "@/lib/utils";

type Metrik = "laufKm" | "laufMin" | "laufPaceSKm" | "avgHr" | "stunden";

const METRIKEN: { id: Metrik; label: string; einheit: string; art: "balken" | "linie"; besserNiedrig?: boolean }[] = [
  { id: "laufKm", label: "Distanz", einheit: "km", art: "balken" },
  { id: "laufMin", label: "Laufzeit", einheit: "Min", art: "balken" },
  { id: "laufPaceSKm", label: "Pace", einheit: "/km", art: "linie", besserNiedrig: true },
  { id: "avgHr", label: "Puls", einheit: "bpm", art: "linie" },
  { id: "stunden", label: "Umfang", einheit: "h", art: "balken" },
];

const format = (m: Metrik, v: number | null): string => {
  if (v == null) return "–";
  if (m === "laufPaceSKm") return formatPaceKurz(v);
  if (m === "laufKm" || m === "stunden") return v.toLocaleString("de-CH", { maximumFractionDigits: 1 });
  return String(Math.round(v));
};

const mittel = (w: (number | null)[]) => {
  const x = w.filter((v): v is number => v != null && v > 0);
  return x.length ? x.reduce((a, b) => a + b, 0) / x.length : null;
};

/**
 * Entwicklung der letzten 12 Wochen (aus echten Aktivitäten). Wochen ohne
 * Wert bleiben leer — keine geschätzten Punkte. Die laufende Woche ist
 * hervorgehoben und unvollständig.
 */
export function FortschrittChart({ verlauf }: { verlauf: VerlaufWoche[] }) {
  const [metrik, setMetrik] = useState<Metrik>("laufKm");
  const def = METRIKEN.find((m) => m.id === metrik)!;
  const daten = useMemo(() => verlauf.map((w) => ({ ...w, wert: w[metrik] && w[metrik]! > 0 ? w[metrik] : null })), [verlauf, metrik]);

  // Vergleich: Ø der letzten 4 abgeschlossenen Wochen vs. die 4 davor
  const abgeschlossen = daten.slice(0, -1);
  const jetzt = mittel(abgeschlossen.slice(-4).map((d) => d.wert));
  const vorher = mittel(abgeschlossen.slice(-8, -4).map((d) => d.wert));
  const diffProz = jetzt != null && vorher != null && vorher > 0 ? ((jetzt - vorher) / vorher) * 100 : null;
  const gut = diffProz == null ? null : def.besserNiedrig ? diffProz < 0 : diffProz > 0;
  const hatDaten = daten.some((d) => d.wert != null);

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Kennzahl" className="flex flex-wrap gap-1.5">
        {METRIKEN.map((m) => (
          <button
            key={m.id}
            type="button"
            aria-pressed={metrik === m.id}
            onClick={() => setMetrik(m.id)}
            className={cn(
              "min-h-9 rounded-full px-3.5 text-[13px] font-medium transition-colors",
              metrik === m.id ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground hover:text-foreground"
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-x-5 gap-y-1">
        <div>
          <div className="text-[11px] text-muted-foreground">Ø letzte 4 Wochen</div>
          <div className="flex items-baseline gap-1">
            <span className="stat-display text-[28px] leading-none">{format(metrik, jetzt)}</span>
            <span className="text-sm text-muted-foreground">{def.einheit}</span>
          </div>
        </div>
        {diffProz != null && Math.abs(diffProz) >= 1 && (
          <span
            className={cn(
              "mb-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold",
              gut ? "bg-primary/12 text-primary" : "bg-coral/14 text-coral"
            )}
          >
            {diffProz > 0 ? "+" : "−"}
            {Math.abs(diffProz).toFixed(0)} % ggü. den 4 Wochen davor
          </span>
        )}
      </div>

      <div className="h-52 w-full">
        {!hatDaten ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Noch keine Werte für diese Kennzahl.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {def.art === "balken" ? (
              <BarChart data={daten} margin={{ top: 6, right: 4, bottom: 0, left: -22 }} barCategoryGap="22%">
                <defs>
                  <linearGradient id="fortschritt-lime" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#c9f78a" />
                    <stop offset="100%" stopColor="#95d94a" />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="woche"
                  tickFormatter={(w: string) => formatDatum(w)}
                  tick={{ fontSize: 10, fill: "var(--dim-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                  minTickGap={18}
                />
                <YAxis tick={{ fontSize: 10, fill: "var(--dim-foreground)" }} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: "rgb(255 255 255 / 4%)" }}
                  contentStyle={TOOLTIP}
                  labelFormatter={(w) => `Woche ab ${formatDatum(String(w))}`}
                  formatter={(v) => [`${format(metrik, Number(v))} ${def.einheit}`, def.label]}
                />
                <Bar dataKey="wert" radius={[8, 8, 3, 3]} animationDuration={500}>
                  {daten.map((d, i) => (
                    <Cell key={d.woche} fill={i === daten.length - 1 ? "url(#fortschritt-lime)" : "rgb(184 243 107 / 38%)"} />
                  ))}
                </Bar>
              </BarChart>
            ) : (
              <LineChart data={daten} margin={{ top: 8, right: 8, bottom: 0, left: -14 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="woche"
                  tickFormatter={(w: string) => formatDatum(w)}
                  tick={{ fontSize: 10, fill: "var(--dim-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                  minTickGap={18}
                />
                <YAxis
                  reversed={def.besserNiedrig}
                  domain={["dataMin - 8", "dataMax + 8"]}
                  tickFormatter={(v: number) => format(metrik, v)}
                  tick={{ fontSize: 10, fill: "var(--dim-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  width={46}
                />
                <Tooltip
                  contentStyle={TOOLTIP}
                  labelFormatter={(w) => `Woche ab ${formatDatum(String(w))}`}
                  formatter={(v) => [`${format(metrik, Number(v))} ${def.einheit}`, def.label]}
                />
                <Line
                  type="monotone"
                  dataKey="wert"
                  stroke={metrik === "avgHr" ? "var(--coral)" : "var(--primary)"}
                  strokeWidth={2.5}
                  connectNulls={false}
                  dot={{ r: 3.5, strokeWidth: 0, fill: metrik === "avgHr" ? "var(--coral)" : "var(--primary)" }}
                  activeDot={{ r: 6 }}
                  animationDuration={500}
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
      {def.besserNiedrig && (
        <p className="text-[11px] text-dim-foreground">Achse umgedreht: oben = schneller. Ø Pace aller Läufe der Woche.</p>
      )}
    </div>
  );
}

export const TOOLTIP: React.CSSProperties = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  fontSize: 12,
  boxShadow: "0 12px 30px -12px rgb(0 0 0 / 60%)",
};
