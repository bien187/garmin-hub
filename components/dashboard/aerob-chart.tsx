"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, ComposedChart, Line, ReferenceDot, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
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
  LINIE_NEBEN,
  Legende,
  Segmente,
  TooltipKarte,
  X_ACHSE,
  Y_ACHSE,
  hohlPunkt,
  messPunkt,
  paceAchse,
} from "@/components/ui/diagramm";
import { ZeitraumUmschalter } from "./zeitraum-umschalter";

type Ansicht = "ref" | "z2";

const FARBE = DIAGRAMM_FARBEN.pace;
const mittag = (iso: string) => Date.parse(iso + "T12:00:00Z");
const PUNKT_GEMESSEN = messPunkt(FARBE);
const PUNKT_GESCHAETZT = hohlPunkt(FARBE);

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

function AerobTooltip({ active, payload, ziel }: { active?: boolean; payload?: { payload?: unknown }[]; ziel: number | null }) {
  if (!active || !payload?.length) return null;
  const items = payload.map((p) => p.payload as Partial<LinienPunkt & StreuPunkt> | undefined);
  const streu = items.find((i) => i?.punkt)?.punkt;
  if (streu) {
    return (
      <TooltipKarte
        titel={formatDatumLang(streu.datum)}
        wert={`${formatPaceKurz(streu.paceSKm)} /km`}
        hinweis={
          (streu.art === "gemessen"
            ? `direkt bei ${streu.hf} bpm gemessen`
            : `bei ${streu.hf} bpm gelaufen, auf ${ziel ?? "–"} bpm normiert (geschätzt)`) +
          (streu.hoehe ? "" : " · ohne Höhenkorrektur")
        }
      />
    );
  }
  const tag = items.find((i) => i?.tag)?.tag;
  if (!tag || tag.paceSKm == null || !tag.status) return null;
  return (
    <TooltipKarte
      titel={formatDatumLang(tag.datum)}
      wert={`${formatPaceKurz(tag.paceSKm)} /km`}
      hinweis={`${STATUS_TEXT[tag.status]} · ${tag.anzahl} ${tag.anzahl === 1 ? "Lauf" : "Läufe"} in 28 Tagen`}
    />
  );
}

