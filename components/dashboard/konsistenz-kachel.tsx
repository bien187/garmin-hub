"use client";

import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatDatum } from "@/lib/format";
import type { Konsistenz } from "@/lib/engine/konsistenz";
import {
  CURSOR_BALKEN,
  DIAGRAMM_FARBEN,
  DIAGRAMM_HOEHE,
  DIAGRAMM_RAND,
  DiagrammHinweis,
  GITTER,
  KeinWert,
  Kennzahl,
  Kennzahlen,
  Legende,
  REFERENZ_LINIE,
  TooltipKarte,
  X_ACHSE,
  Y_ACHSE,
  werteAchse,
} from "@/components/ui/diagramm";

const FARBE = DIAGRAMM_FARBEN.fortschritt;
const zahl = (h: number) => h.toLocaleString("de-CH", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

type Zeile = { woche: string; stunden: number; laufend: boolean };

function KonsistenzTooltip({ active, payload, budget }: { active?: boolean; payload?: { payload?: unknown }[]; budget: number | null }) {
  const z = payload?.[0]?.payload as Zeile | undefined;
  if (!active || !z) return null;
  return (
    <TooltipKarte
      titel={`Woche ab ${formatDatum(z.woche)}`}
      wert={`${zahl(z.stunden)} h`}
      hinweis={
        [z.laufend ? "laufende Woche, noch unvollständig" : null, budget != null ? `Budget ${zahl(budget)} h` : null]
          .filter(Boolean)
          .join(" · ") || undefined
      }
    />
  );
}

/** Konsistenz: Trainingsstunden der letzten 12 Wochen, Budget als Referenzlinie */
export function KonsistenzKachel({ k }: { k: Konsistenz }) {
  const daten: Zeile[] = k.wochen.map((w, i) => ({ ...w, laufend: i === k.wochen.length - 1 }));
  const aktuell = daten.at(-1) ?? null;
  const budget = k.budgetH != null && k.budgetH > 0 ? k.budgetH : null;
  const abgeschlossen = daten.slice(0, -1);
  const mittel4 = abgeschlossen.length ? abgeschlossen.slice(-4).reduce((s, w) => s + w.stunden, 0) / Math.min(4, abgeschlossen.length) : null;
  const imBudget = budget != null ? abgeschlossen.filter((w) => w.stunden >= budget).length : null;
  const y = werteAchse([...daten.map((w) => w.stunden), budget ?? 0], { null: true });

  return (
    <div className="space-y-4">
      <p className="max-w-md text-[13px] text-muted-foreground">Wie regelmässig du trainierst — alle Sportarten.</p>

      <Kennzahlen>
        <Kennzahl
          label="Diese Woche"
          wert={aktuell ? zahl(aktuell.stunden) : <KeinWert />}
          einheit={aktuell ? "h" : undefined}
          fuss={budget != null ? `von ${zahl(budget)} h Budget` : "bis heute"}
        />
        <Kennzahl label="Ø letzte 4 Wochen" wert={mittel4 != null ? zahl(mittel4) : <KeinWert />} einheit={mittel4 != null ? "h" : undefined} fuss="abgeschlossene Wochen" />
        <Kennzahl
          label="Serie"
          wert={k.serie}
          einheit={k.serie === 1 ? "Woche" : "Wochen"}
          fuss="in Folge trainiert"
          ton={k.serie >= 4 ? "text-status-green" : undefined}
        />
        <Kennzahl
          label="Budget erreicht"
          wert={imBudget != null ? `${imBudget}/${abgeschlossen.length}` : <KeinWert />}
          fuss={imBudget != null ? "abgeschlossene Wochen" : "kein Budget im Profil"}
        />
      </Kennzahlen>

      <div className="space-y-2">
        <div className={`${DIAGRAMM_HOEHE} w-full`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={daten} margin={DIAGRAMM_RAND} barCategoryGap="22%">
              <CartesianGrid {...GITTER} />
              <XAxis {...X_ACHSE} dataKey="woche" tickFormatter={(w: string) => formatDatum(w)} interval="preserveStartEnd" minTickGap={18} />
              <YAxis {...Y_ACHSE} domain={y.domain} ticks={y.ticks} interval={0} tickFormatter={(v: number) => `${v}`} />
              <Tooltip content={<KonsistenzTooltip budget={budget} />} cursor={CURSOR_BALKEN} />
              {budget != null && <ReferenceLine y={budget} {...REFERENZ_LINIE} />}
              <Bar dataKey="stunden" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                {daten.map((d) => (
                  <Cell key={d.woche} fill={FARBE} fillOpacity={d.laufend ? 1 : 0.35} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <Legende
          eintraege={[
            { art: "balken", farbe: FARBE, label: "abgeschlossene Wochen", blass: true },
            { art: "balken", farbe: FARBE, label: "laufende Woche" },
            ...(budget != null ? [{ art: "strich" as const, farbe: "var(--muted-foreground)", label: "Wochenbudget" }] : []),
          ]}
        />
      </div>

      <DiagrammHinweis>
        <p>
          Trainingszeit je Woche (Stunden) aus allen Aktivitäten. Die Serie zählt abgeschlossene Wochen mit Training; die laufende
          Woche zählt erst, wenn sie das Budget erreicht.
        </p>
      </DiagrammHinweis>
    </div>
  );
}
