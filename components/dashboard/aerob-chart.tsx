"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  datenqualitaet,
  rollierenderTrend,
  type AerobeLeistung,
  type AerobPunkt,
  type Datenqualitaet,
  type TrendStatus,
  type TrendTag,
} from "@/lib/engine/aerobe-leistung";
import { ZEITRAEUME_AEROB, verfuegbareZeitraeume, zeitraumVon, type Zeitraum } from "@/lib/engine/zeitachse";
import { formatDatum, formatDatumLang, formatPaceKurz } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ZeitraumUmschalter } from "./zeitraum-umschalter";

type Ansicht = "ref" | "z2";

const mittag = (iso: string) => Date.parse(iso + "T12:00:00Z");

const TOOLTIP_STIL = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 12,
} as const;

const QUALITAET: Record<Datenqualitaet, { label: string; farbe: string }> = {
  gut: { label: "gut", farbe: "text-status-green" },
  mittel: { label: "mittel", farbe: "text-status-yellow" },
  gering: { label: "gering", farbe: "text-status-orange" },
};

const STATUS_TEXT: Record<TrendStatus, string> = {
  gemessen: "28-Tage-Trend",
  fortgeschrieben: "fortgeschrieben, ohne neue Messung",
  unsicher: "unsicher, wenige Messungen",
};

/** Pace-Differenz mit Vorzeichen: −0:12 = schneller */
function paceDelta(s: number): string {
  const a = Math.abs(Math.round(s));
  return `${s < 0 ? "−" : "+"}${Math.floor(a / 60)}:${String(a % 60).padStart(2, "0")}`;
}

interface LinienPunkt {
  t: number;
  voll: number | null;
  gestrichelt: number | null;
  tag: TrendTag;
}

interface StreuPunkt {
  t: number;
  pace: number;
  punkt: AerobPunkt;
}

/**
 * Trend in zwei Linien: durchgezogen mit neuer Messung, gestrichelt, wenn
 * er nur fortgeschrieben oder unsicher ist. Die gestrichelte Linie schliesst
 * an die benachbarten Tage an, damit keine Lücke entsteht, wo keine ist.
 */
function linien(trend: TrendTag[]): LinienPunkt[] {
  const voll = (x?: TrendTag) => x != null && x.paceSKm != null && x.status === "gemessen";
  const gestr = (x?: TrendTag) => x != null && x.paceSKm != null && x.status !== "gemessen";
  return trend.map((tag, i) => ({
    t: mittag(tag.datum),
    voll: voll(tag) ? tag.paceSKm : null,
    gestrichelt: gestr(tag) || (voll(tag) && (gestr(trend[i - 1]) || gestr(trend[i + 1]))) ? tag.paceSKm : null,
    tag,
  }));
}

function AerobTooltip({
  active,
  payload,
  ziel,
}: {
  active?: boolean;
  payload?: { payload?: unknown }[];
  ziel: number | null;
}) {
  if (!active || !payload?.length) return null;
  const items = payload.map((p) => p.payload as Partial<LinienPunkt & StreuPunkt> | undefined);
  const streu = items.find((i) => i?.punkt)?.punkt;
  if (streu) {
    return (
      <div style={TOOLTIP_STIL} className="max-w-64 space-y-1">
        <div className="text-[11px] text-muted-foreground">{formatDatumLang(streu.datum)}</div>
        <div className="stat-display text-base">{formatPaceKurz(streu.paceSKm)} /km</div>
        <div className="text-[11px] leading-snug text-muted-foreground">
          {streu.art === "gemessen"
            ? `direkt bei ${streu.hf} bpm gemessen`
            : `bei ${streu.hf} bpm gelaufen, auf ${ziel ?? "–"} bpm normiert (geschätzt)`}
          {!streu.hoehe && " · ohne Höhenkorrektur"}
        </div>
      </div>
    );
  }
  const tag = items.find((i) => i?.tag)?.tag;
  if (!tag || tag.paceSKm == null || !tag.status) return null;
  return (
    <div style={TOOLTIP_STIL} className="max-w-64 space-y-1">
      <div className="text-[11px] text-muted-foreground">{formatDatumLang(tag.datum)}</div>
      <div className="stat-display text-base">{formatPaceKurz(tag.paceSKm)} /km</div>
      <div className="text-[11px] leading-snug text-muted-foreground">
        {STATUS_TEXT[tag.status]} · {tag.anzahl} {tag.anzahl === 1 ? "Lauf" : "Läufe"} in 28 Tagen
      </div>
    </div>
  );
}

