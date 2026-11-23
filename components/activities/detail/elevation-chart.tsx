"use client";

import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatPace } from "@/lib/format";
import {
  AKTIVER_PUNKT,
  CURSOR_LINIE,
  DIAGRAMM_FARBEN,
  DIAGRAMM_HOEHE,
  DIAGRAMM_RAND,
  DiagrammLeer,
  FLAECHE_DECKKRAFT,
  GITTER,
  LINIE,
  Legende,
  TooltipKarte,
  X_ACHSE,
  Y_ACHSE,
  werteAchse,
} from "@/components/ui/diagramm";
import type { FlyoverStreams } from "./flyover-map";

interface ElevationChartProps {
  streams: FlyoverStreams;
  onHover?: (fortschritt: number | null) => void;
}

const FARBE = DIAGRAMM_FARBEN.hoehe;

type Punkt = { distKm: number; ele: number; hr: number | null; pace: number | null };

function HoehenTooltip({ active, payload }: { active?: boolean; payload?: { payload?: unknown }[] }) {
  const p = payload?.[0]?.payload as Punkt | undefined;
  if (!active || !p) return null;
  const zeilen = [
    ...(p.hr != null ? [{ label: "Puls", wert: `${Math.round(p.hr)} bpm`, farbe: DIAGRAMM_FARBEN.puls }] : []),
    ...(p.pace != null ? [{ label: "Pace", wert: formatPace(p.pace), farbe: DIAGRAMM_FARBEN.pace }] : []),
  ];
  return <TooltipKarte titel={`km ${p.distKm.toFixed(2)}`} wert={`${p.ele} m`} zeilen={zeilen} />;
}

/** Höhenprofil über die Distanz (Fallback, solange der Flyover-Graph nicht bereit ist) */
export function ElevationChart({ streams, onHover }: ElevationChartProps) {
  const daten = useMemo(() => {
    const out: Punkt[] = [];
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

  const y = useMemo(() => werteAchse(daten.map((p) => p.ele), { rand: 10 }), [daten]);

  if (daten.length < 5) return <DiagrammLeer>Kein Höhenprofil verfügbar.</DiagrammLeer>;
  const maxDist = daten[daten.length - 1].distKm;

  return (
    <div className="space-y-2">
      <div className={`${DIAGRAMM_HOEHE} w-full`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={daten}
            margin={DIAGRAMM_RAND}
            onMouseMove={(st) => {
              const label = st?.activeLabel;
              if (label != null && onHover) onHover(Number(label) / maxDist);
            }}
            onMouseLeave={() => onHover?.(null)}
          >
            <CartesianGrid {...GITTER} />
            <XAxis
              {...X_ACHSE}
              dataKey="distKm"
              type="number"
              domain={[0, "dataMax"]}
              tickFormatter={(v) => `${Number(v).toFixed(0)} km`}
            />
            <YAxis {...Y_ACHSE} dataKey="ele" domain={y.domain} ticks={y.ticks} interval={0} tickFormatter={(v: number) => `${v}`} />
            <Tooltip content={<HoehenTooltip />} cursor={CURSOR_LINIE} />
            <Area
              {...LINIE}
              dataKey="ele"
              stroke={FARBE}
              fill={FARBE}
              fillOpacity={FLAECHE_DECKKRAFT}
              activeDot={{ ...AKTIVER_PUNKT, fill: FARBE }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <Legende eintraege={[{ art: "flaeche", farbe: FARBE, label: "Höhe über Meer (m)" }]} />
    </div>
  );
}
