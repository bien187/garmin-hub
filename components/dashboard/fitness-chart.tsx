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
import { formatDatum } from "@/lib/format";

export interface FitnessPunkt {
  datum: string;
  ctl: number;
  atl: number;
  tsb: number;
}

export function FitnessChart({ daten }: { daten: FitnessPunkt[] }) {
  if (daten.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        Noch keine Daten — zuerst synchronisieren.
      </div>
    );
  }
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={daten} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="datum"
            tickFormatter={formatDatum}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            interval="preserveStartEnd"
            minTickGap={40}
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