function Kennzahl({
  label,
  wert,
  einheit,
  fuss,
  className,
}: {
  label: string;
  wert: React.ReactNode;
  einheit?: string;
  fuss: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className={cn("stat-display text-[20px] leading-none", className)}>{wert}</span>
        {einheit && <span className="text-xs text-muted-foreground">{einheit}</span>}
      </div>
      <div className="mt-1 truncate text-xs text-dim-foreground">{fuss}</div>
    </div>
  );
}

const Leer = () => <span className="text-dim-foreground">–</span>;

/** Hohler Punkt für geschätzte (über das Modell normierte) Werte */
function HohlerPunkt(props: unknown) {
  const { cx, cy } = props as { cx?: number; cy?: number };
  if (cx == null || cy == null) return <g />;
  return <circle cx={cx} cy={cy} r={2.8} fill="var(--card)" stroke="var(--coral)" strokeOpacity={0.75} strokeWidth={1.2} />;
}

function VollerPunkt(props: unknown) {
  const { cx, cy } = props as { cx?: number; cy?: number };
  if (cx == null || cy == null) return <g />;
  return <circle cx={cx} cy={cy} r={2.8} fill="var(--coral)" fillOpacity={0.7} />;
}

/**
 * Aerobic Performance: normierte Pace je Lauf (Punkte) und rollierender
 * 28-Tage-Trend (Linie). Schneller liegt oben. Umschaltbar zwischen dem
 * Referenzpuls und Zone 2.
 */
