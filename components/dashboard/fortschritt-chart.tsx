"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { VerlaufWoche } from "@/lib/engine/wochenstatistik";
import { formatDatum, formatPaceKurz } from "@/lib/format";
import {
  AKTIVER_PUNKT,
  CURSOR_BALKEN,
  CURSOR_LINIE,
  DIAGRAMM_FARBEN,
  DIAGRAMM_HOEHE,
  DIAGRAMM_RAND,
  DiagrammHinweis,
  DiagrammLeer,
  GITTER,
  KeinWert,
  Kennzahl,
  Kennzahlen,
  LINIE,
  Legende,
  Segmente,
  TooltipKarte,
  X_ACHSE,
  Y_ACHSE,
  paceAchse,
  werteAchse,
} from "@/components/ui/diagramm";

type Metrik = "laufKm" | "laufMin" | "laufPaceSKm" | "avgHr" | "stunden";

const METRIKEN: {
  id: Metrik;
  label: string;
  einheit: string;
  art: "balken" | "linie";
  farbe: string;
  besserNiedrig?: boolean;
}[] = [
  { id: "laufKm", label: "Distanz", einheit: "km", art: "balken", farbe: DIAGRAMM_FARBEN.fortschritt },
  { id: "laufMin", label: "Laufzeit", einheit: "Min", art: "balken", farbe: DIAGRAMM_FARBEN.fortschritt },
  { id: "laufPaceSKm", label: "Pace", einheit: "/km", art: "linie", farbe: DIAGRAMM_FARBEN.pace, besserNiedrig: true },
  { id: "avgHr", label: "Puls", einheit: "bpm", art: "linie", farbe: DIAGRAMM_FARBEN.puls },
  { id: "stunden", label: "Umfang", einheit: "h", art: "balken", farbe: DIAGRAMM_FARBEN.fortschritt },
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

type Zeile = VerlaufWoche & { wert: number | null; laufend: boolean };

function WochenTooltip({
  active,
  payload,
  metrik,
}: {
  active?: boolean;
  payload?: { payload?: unknown }[];
  metrik: (typeof METRIKEN)[number];
}) {
  const z = payload?.[0]?.payload as Zeile | undefined;
  if (!active || !z) return null;
  return (
    <TooltipKarte
      titel={`Woche ab ${formatDatum(z.woche)}`}
      wert={z.wert != null ? `${format(metrik.id, z.wert)} ${metrik.einheit}` : "kein Wert"}
      hinweis={z.laufend ? "laufende Woche, noch unvollständig" : undefined}
    />
  );
}

/**
 * Fortschritt der letzten 12 Wochen (aus echten Aktivitäten). Wochen ohne
 * Wert bleiben leer — keine geschätzten Punkte. Die laufende Woche ist
 * hervorgehoben und unvollständig.
 */
export function FortschrittChart({ verlauf }: { verlauf: VerlaufWoche[] }) {
  const [metrik, setMetrik] = useState<Metrik>("laufKm");
  const def = METRIKEN.find((m) => m.id === metrik)!;
  const daten: Zeile[] = useMemo(
    () =>
      verlauf.map((w, i) => ({
        ...w,
        wert: w[metrik] && w[metrik]! > 0 ? w[metrik] : null,
        laufend: i === verlauf.length - 1,
      })),
    [verlauf, metrik]
  );

  // Vergleich: Ø der letzten 4 abgeschlossenen Wochen vs. die 4 davor
  const abgeschlossen = daten.slice(0, -1);
  const jetzt = mittel(abgeschlossen.slice(-4).map((d) => d.wert));
  const vorher = mittel(abgeschlossen.slice(-8, -4).map((d) => d.wert));
  const diffProz = jetzt != null && vorher != null && vorher > 0 ? ((jetzt - vorher) / vorher) * 100 : null;
  const gut = diffProz == null ? null : def.besserNiedrig ? diffProz < 0 : diffProz > 0;
  const laufend = daten.at(-1) ?? null;
  const mitWert = daten.filter((d): d is Zeile & { wert: number } => d.wert != null);
  const best = mitWert.length
    ? mitWert.reduce((b, d) => (def.besserNiedrig ? (d.wert < b.wert ? d : b) : d.wert > b.wert ? d : b))
    : null;

  const werte = mitWert.map((d) => d.wert);
  const y = def.besserNiedrig ? paceAchse(werte) : werteAchse(werte, { null: def.art === "balken" });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <p className="max-w-md text-[13px] text-muted-foreground">Deine Laufwochen der letzten 12 Wochen.</p>
        <Segmente label="Kennzahl" wert={metrik} onChange={setMetrik} optionen={METRIKEN} />
      </div>

      <Kennzahlen>
        <Kennzahl
          label="Ø letzte 4 Wochen"
          wert={jetzt != null ? format(metrik, jetzt) : <KeinWert />}
          einheit={jetzt != null ? def.einheit : undefined}
          fuss="abgeschlossene Wochen"
        />
        <Kennzahl
          label="Veränderung"
          wert={diffProz != null ? `${diffProz > 0 ? "+" : diffProz < 0 ? "−" : ""}${Math.abs(diffProz).toFixed(0)}` : <KeinWert />}
          einheit={diffProz != null ? "%" : undefined}
          ton={diffProz != null && Math.abs(diffProz) >= 1 ? (gut ? "text-status-green" : "text-status-orange") : undefined}
          fuss="ggü. den 4 Wochen davor"
        />
        <Kennzahl
          label="Diese Woche"
          wert={laufend?.wert != null ? format(metrik, laufend.wert) : <KeinWert />}
          einheit={laufend?.wert != null ? def.einheit : undefined}
          fuss="bis heute"
        />
        <Kennzahl
          label={def.besserNiedrig ? "Schnellste Woche" : "Höchster Wert"}
          wert={best ? format(metrik, best.wert) : <KeinWert />}
          einheit={best ? def.einheit : undefined}
          fuss={best ? `Woche ab ${formatDatum(best.woche)}` : "in 12 Wochen"}
        />
      </Kennzahlen>

      {mitWert.length === 0 ? (
        <DiagrammLeer>Noch keine Werte für diese Kennzahl.</DiagrammLeer>
      ) : (
        <div className="space-y-2">
          <div className={`${DIAGRAMM_HOEHE} w-full`}>
            <ResponsiveContainer width="100%" height="100%">
              {def.art === "balken" ? (
                <BarChart data={daten} margin={DIAGRAMM_RAND} barCategoryGap="22%">
                  <CartesianGrid {...GITTER} />
                  <XAxis {...X_ACHSE} dataKey="woche" tickFormatter={(w: string) => formatDatum(w)} interval="preserveStartEnd" minTickGap={18} />
                  <YAxis {...Y_ACHSE} domain={y.domain} ticks={y.ticks} interval={0} tickFormatter={(v: number) => format(metrik, v)} />
                  <Tooltip content={<WochenTooltip metrik={def} />} cursor={CURSOR_BALKEN} />
                  <Bar dataKey="wert" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                    {daten.map((d) => (
                      <Cell key={d.woche} fill={def.farbe} fillOpacity={d.laufend ? 1 : 0.35} />
                    ))}
                  </Bar>
                </BarChart>
              ) : (
                <LineChart data={daten} margin={DIAGRAMM_RAND}>
                  <CartesianGrid {...GITTER} />
                  <XAxis {...X_ACHSE} dataKey="woche" tickFormatter={(w: string) => formatDatum(w)} interval="preserveStartEnd" minTickGap={18} />
                  <YAxis
                    {...Y_ACHSE}
                    reversed={def.besserNiedrig}
                    domain={y.domain}
                    ticks={y.ticks}
                    interval={0}
                    tickFormatter={(v: number) => format(metrik, v)}
                  />
                  <Tooltip content={<WochenTooltip metrik={def} />} cursor={CURSOR_LINIE} />
                  <Line
                    {...LINIE}
                    dataKey="wert"
                    stroke={def.farbe}
                    connectNulls={false}
                    dot={{ r: 2.8, strokeWidth: 0, fill: def.farbe, fillOpacity: 0.7 }}
                    activeDot={{ ...AKTIVER_PUNKT, fill: def.farbe }}
                  />
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
          <Legende
            eintraege={
              def.art === "balken"
                ? [
                    { art: "balken", farbe: def.farbe, label: "abgeschlossene Wochen", blass: true },
                    { art: "balken", farbe: def.farbe, label: "laufende Woche" },
                  ]
                : [
                    { art: "punkt", farbe: def.farbe, label: "Wochenwert" },
                    { art: "linie", farbe: def.farbe, label: "Verlauf" },
                  ]
            }
          />
        </div>
      )}

      <DiagrammHinweis>
        <p>Aus deinen Aktivitäten der letzten 12 Wochen; Wochen ohne Wert bleiben leer. Die laufende Woche ist noch unvollständig.</p>
        {def.besserNiedrig && <p>Achse umgedreht: oben = schneller. Ø Pace aller Läufe der Woche, ohne Höhenkorrektur.</p>}
      </DiagrammHinweis>
    </div>
  );
}
