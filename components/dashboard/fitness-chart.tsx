"use client";

import { useMemo } from "react";
import { CartesianGrid, ComposedChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { acwrZone, tsbZone } from "@/lib/engine/fitness";
import { filtereZeitraum, verfuegbareZeitraeume, zeitachse } from "@/lib/engine/zeitachse";
import { formatDatum, formatDatumLang } from "@/lib/format";
import {
  AKTIVER_PUNKT,
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
  REFERENZ_LINIE,
  TooltipKarte,
  X_ACHSE,
  Y_ACHSE,
  werteAchse,
} from "@/components/ui/diagramm";
import { ZeitraumUmschalter, useZeitraum } from "./zeitraum-umschalter";

export interface FitnessPunkt {
  datum: string;
  ctl: number;
  atl: number;
  tsb: number;
}

const FARBE = {
  ctl: DIAGRAMM_FARBEN.fortschritt,
  atl: DIAGRAMM_FARBEN.erholung,
  tsb: DIAGRAMM_FARBEN.pace,
} as const;

const NEBEN = { ...LINIE, strokeWidth: 1.5 } as const;

const TSB_TEXT = { frisch: "frisch", produktiv: "produktiv", neutral: "ermüdet", warnung: "stark ermüdet" } as const;
const ACWR_TEXT = { unter: "unterfordert", sweetspot: "Sweet Spot", erhoeht: "erhöht", gefahr: "Verletzungsrisiko" } as const;
const ACWR_TON = { unter: undefined, sweetspot: "text-status-green", erhoeht: "text-status-orange", gefahr: "text-status-red" } as const;

const zahl = (v: number) => (Math.round(v * 10) / 10).toLocaleString("de-CH", { maximumFractionDigits: 1 });
const mitVorzeichen = (v: number) => (v > 0 ? `+${Math.round(v)}` : v < 0 ? `−${Math.abs(Math.round(v))}` : "0");

function FitnessTooltip({ active, payload }: { active?: boolean; payload?: { payload?: unknown }[] }) {
  const p = payload?.[0]?.payload as FitnessPunkt | undefined;
  if (!active || !p) return null;
  return (
    <TooltipKarte
      titel={formatDatumLang(p.datum)}
      zeilen={[
        { label: "Fitness (CTL)", wert: zahl(p.ctl), farbe: FARBE.ctl },
        { label: "Ermüdung (ATL)", wert: zahl(p.atl), farbe: FARBE.atl },
        { label: "Form (TSB)", wert: mitVorzeichen(p.tsb), farbe: FARBE.tsb },
      ]}
    />
  );
}

/**
 * Form: Fitness (CTL), Ermüdung (ATL) und Form (TSB) seit Trainingsstart.
 * Zeitraum wird clientseitig gefiltert.
 */
export function FitnessChart({ daten, acwr }: { daten: FitnessPunkt[]; acwr?: number | null }) {
  const { zeitraum, setZeitraum } = useZeitraum();
  const verfuegbar = useMemo(() => verfuegbareZeitraeume(daten[0]?.datum ?? null, daten.at(-1)?.datum ?? null), [daten]);
  const aktiv = verfuegbar.includes(zeitraum) ? zeitraum : "alles";
  const sichtbar = useMemo(() => filtereZeitraum(daten, (p) => p.datum, aktiv), [daten, aktiv]);
  const achse = useMemo(() => zeitachse(sichtbar.map((p) => p.datum), formatDatum), [sichtbar]);
  const y = useMemo(() => werteAchse(sichtbar.flatMap((p) => [p.ctl, p.atl, p.tsb]), { rand: 4 }), [sichtbar]);

  const heute = daten.at(-1) ?? null;
  const erster = sichtbar[0] ?? null;
  const ctlDiff = heute && erster && erster.datum < heute.datum ? heute.ctl - erster.ctl : null;
  const tsb = heute ? tsbZone(heute.tsb) : null;
  const acwrZ = acwrZone(acwr ?? null);

  return (
    <div className="space-y-4">
      <p className="max-w-md text-[13px] text-muted-foreground">Fitness, Ermüdung und Form aus deiner Trainingsbelastung.</p>

      <Kennzahlen>
        <Kennzahl
          label="Fitness (CTL)"
          wert={heute ? zahl(heute.ctl) : <KeinWert />}
          fuss={ctlDiff != null ? `${ctlDiff >= 0 ? "+" : "−"}${zahl(Math.abs(ctlDiff))} seit ${formatDatum(erster!.datum)}` : "42-Tage-Mittel"}
          ton={ctlDiff != null && Math.abs(ctlDiff) >= 1 ? (ctlDiff > 0 ? "text-status-green" : "text-status-orange") : undefined}
        />
        <Kennzahl label="Ermüdung (ATL)" wert={heute ? zahl(heute.atl) : <KeinWert />} fuss="7-Tage-Mittel" />
        <Kennzahl
          label="Form (TSB)"
          wert={heute ? mitVorzeichen(heute.tsb) : <KeinWert />}
          fuss={tsb ? TSB_TEXT[tsb] : "nicht verfügbar"}
          ton={tsb === "warnung" ? "text-status-red" : tsb === "frisch" ? "text-status-green" : undefined}
        />
        <Kennzahl
          label="ACWR"
          wert={acwr != null ? acwr.toFixed(2) : <KeinWert />}
          fuss={acwrZ ? ACWR_TEXT[acwrZ] : "zu wenig Daten"}
          ton={acwrZ ? ACWR_TON[acwrZ] : undefined}
        />
      </Kennzahlen>

      {daten.length === 0 ? (
        <DiagrammLeer>Noch keine Daten — zuerst synchronisieren.</DiagrammLeer>
      ) : (
        <div className="space-y-2">
          <div className="flex justify-end">
            <ZeitraumUmschalter wert={aktiv} verfuegbar={verfuegbar} onChange={setZeitraum} />
          </div>
          <div className={`${DIAGRAMM_HOEHE} w-full`}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={sichtbar} margin={DIAGRAMM_RAND}>
                <CartesianGrid {...GITTER} />
                <XAxis
                  {...X_ACHSE}
                  dataKey="datum"
                  ticks={achse.ticks}
                  tickFormatter={achse.format}
                  interval={achse.modus === "monat" ? "preserveStart" : "preserveStartEnd"}
                  minTickGap={achse.modus === "monat" ? 6 : X_ACHSE.minTickGap}
                />
                <YAxis {...Y_ACHSE} domain={y.domain} ticks={y.ticks} interval={0} />
                <Tooltip content={<FitnessTooltip />} cursor={CURSOR_LINIE} />
                <ReferenceLine y={0} {...REFERENZ_LINIE} />
                <Line {...NEBEN} dataKey="atl" stroke={FARBE.atl} activeDot={{ ...AKTIVER_PUNKT, fill: FARBE.atl }} />
                <Line {...NEBEN} dataKey="tsb" stroke={FARBE.tsb} activeDot={{ ...AKTIVER_PUNKT, fill: FARBE.tsb }} />
                <Line {...LINIE} dataKey="ctl" stroke={FARBE.ctl} activeDot={{ ...AKTIVER_PUNKT, fill: FARBE.ctl }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <Legende
            eintraege={[
              { art: "linie", farbe: FARBE.ctl, label: "Fitness (CTL)" },
              { art: "linie", farbe: FARBE.atl, label: "Ermüdung (ATL)" },
              { art: "linie", farbe: FARBE.tsb, label: "Form (TSB)" },
              { art: "strich", farbe: "var(--muted-foreground)", label: "Nulllinie" },
            ]}
          />
        </div>
      )}

      <DiagrammHinweis>
        <p>
          Fitness ist das gleitende Mittel deiner Belastung (TRIMP) über etwa 42 Tage, Ermüdung über etwa 7 Tage. Form =
          Fitness − Ermüdung: über +10 frisch, zwischen −10 und +10 produktiv, unter −20 Erholung einplanen.
        </p>
        <p>ACWR = Belastung 7 Tage ÷ 28 Tage; 0.8–1.3 ist der Sweet Spot, über 1.5 steigt das Verletzungsrisiko.</p>
      </DiagrammHinweis>
    </div>
  );
}

/** Kleiner Verlauf ohne Achsen (Körper-Seite): eine Linie im Stil der grossen Diagramme */
export function MiniSparkline({
  daten,
  dataKey,
  farbe = DIAGRAMM_FARBEN.fortschritt,
}: {
  daten: Record<string, unknown>[];
  dataKey: string;
  farbe?: string;
}) {
  return (
    <div className="h-10 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={daten} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Line {...LINIE} dataKey={dataKey} stroke={farbe} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