export function AerobChart({ daten, heute }: { daten: AerobeLeistung; heute: string }) {
  const [ansicht, setAnsicht] = useState<Ansicht>("ref");
  const [zeitraum, setZeitraum] = useState<Zeitraum>("alles");
  const reihe = ansicht === "ref" ? daten.hauptreihe : daten.zone2.reihe;
  const ziel = reihe.ziel;
  const punkte = reihe.punkte;
  const erstes = punkte[0]?.datum ?? null;

  const trend = useMemo(() => (erstes ? rollierenderTrend(punkte, erstes, heute) : []), [punkte, erstes, heute]);
  const verfuegbar = useMemo(() => verfuegbareZeitraeume(erstes, heute, ZEITRAEUME_AEROB), [erstes, heute]);
  const aktiv = verfuegbar.includes(zeitraum) ? zeitraum : "alles";
  const von = zeitraumVon(aktiv, heute) ?? erstes ?? heute;

  const sicht = useMemo(() => {
    const trendSicht = trend.filter((t) => t.datum >= von);
    const lin = linien(trendSicht);
    const punkteSicht = punkte.filter((p) => p.datum >= von);
    const gemessen: StreuPunkt[] = [];
    const geschaetzt: StreuPunkt[] = [];
    for (const p of punkteSicht) (p.art === "gemessen" ? gemessen : geschaetzt).push({ t: mittag(p.datum), pace: p.paceSKm, punkt: p });
    const werte = [...trendSicht.flatMap((t) => (t.paceSKm != null ? [t.paceSKm] : [])), ...punkteSicht.map((p) => p.paceSKm)];
    let domainY: [number, number] = [300, 420];
    const ticksY: number[] = [];
    if (werte.length) {
      const min = Math.min(...werte);
      const max = Math.max(...werte);
      const schritt = [5, 10, 15, 20, 30, 60].find((s) => (max - min + 16) / s <= 5) ?? 60;
      domainY = [Math.floor((min - 8) / schritt) * schritt, Math.ceil((max + 8) / schritt) * schritt];
      for (let v = domainY[0]; v <= domainY[1]; v += schritt) ticksY.push(v);
    }
    const erster = trendSicht.find((t) => t.paceSKm != null) ?? null;
    return { trendSicht, lin, punkteSicht, gemessen, geschaetzt, domainY, ticksY, erster };
  }, [trend, punkte, von]);

  const aktuell = trend.at(-1) ?? null;
  const qualitaet = datenqualitaet(aktuell);
  const letzterWert = [...trend].reverse().find((t) => t.paceSKm != null) ?? null;
  const veraenderung =
    aktuell?.paceSKm != null && sicht.erster && sicht.erster.datum < aktuell.datum ? aktuell.paceSKm - sicht.erster.paceSKm! : null;

  const t = daten.transparenz;
  const aus = t.ausgeschlossen;
  // Läufe mit Abschnitten, die nicht überwiegend in Zone 2 liefen (Tempo, Intervalle mit Einlaufen)
  const nichtAerob = Math.max(0, t.mitAbschnitten - aus.ohne_hoehe - daten.zone2.laeufe);
  const nichtDabei = [
    ansicht === "z2" && nichtAerob > 0 && `${nichtAerob} nicht überwiegend in Zone 2 (z. B. Tempoläufe)`,
    aus.keine_hf > 0 && `${aus.keine_hf} ohne Herzfrequenz`,
    aus.hf_luecken > 0 && `${aus.hf_luecken} mit lückenhafter Herzfrequenz`,
    aus.instabil > 0 && `${aus.instabil} ohne gleichmässigen Abschnitt (z. B. Intervalle)`,
    aus.zu_kurz > 0 && `${aus.zu_kurz} zu kurz`,
    aus.keine_streams > 0 && `${aus.keine_streams} ohne Zeitreihen`,
    aus.ohne_hoehe > 0 && `${aus.ohne_hoehe} ohne Höhendaten`,
    reihe.nichtVergleichbar > 0 &&
      `${reihe.nichtVergleichbar} ausserhalb des belastbaren Pulsbereichs${ansicht === "z2" ? " von Zone 2" : ""}`,
  ].filter(Boolean) as string[];
  const zusaetzlich = punkte.length - t.bisherigeMethode;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <p className="max-w-md text-[13px] text-muted-foreground">Deine Laufgeschwindigkeit bei vergleichbarer aerober Belastung.</p>
        <div role="group" aria-label="Referenz" className="flex gap-1">
          {(
            [
              ["ref", `Bei ${daten.refHr} bpm`],
              ["z2", "Zone 2 Efficiency"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={ansicht === id}
              onClick={() => setAnsicht(id)}
              className={cn(
                "min-h-8 rounded-md px-2 text-xs transition-colors",
                ansicht === id ? "bg-surface text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        <Kennzahl
          label="Referenzpace"
          wert={aktuell?.paceSKm != null ? formatPaceKurz(aktuell.paceSKm) : <Leer />}
          einheit={aktuell?.paceSKm != null ? "/km" : undefined}
          fuss={ziel != null ? `bei ${ziel} bpm · 28-Tage-Trend` : "nicht verfügbar"}
        />
        <Kennzahl
          label="Veränderung"
          wert={veraenderung != null ? paceDelta(veraenderung) : <Leer />}
          einheit={veraenderung != null ? "/km" : undefined}
          className={veraenderung != null && Math.abs(veraenderung) >= 2 ? (veraenderung < 0 ? "text-status-green" : "text-status-orange") : undefined}
          fuss={sicht.erster && veraenderung != null ? `seit ${formatDatum(sicht.erster.datum)}` : "zu wenig Daten im Zeitraum"}
        />
        <Kennzahl label="Läufe" wert={sicht.punkteSicht.length} fuss="im Zeitraum berücksichtigt" />
        <Kennzahl
          label="Datenqualität"
          wert={qualitaet ? QUALITAET[qualitaet].label : <Leer />}
          className={qualitaet ? QUALITAET[qualitaet].farbe : undefined}
          fuss={aktuell && aktuell.anzahl > 0 ? `${aktuell.anzahl} ${aktuell.anzahl === 1 ? "Lauf" : "Läufe"} in 28 Tagen` : "kein Lauf in 28 Tagen"}
        />
      </div>

      {punkte.length === 0 ? (
        <div className="flex h-44 items-center justify-center px-4 text-center text-sm text-muted-foreground">
          {t.offen > 0
            ? `Die Läufe werden gerade ausgewertet (${t.offen} offen). Nach dem nächsten Laden oder Sync erscheinen die Werte.`
            : "Noch nicht genügend vergleichbare Läufe für eine zuverlässige Normalisierung."}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex justify-end">
            <ZeitraumUmschalter wert={aktiv} verfuegbar={verfuegbar} onChange={setZeitraum} liste={ZEITRAEUME_AEROB} />
          </div>
          <div className="h-56 w-full md:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart margin={{ top: 8, right: 8, bottom: 0, left: -6 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.7} />
                <XAxis
                  type="number"
                  dataKey="t"
                  scale="time"
                  domain={[mittag(von), mittag(heute)]}
                  tickFormatter={(ms: number) => formatDatum(new Date(ms).toISOString().slice(0, 10))}
                  tick={{ fontSize: 10, fill: "var(--dim-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={32}
                />
                {/* reversed: schneller (weniger s/km) liegt oben */}
                <YAxis
                  type="number"
                  reversed
                  domain={sicht.domainY}
                  ticks={sicht.ticksY}
                  interval={0}
                  tickFormatter={(v: number) => formatPaceKurz(v)}
                  tick={{ fontSize: 10, fill: "var(--dim-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                />
                <Tooltip content={<AerobTooltip ziel={ziel} />} cursor={{ stroke: "rgb(255 255 255 / 15%)" }} />
                <Scatter data={sicht.geschaetzt} dataKey="pace" shape={HohlerPunkt} isAnimationActive={false} />
                <Scatter data={sicht.gemessen} dataKey="pace" shape={VollerPunkt} isAnimationActive={false} />
                <Line
                  data={sicht.lin}
                  dataKey="gestrichelt"
                  type="monotone"
                  stroke="var(--coral)"
                  strokeOpacity={0.6}
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                  activeDot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
                <Line
                  data={sicht.lin}
                  dataKey="voll"
                  type="monotone"
                  stroke="var(--coral)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 3.5, fill: "var(--coral)", strokeWidth: 0 }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
                {aktuell?.paceSKm != null && (
                  <ReferenceDot
                    x={mittag(heute)}
                    y={aktuell.paceSKm}
                    r={4}
                    fill="var(--coral)"
                    stroke="var(--background)"
                    strokeWidth={2}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-coral/70" />
              direkt gemessen
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full border border-coral/75" />
              über das Modell normiert
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full bg-coral" />
              28-Tage-Trend
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 border-t border-dashed border-coral/70" />
              ohne neue Messung
            </span>
          </div>
        </div>
      )}

      <div className="space-y-1.5 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
        {aktuell && aktuell.anzahl > 0 ? (
          <p>
            Basierend auf {aktuell.anzahl} geeigneten {aktuell.anzahl === 1 ? "Lauf" : "Läufen"} aus den letzten 28 Tagen.
          </p>
        ) : letzterWert ? (
          <p>
            In den letzten 28 Tagen kein geeigneter Lauf — der Trend endet am {formatDatumLang(letzterWert.datum)}.
          </p>
        ) : null}
        <p>
          Insgesamt {punkte.length} von {t.laeufe} Läufen berücksichtigt
          {nichtDabei.length > 0 ? `; nicht berücksichtigt: ${nichtDabei.join(", ")}.` : "."}
        </p>
        {ansicht === "ref" && (
          <p>
            Bisherige Methode (nur Abschnitte direkt bei {daten.refHr} ± 3 bpm): {t.bisherigeMethode}{" "}
            {t.bisherigeMethode === 1 ? "Lauf" : "Läufe"}
            {zusaetzlich > 0 ? ` — jetzt ${zusaetzlich} zusätzlich.` : "."}
          </p>
        )}
        {ansicht === "z2" &&
          (daten.zone2.quelle === "garmin" ? (
            <p>
              Zone 2 laut Garmin: {daten.zone2.von}–{daten.zone2.bis} bpm. {daten.zone2.laeufe} überwiegend aerobe Läufe
              {ziel != null ? `; ihre Zone-2-Abschnitte liegen im Median bei ${ziel} bpm.` : "."}
            </p>
          ) : (
            <p className="text-status-orange">
              Keine Garmin-Zonen synchronisiert: Zone 2 ({daten.zone2.von}–{daten.zone2.bis} bpm) ist aus Ruhe- und Maximalpuls
              geschätzt und entsprechend ungenau.
            </p>
          ))}
        {daten.modell ? (
          <p>
            Persönliches Modell: +1 bpm ≈ {((Math.exp(daten.modell.b) - 1) * 100).toFixed(1)} % mehr Tempo, belastbar zwischen{" "}
            {daten.modell.lo} und {daten.modell.hi} bpm ({daten.modell.laeufe} Läufe). Höhenkorrigiert (GAP), ohne
            Aufwärmen, Pausen und Intervalle.
          </p>
        ) : (
          <p>
            Noch nicht genügend vergleichbare Läufe für eine zuverlässige Normalisierung — gezeigt werden nur Läufe, die direkt
            am Referenzpuls (± 3 bpm) gelaufen wurden.
          </p>
        )}
        {t.offen > 0 && <p className="text-status-yellow">Analyse läuft: {t.offen} Läufe werden noch ausgewertet.</p>}
      </div>
    </div>
  );
}
