"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatPace } from "@/lib/format";
import type { FlyoverStreams } from "./flyover-map";

interface ElevationChartProps {
  streams: FlyoverStreams;
  onHover?: (fortschritt: number | null) => void;
}

export function ElevationChart({ streams, onHover }: ElevationChartProps) {
  const daten = useMemo(() => {
    const out: { distKm: number; ele: number; hr: number | null; pace: number | null }[] = [];
    let letzteEle = 0;
    // Einzelne Reihen können fehlen (Indoor ohne GPS/Höhe) — dann steht in
    // der Spalte JSON-null statt eines Arrays
    const n = streams.zeitS?.length ?? 0;
    if (!n || !streams.distanzM) return out;
    const schritt = Math.max(1, Math.floor(n / 400));
    for (let i = 0; i < n; i += schritt) {
      const d = streams.distanzM[i];
      if (d == null) continue;
      letzteEle = streams.ele?.[i] ?? letzteEle;
      out.push({
        distKm: d / 1000,
        ele: Math.round(letzteEle),
        hr: streams.hr?.[i] ?? null,
        pace: streams.paceSKm?.[i] ?? null,
      });
    }
    return out;
  }, [streams]);

  if (daten.length < 5) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        Kein Höhenprofil verfügbar.
      </div>
    );
  }
  const maxDist = daten[daten.length - 1].distKm;

  return (
    <div className="h-40 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={daten}
          margin={{ top: 4, right: 4, bottom: 0, left: -20 }}
          onMouseMove={(st) => {
            const label = st?.activeLabel;
            if (label != null && onHover) onHover(Number(label) / maxDist);
          }}
          onMouseLeave={() => onHover?.(null)}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="distKm"
            type="number"
            domain={[0, "dataMax"]}
            tickFormatter={(v) => `${Number(v).toFixed(0)}`}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            unit=" km"
          />
          <YAxis
            dataKey="ele"
            domain={["dataMin - 10", "dataMax + 10"]}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
          />
          <Tooltip
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelFormatter={(l) => `km ${Number(l).toFixed(2)}`}
            formatter={(value, name) => {
              if (name === "ele") return [`${value} m`, "Höhe"];
              return [String(value), String(name)];
            }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as (typeof daten)[number];
              return (
                <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs">
                  <div className="stat-mono">km {Number(label).toFixed(2)}</div>
                  <div>Höhe {p.ele} m</div>
                  {p.hr != null && <div>{Math.round(p.hr)} bpm</div>}
                  {p.pace != null && <div>{formatPace(p.pace)}</div>}
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="ele"
            stroke="var(--chart-2)"
            fill="var(--chart-2)"
            fillOpacity={0.25}
            strokeWidth={1.5}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
