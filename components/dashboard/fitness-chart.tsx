"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from "recharts";
import { useMemo } from "react";
import { formatDatum } from "@/lib/format";
import {
  filtereZeitraum,
  verfuegbareZeitraeume,
  zeitachse,
} from "@/lib/engine/zeitachse";
import { ZeitraumUmschalter, useZeitraum } from "./zeitraum-umschalter";

export interface FitnessPunkt {
  datum: string;
  ctl: number;
  atl: number;
  tsb: number;
}

/** CTL/ATL/TSB seit Trainingsstart; Zeitraum wird clientseitig gefiltert */
export function FitnessChart({ daten }: { daten: FitnessPunkt[] }) {
  const { zeitraum, setZeitraum } = useZeitraum();
  const verfuegbar = useMemo(
    () => verfuegbareZeitraeume(daten[0]?.datum ?? null, daten.at(-1)?.datum ?? null),
    [daten]
  );
  const aktiv = verfuegbar.includes(zeitraum) ? zeitraum : "alles";
  const sichtbar = useMemo(() => filtereZeitraum(daten, (p) => p.datum, aktiv), [daten, aktiv]);
  const achse = useMemo(() => zeitachse(sichtbar.map((p) => p.datum), formatDatum), [sichtbar]);

  if (daten.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        Noch keine Daten — zuerst synchronisieren.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <ZeitraumUmschalter wert={aktiv} verfuegbar={verfuegbar} onChange={setZeitraum} className="ml-auto" />
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={sichtbar} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="datum"
              ticks={achse.ticks}
              tickFormatter={achse.format}
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              interval={achse.modus === "monat" ? "preserveStart" : "preserveStartEnd"}
              minTickGap={achse.modus === "monat" ? 6 : 40}
            />
            <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
            <Tooltip
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelFormatter={(l) => formatDatum(String(l))}
              formatter={(value, name) => [
                Number(value).toFixed(1),
                name === "ctl" ? "Fitness (CTL)" : name === "atl" ? "Ermüdung (ATL)" : "Form (TSB)",
              ]}
            />
            <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="4 4" />
            <Area
              type="monotone"
              dataKey="ctl"
              stroke="var(--primary)"
              fill="var(--primary)"
              fillOpacity={0.12}
              strokeWidth={2}
            />
            <Line type="monotone" dataKey="atl" stroke="var(--chart-3)" dot={false} strokeWidth={1.5} />
            <Line type="monotone" dataKey="tsb" stroke="var(--chart-2)" dot={false} strokeWidth={2} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function MiniSparkline({
  daten,
  dataKey,
  farbe = "var(--primary)",
}: {
  daten: Record<string, unknown>[];
  dataKey: string;
  farbe?: string;
}) {
  return (
    <div className="h-10 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={daten} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={farbe}
            fill={farbe}
            fillOpacity={0.15}
            strokeWidth={1.5}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