/**
 * Aerobic Performance: normierte Pace je Lauf (Punkte) und rollierender
 * 28-Tage-Trend (Linie). Schneller liegt oben. Umschaltbar zwischen dem
 * Referenzpuls und Zone 2. Vorbild für alle Diagramme (components/ui/diagramm).
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
    const erster = trendSicht.find((t) => t.paceSKm != null) ?? null;
    return { lin, punkteSicht, gemessen, geschaetzt, y: paceAchse(werte), erster };
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
        <Segmente
          label="Referenz"
          wert={ansicht}
          onChange={setAnsicht}
          optionen={[
            { id: "ref", label: `Bei ${daten.refHr} bpm` },
            { id: "z2", label: "Zone 2 Efficiency" },
          ]}
        />
      </div>

      <Kennzahlen>
        <Kennzahl
          label="Referenzpace"
          wert={aktuell?.paceSKm != null ? formatPaceKurz(aktuell.paceSKm) : <KeinWert />}
          einheit={aktuell?.paceSKm != null ? "/km" : undefined}
          fuss={ziel != null ? `bei ${ziel} bpm · 28-Tage-Trend` : "nicht verfügbar"}
        />
        <Kennzahl
          label="Veränderung"
          wert={veraenderung != null ? paceDelta(veraenderung) : <KeinWert />}
          einheit={veraenderung != null ? "/km" : undefined}
          ton={veraenderung != null && Math.abs(veraenderung) >= 2 ? (veraenderung < 0 ? "text-status-green" : "text-status-orange") : undefined}
          fuss={sicht.erster && veraenderung != null ? `seit ${formatDatum(sicht.erster.datum)}` : "zu wenig Daten im Zeitraum"}
        />
        <Kennzahl label="Läufe" wert={sicht.punkteSicht.length} fuss="im Zeitraum berücksichtigt" />
        <Kennzahl
          label="Datenqualität"
          wert={qualitaet ? QUALITAET[qualitaet].label : <KeinWert />}
          ton={qualitaet ? QUALITAET[qualitaet].farbe : undefined}
          fuss={aktuell && aktuell.anzahl > 0 ? `${aktuell.anzahl} ${aktuell.anzahl === 1 ? "Lauf" : "Läufe"} in 28 Tagen` : "kein Lauf in 28 Tagen"}
        />
      </Kennzahlen>

      {punkte.length === 0 ? (
        <DiagrammLeer>
          {t.offen > 0
            ? `Die Läufe werden gerade ausgewertet (${t.offen} offen). Nach dem nächsten Laden oder Sync erscheinen die Werte.`
            : "Noch nicht genügend vergleichbare Läufe für eine zuverlässige Normalisierung."}
        </DiagrammLeer>
      ) : (
        <div className="space-y-2">
          <div className="flex justify-end">
            <ZeitraumUmschalter wert={aktiv} verfuegbar={verfuegbar} onChange={setZeitraum} liste={ZEITRAEUME_AEROB} />
          </div>
          <div className={`${DIAGRAMM_HOEHE} w-full`}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart margin={DIAGRAMM_RAND}>
                <CartesianGrid {...GITTER} />
                <XAxis
                  {...X_ACHSE}
                  type="number"
                  dataKey="t"
                  scale="time"
                  domain={[mittag(von), mittag(heute)]}
                  tickFormatter={(ms: number) => formatDatum(new Date(ms).toISOString().slice(0, 10))}
                />
                {/* reversed: schneller (weniger s/km) liegt oben */}
                <YAxis
                  {...Y_ACHSE}
                  type="number"
                  reversed
                  domain={sicht.y.domain}
                  ticks={sicht.y.ticks}
                  interval={0}
                  tickFormatter={(v: number) => formatPaceKurz(v)}
                />
                <Tooltip content={<AerobTooltip ziel={ziel} />} cursor={CURSOR_LINIE} />
                <Scatter data={sicht.geschaetzt} dataKey="pace" shape={PUNKT_GESCHAETZT} isAnimationActive={false} />
                <Scatter data={sicht.gemessen} dataKey="pace" shape={PUNKT_GEMESSEN} isAnimationActive={false} />
                <Line {...LINIE_NEBEN} data={sicht.lin} dataKey="gestrichelt" stroke={FARBE} activeDot={false} connectNulls={false} />
                <Line
                  {...LINIE}
                  data={sicht.lin}
                  dataKey="voll"
                  stroke={FARBE}
                  activeDot={{ ...AKTIVER_PUNKT, fill: FARBE }}
                  connectNulls={false}
                />
                {aktuell?.paceSKm != null && (
                  <ReferenceDot x={mittag(heute)} y={aktuell.paceSKm} r={4} fill={FARBE} stroke="var(--background)" strokeWidth={2} />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <Legende
            eintraege={[
              { art: "punkt", farbe: FARBE, label: "direkt gemessen" },
              { art: "ring", farbe: FARBE, label: "über das Modell normiert" },
              { art: "linie", farbe: FARBE, label: "28-Tage-Trend" },
              { art: "strich", farbe: FARBE, label: "ohne neue Messung" },
            ]}
          />
        </div>
      )}

      <DiagrammHinweis>
        {aktuell && aktuell.anzahl > 0 ? (
          <p>
            Basierend auf {aktuell.anzahl} geeigneten {aktuell.anzahl === 1 ? "Lauf" : "Läufen"} aus den letzten 28 Tagen.
          </p>
        ) : letzterWert ? (
          <p>In den letzten 28 Tagen kein geeigneter Lauf — der Trend endet am {formatDatumLang(letzterWert.datum)}.</p>
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
            {daten.modell.lo} und {daten.modell.hi} bpm ({daten.modell.laeufe} Läufe). Höhenkorrigiert (GAP), ohne Aufwärmen,
            Pausen und Intervalle.
          </p>
        ) : (
          <p>
            Noch nicht genügend vergleichbare Läufe für eine zuverlässige Normalisierung — gezeigt werden nur Läufe, die direkt am
            Referenzpuls (± 3 bpm) gelaufen wurden.
          </p>
        )}
        {t.offen > 0 && <p className="text-status-yellow">Analyse läuft: {t.offen} Läufe werden noch ausgewertet.</p>}
      </DiagrammHinweis>
    </div>
  );
}
