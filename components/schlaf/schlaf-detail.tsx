"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  ComposedChart,
  Line,
  Area,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Info, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { addTage, formatDatumLang } from "@/lib/format";
import {
  formatDauer,
  phasenSegmente,
  phaseZu,
  PHASEN,
  PHASEN_LABEL,
  type PhasenName,
  type SchlafAnalyse,
  type VergleichsWert,
} from "@/lib/engine/schlaf";
import type { SchlafEpoche, SchlafMetrik, SchlafZeitreihe } from "@/lib/engine/schlaf-parser";
import { minutenRaster, rasterReihe, stundenTicks, type RasterZeile } from "@/lib/engine/schlaf-raster";
import { PHASEN_FARBE, PHASEN_STUFE } from "./farben";
import { PhasenBalken } from "./phasen-balken";

/* ------------------------------------------------------------------ */
/* Daten                                                               */
/* ------------------------------------------------------------------ */

interface Detail {
  datum: string;
  vorher: string | null;
  nachher: string | null;
  epochen: SchlafEpoche[];
  zeitreihen: Partial<Record<SchlafMetrik, SchlafZeitreihe>>;
  analyse: SchlafAnalyse;
  phasenMittel30: Record<PhasenName, number | null>;
}

type Zustand = { status: "laden" } | { status: "fehler" } | { status: "leer" } | { status: "ok"; detail: Detail };

const TITEL = "text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground";
const ACHSE = { fontSize: 10, fill: "var(--muted-foreground)" };
const CHART_H = "h-44"; // 176 px auf dem Handy

const UHR = new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit" });

/* ------------------------------------------------------------------ */
/* Seite                                                               */
/* ------------------------------------------------------------------ */

export function SchlafDetailAnsicht({ datum, heute }: { datum: string; heute: string }) {
  const [zustand, setZustand] = useState<Zustand>({ status: "laden" });
  const [versuch, setVersuch] = useState(0);

  useEffect(() => {
    let aktiv = true;
    setZustand({ status: "laden" });
    fetch(`/api/schlaf/${datum}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { detail: Detail | null }) => {
        if (!aktiv) return;
        setZustand(j.detail ? { status: "ok", detail: j.detail } : { status: "leer" });
      })
      .catch(() => aktiv && setZustand({ status: "fehler" }));
    return () => {
      aktiv = false;
    };
  }, [datum, versuch]);

  const d = zustand.status === "ok" ? zustand.detail : null;
  const laedt = zustand.status === "laden";

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <Navigation datum={datum} heute={heute} />

      {zustand.status === "fehler" && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm">
            <span>Schlafdaten konnten nicht geladen werden.</span>
            <button
              type="button"
              onClick={() => setVersuch((v) => v + 1)}
              className="min-h-11 rounded-lg border border-border px-4 text-sm"
            >
              Erneut laden
            </button>
          </CardContent>
        </Card>
      )}
      {zustand.status === "leer" && (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            Keine Schlafdaten für die Nacht auf {formatDatumLang(datum)}. Entweder wurde die Uhr nicht getragen, oder die
            Nacht ist noch nicht synchronisiert.
          </CardContent>
        </Card>
      )}

      {(laedt || d) && (
        <>
          <KopfKarte d={d} />
          <HypnogrammKarte d={d} />
          <PhasenKarte d={d} />
          <HrKarte d={d} />
          <Spo2Karte d={d} />
          <AtemKarte d={d} />
          <HrvKarte d={d} />
          <StressKarte d={d} />
          <BodyBatteryKarte d={d} />
          <BewegungKarte d={d} />
          <VergleichKarte d={d} />
          <AnalyseKarte d={d} />
          <QualitaetKarte d={d} />
        </>
      )}

      <p className="flex gap-2 px-1 pb-6 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        Alle Werte sind Schätzungen der Uhr, keine medizinische Messung. Bei Beschwerden ärztlich abklären.
      </p>
    </div>
  );
}

function Navigation({ datum, heute }: { datum: string; heute: string }) {
  const router = useRouter();
  const gestern = addTage(datum, -1);
  const morgen = addTage(datum, 1);
  const knopf =
    "flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-lg border border-border px-3 text-sm transition-colors hover:bg-muted";
  return (
    <div className="space-y-2">
      <div className={TITEL}>Schlaf · Nacht auf</div>
      <div className="flex items-center gap-2">
        <Link href={`/schlaf/${gestern}`} className={knopf} aria-label="Vorherige Nacht">
          <ChevronLeft className="size-4" />
          <span className="hidden sm:inline">Vorher</span>
        </Link>
        <input
          type="date"
          value={datum}
          max={heute}
          onChange={(e) => e.target.value && router.push(`/schlaf/${e.target.value}`)}
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-border bg-card px-3 text-sm"
          aria-label="Datum wählen (Aufwachdatum)"
        />
        {datum < heute ? (
          <Link href={`/schlaf/${morgen}`} className={knopf} aria-label="Nächste Nacht">
            <span className="hidden sm:inline">Nachher</span>
            <ChevronRight className="size-4" />
          </Link>
        ) : (
          <span className={`${knopf} pointer-events-none opacity-40`} aria-hidden>
            <ChevronRight className="size-4" />
          </span>
        )}
      </div>
      <div className="text-sm text-muted-foreground">{formatDatumLang(datum)}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bausteine                                                           */
/* ------------------------------------------------------------------ */

function Karte({ titel, d, children, hoehe = "h-44" }: { titel: string; d: Detail | null; children: (d: Detail) => React.ReactNode; hoehe?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className={TITEL}>{titel}</CardTitle>
      </CardHeader>
      <CardContent>{d ? children(d) : <Skeleton className={`${hoehe} w-full`} />}</CardContent>
    </Card>
  );
}

function NichtVerfuegbar({ text }: { text: string }) {
  return <p className="rounded-lg bg-muted px-3 py-4 text-sm text-muted-foreground">{text}</p>;
}

function Kennzahl({ label, wert, einheit }: { label: string; wert: string | number | null; einheit?: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-muted p-2.5">
      <div className="min-h-[2lh] break-words text-[10px] uppercase leading-tight tracking-wider text-muted-foreground [hyphens:auto]">{label}</div>
      <div className="stat-display truncate text-lg leading-tight">
        {wert ?? "–"}
        {wert != null && einheit && <span className="ml-1 text-xs text-muted-foreground">{einheit}</span>}
      </div>
    </div>
  );
}

/** Gemeinsame Zeitachse: Sekunden seit Schlafstart, Ticks zu vollen Stunden */
function useAchse(d: Detail) {
  return useMemo(() => {
    const start = d.analyse.zusammenfassung.startMs ?? 0;
    const endeMs = d.analyse.zusammenfassung.endeMs ?? start;
    const endeS = Math.max(60, (endeMs - start) / 1000);
    const uhr = (t: number) => UHR.format(new Date(start + t * 1000));
    const seg = phasenSegmente(d.epochen).map((s) => ({
      x1: Math.max(0, (s.startMs - start) / 1000),
      x2: Math.min(endeS, (s.endeMs - start) / 1000),
      phase: s.phase,
    }));
    return { start, endeS, uhr, ticks: stundenTicks(start, endeS), seg };
  }, [d]);
}

type Achse = ReturnType<typeof useAchse>;

function XAchse({ achse }: { achse: Achse }) {
  return (
    <XAxis
      dataKey="t"
      type="number"
      domain={[0, achse.endeS]}
      ticks={achse.ticks}
      tickFormatter={achse.uhr}
      tick={ACHSE}
      interval="preserveStartEnd"
      minTickGap={24}
    />
  );
}

function TooltipBox({ active, payload, label, achse, einheit, name }: { active?: boolean; payload?: { value?: number | null }[]; label?: number; achse: Achse; einheit: string; name: string }) {
  if (!active || label == null) return null;
  const wert = payload?.find((p) => p.value != null)?.value;
  const phase = achse.seg.find((s) => label >= s.x1 && label < s.x2)?.phase ?? null;
  return (
    <div className="rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-sm">
      <div className="text-muted-foreground">
        {achse.uhr(label)}
        {phase && ` · ${PHASEN_LABEL[phase]}`}
      </div>
      <div className="stat-mono">
        {name}: {wert != null ? `${Math.round(wert * 10) / 10} ${einheit}` : "kein Wert"}
      </div>
    </div>
  );
}

function EinheitZeile({ einheit }: { einheit: string }) {
  return <div className="mb-0.5 text-[10px] text-muted-foreground">Einheit: {einheit} · Uhrzeit</div>;
}

function PhasenHintergrund({ achse }: { achse: Achse }) {
  return (
    <>
      {achse.seg.map((s, i) => (
        <ReferenceArea key={i} x1={s.x1} x2={s.x2} fill={PHASEN_FARBE[s.phase]} fillOpacity={0.14} stroke="none" ifOverflow="hidden" />
      ))}
    </>
  );
}

/** Zeitreihen-Chart auf dem gemeinsamen Minutenraster */
function ReihenChart({
  d,
  metrik,
  name,
  einheit,
  farbe = "var(--primary)",
  flaeche = false,
  phasen = false,
  yDomain,
  extra,
  minMax = false,
}: {
  d: Detail;
  metrik: SchlafMetrik;
  name: string;
  einheit: string;
  farbe?: string;
  flaeche?: boolean;
  phasen?: boolean;
  yDomain?: [number | string, number | string];
  extra?: React.ReactNode;
  minMax?: boolean;
}) {
  const achse = useAchse(d);
  const reihe = d.zeitreihen[metrik];
  const luecke = Math.max(360, 3 * (reihe?.rohAufloesungS ?? 60));
  const { zeilen, segmente } = useMemo(() => rasterReihe(reihe?.punkte, achse.endeS, luecke), [reihe, achse.endeS, luecke]);
  const mm = useMemo(() => {
    const p = (reihe?.punkte ?? []).filter(([t]) => t >= 0 && t <= achse.endeS);
    if (!p.length) return null;
    let min = p[0];
    let max = p[0];
    for (const x of p) {
      if (x[1] < min[1]) min = x;
      if (x[1] > max[1]) max = x;
    }
    const auf = (x: [number, number]) => [Math.round(x[0] / 60) * 60, x[1]] as const;
    return { min: auf(min), max: auf(max) };
  }, [reihe, achse.endeS]);
  const rechts = (x: number) => (x > achse.endeS * 0.75 ? "left" : "right");
  return (
    <div>
    <EinheitZeile einheit={einheit} />
    <div className={`${CHART_H} w-full`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={zeilen} syncId="schlaf" margin={{ top: 8, right: 8, bottom: 0, left: -14 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          {phasen && <PhasenHintergrund achse={achse} />}
          <XAchse achse={achse} />
          <YAxis tick={ACHSE} domain={yDomain ?? ["auto", "auto"]} width={44} />
          <Tooltip content={<TooltipBox achse={achse} einheit={einheit} name={name} />} />
          {extra}
          {segmente.map((k) =>
            flaeche ? (
              <Area key={k} dataKey={k} type="monotone" stroke={farbe} fill={farbe} fillOpacity={0.15} strokeWidth={1.5} connectNulls dot={false} isAnimationActive={false} />
            ) : (
              <Line key={k} dataKey={k} type="monotone" stroke={farbe} strokeWidth={1.5} connectNulls dot={false} isAnimationActive={false} />
            )
          )}
          {minMax && mm && (
            <>
              <ReferenceDot x={mm.min[0]} y={mm.min[1]} r={3.5} fill="var(--chart-2)" stroke="var(--card)" label={{ value: `Min ${mm.min[1]}`, position: rechts(mm.min[0]), fontSize: 10, fill: "var(--muted-foreground)" }} />
              <ReferenceDot x={mm.max[0]} y={mm.max[1]} r={3.5} fill="var(--status-orange)" stroke="var(--card)" label={{ value: `Max ${mm.max[1]}`, position: rechts(mm.max[0]), fontSize: 10, fill: "var(--muted-foreground)" }} />
            </>
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Karten                                                              */
/* ------------------------------------------------------------------ */

function KopfKarte({ d }: { d: Detail | null }) {
  if (!d)
    return (
      <Card>
        <CardContent className="space-y-3 py-4">
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  const a = d.analyse;
  const z = a.zusammenfassung;
  const ampel =
    a.ampel === "gruen" ? "bg-status-green" : a.ampel === "gelb" ? "bg-status-yellow" : a.ampel === "rot" ? "bg-status-red" : "bg-muted";
  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="stat-display text-4xl leading-none">{formatDauer(z.dauerS)}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {z.startUhr && z.endeUhr ? `Im Bett ${z.startUhr}–${z.endeUhr}` : "Bettzeit nicht verfügbar"}
              {z.bettzeitS != null && ` · ${formatDauer(z.bettzeitS)}`}
            </div>
          </div>
          <div className="text-right">
            <div className="flex items-center justify-end gap-1.5">
              <span className={`size-2.5 rounded-full ${ampel}`} aria-hidden />
              <span className="stat-display text-3xl leading-none">{a.garminScore != null ? Math.round(a.garminScore) : "–"}</span>
            </div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Garmin-Score</div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Kennzahl label="Effizienz" wert={z.effizienzProz != null ? Math.round(z.effizienzProz) : null} einheit="%" />
          <Kennzahl label="Wachphasen" wert={z.anzahlWachphasen} />
          <Kennzahl label="Längste wach" wert={z.laengsteWachphaseS != null ? Math.round(z.laengsteWachphaseS / 60) : null} einheit="min" />
          <Kennzahl label="Eingeschlafen" wert={z.einschlafUhr} />
          <Kennzahl label="Aufgewacht" wert={z.aufwachUhr} />
          <Kennzahl label="Regel-Bewertung" wert={a.regelBewertung?.punkte ?? null} einheit="/100" />
        </div>
        <p className="text-sm leading-snug">{a.fazit}</p>
        {a.warnungen.length > 0 && (
          <p className="flex gap-2 rounded-lg border border-status-orange/40 bg-status-orange/5 p-2.5 text-xs">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-status-orange" />
            Auffällige Uhr-Werte in dieser Nacht — Hinweis siehe unten bei der Sauerstoffsättigung bzw. Atemfrequenz.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function HypnogrammKarte({ d }: { d: Detail | null }) {
  return (
    <Karte titel="Hypnogramm" d={d}>
      {(d) => <Hypnogramm d={d} />}
    </Karte>
  );
}

function Hypnogramm({ d }: { d: Detail }) {
  const achse = useAchse(d);
  const zeilen = useMemo(() => {
    const seg = phasenSegmente(d.epochen);
    return minutenRaster(achse.endeS).map((t) => {
      const p = phaseZu(seg, achse.start + t * 1000);
      return { t, stufe: p == null ? null : PHASEN_STUFE[p] } as RasterZeile;
    });
  }, [d.epochen, achse]);
  if (!achse.seg.length) return <NichtVerfuegbar text="Keine Schlafphasen für diese Nacht." />;
  const stufenName = (v: number) => PHASEN_LABEL[(Object.keys(PHASEN_STUFE) as PhasenName[]).find((p) => PHASEN_STUFE[p] === v) ?? "leicht"];
  return (
    <>
      <div className={`${CHART_H} w-full`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={zeilen} syncId="schlaf" margin={{ top: 8, right: 8, bottom: 0, left: -6 }}>
            <PhasenHintergrund achse={achse} />
            {achse.seg
              .filter((s) => s.phase === "wach")
              .map((s, i) => (
                <ReferenceArea key={`w${i}`} x1={s.x1} x2={s.x2} y1={2.5} y2={3.5} fill={PHASEN_FARBE.wach} fillOpacity={0.6} stroke="none" />
              ))}
            <XAchse achse={achse} />
            <YAxis
              type="number"
              domain={[-0.5, 3.5]}
              ticks={[0, 1, 2, 3]}
              tickFormatter={stufenName}
              tick={ACHSE}
              width={48}
            />
            <Tooltip
              content={({ active, label }) =>
                active && label != null ? (
                  <div className="rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-sm">
                    <div className="text-muted-foreground">{achse.uhr(Number(label))}</div>
                    <div>{(() => {
                      const p = phaseZu(phasenSegmente(d.epochen), achse.start + Number(label) * 1000);
                      return p ? PHASEN_LABEL[p] : "keine Phase";
                    })()}</div>
                  </div>
                ) : null
              }
            />
            <Line dataKey="stufe" type="stepAfter" stroke="var(--foreground)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        {PHASEN.map((p) => (
          <span key={p} className="flex items-center gap-1">
            <span className="size-2 rounded-full" style={{ background: PHASEN_FARBE[p] }} />
            {PHASEN_LABEL[p]}
          </span>
        ))}
        <span>· Wachphasen oben markiert</span>
      </div>
    </>
  );
}

function PhasenKarte({ d }: { d: Detail | null }) {
  return (
    <Karte titel="Phasenverteilung" d={d} hoehe="h-28">
      {(d) => {
        const ph = d.analyse.phasen;
        return (
          <div className="space-y-3">
            <PhasenBalken phasen={ph} legende={false} />
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="py-1 font-medium">Phase</th>
                    <th className="py-1 font-medium">Minuten</th>
                    <th className="py-1 font-medium">Anteil</th>
                    <th className="py-1 font-medium">Richtwert</th>
                    <th className="py-1 font-medium">Ø 30 T.</th>
                  </tr>
                </thead>
                <tbody className="stat-mono">
                  {PHASEN.map((p) => (
                    <tr key={p} className="border-t border-border">
                      <td className="py-1.5 font-sans">
                        <span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: PHASEN_FARBE[p] }} />
                        {PHASEN_LABEL[p]}
                      </td>
                      <td>{ph[p].minuten ?? "–"}</td>
                      <td>{ph[p].prozent != null ? `${Math.round(ph[p].prozent!)} %` : "–"}</td>
                      <td>{ph[p].richtwert ? `${ph[p].richtwert!.von}–${ph[p].richtwert!.bis} %` : "–"}</td>
                      <td>{d.phasenMittel30[p] != null ? `${d.phasenMittel30[p]} min` : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Richtwerte sind Orientierung, keine Diagnose
              {ph.tief.richtwertQuelle === "garmin" ? " (persönliche Zielbereiche von Garmin)." : " (allgemeine Werte für Erwachsene)."} Tief, Leicht
              und REM in % der Schlafzeit, Wach in % der Bettzeit.
            </p>
          </div>
        );
      }}
    </Karte>
  );
}

function HrKarte({ d }: { d: Detail | null }) {
  return (
    <Karte titel="Herzfrequenz in der Nacht" d={d}>
      {(d) => {
        const hr = d.analyse.hr;
        if (!hr) return <NichtVerfuegbar text="Keine Herzfrequenz-Daten für diese Nacht." />;
        return (
          <div className="space-y-3">
            <ReihenChart d={d} metrik="hr" name="HF" einheit="bpm" phasen minMax farbe="var(--status-red)" />
            <div className="grid grid-cols-3 gap-2">
              <Kennzahl label="Min" wert={hr.min} einheit="bpm" />
              <Kennzahl label="Mittel" wert={Math.round(hr.mittel)} einheit="bpm" />
              <Kennzahl label="Max" wert={hr.max} einheit="bpm" />
              <Kennzahl label="Nachtabfall" wert={hr.nachtabfallProz != null ? Math.round(hr.nachtabfallProz) : null} einheit="%" />
              <Kennzahl label="Tiefste im Tiefschlaf" wert={hr.tiefsteImTiefschlaf} einheit="bpm" />
              <Kennzahl label="Ruhepuls (Garmin)" wert={d.analyse.vergleich.find((v) => v.metrik === "ruhepuls")?.heute ?? null} einheit="bpm" />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Nachtabfall = Mittel der ersten 30 Min nach dem Einschlafen gegen die Nachtmitte. Hintergrund nach Schlafphase eingefärbt.
            </p>
          </div>
        );
      }}
    </Karte>
  );
}

function Spo2Karte({ d }: { d: Detail | null }) {
  return (
    <Karte titel="Sauerstoffsättigung (SpO2)" d={d}>
      {(d) => {
        const s = d.analyse.spo2;
        const warn = d.analyse.warnungen.filter((w) => w.includes("Sauerstoff"));
        if (!s) return <NichtVerfuegbar text="Keine SpO2-Daten für diese Nacht. Die Messung im Schlaf ist auf der Uhr evtl. ausgeschaltet." />;
        return (
          <div className="space-y-3">
            <ReihenChart
              d={d}
              metrik="spo2"
              name="SpO2"
              einheit="%"
              farbe="var(--chart-2)"
              yDomain={[Math.min(85, s.min - 1), 100]}
              minMax
              extra={
                <>
                  <ReferenceLine y={92} stroke="var(--status-yellow)" strokeDasharray="4 3" />
                  <ReferenceLine y={90} stroke="var(--status-orange)" strokeDasharray="4 3" />
                </>
              }
            />
            <div className="grid grid-cols-3 gap-2">
              <Kennzahl label="Mittel" wert={Math.round(s.mittel)} einheit="%" />
              <Kennzahl label="Minimum" wert={s.min} einheit="%" />
              <Kennzahl label="Abfälle < 92 %" wert={s.abfaelleUnter92} />
              <Kennzahl label="Zeit < 92 %" wert={s.minutenUnter92} einheit="min" />
              <Kennzahl label="Zeit < 90 %" wert={s.minutenUnter90} einheit="min" />
              <Kennzahl label="Abfälle < 90 %" wert={s.abfaelleUnter90} />
            </div>
            {warn.map((w, i) => (
              <p key={i} className="flex gap-2 rounded-lg border border-status-orange/40 bg-status-orange/5 p-2.5 text-xs leading-snug">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-status-orange" />
                {w}
              </p>
            ))}
            <p className="text-[11px] text-muted-foreground">Gestrichelt: 92 % (gelb) und 90 % (orange). SpO2 ist eine Uhr-Schätzung (optischer Sensor am Handgelenk), kein medizinischer Befund.</p>
          </div>
        );
      }}
    </Karte>
  );
}

function AtemKarte({ d }: { d: Detail | null }) {
  return (
    <Karte titel="Atemfrequenz" d={d}>
      {(d) => {
        const a = d.analyse.atem;
        if (!a) return <NichtVerfuegbar text="Keine Atemfrequenz-Daten für diese Nacht." />;
        const warn = d.analyse.warnungen.filter((w) => w.includes("Atemfrequenz"));
        const balken = PHASEN.map((p) => ({ phase: p, name: PHASEN_LABEL[p], wert: a.jePhase[p], abw: a.jePhase[p] != null ? Math.round((a.jePhase[p]! - a.mittel) * 10) / 10 : null }));
        return (
          <div className="space-y-3">
            <ReihenChart d={d} metrik="atemfrequenz" name="Atmung" einheit="Atemzüge/min" phasen farbe="var(--chart-3)" />
            <div className="grid grid-cols-4 gap-2">
              <Kennzahl label="Mittel" wert={a.mittel} />
              <Kennzahl label="Min" wert={a.min} />
              <Kennzahl label="Max" wert={a.max} />
              <Kennzahl label="Schwankung" wert={`±${a.stdAbw}`} />
            </div>
            <div>
              <div className="mb-1 text-[11px] text-muted-foreground">Atemfrequenz je Schlafphase (Atemzüge/min, Abweichung zum Nachtmittel {a.mittel})</div>
              <div className="h-36 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={balken} margin={{ top: 16, right: 8, bottom: 0, left: -14 }}>
                    <XAxis dataKey="name" tick={ACHSE} />
                    <YAxis tick={ACHSE} width={44} domain={[(min: number) => Math.floor(min - 2), (max: number) => Math.ceil(max + 1)]} />
                    <ReferenceLine y={a.mittel} stroke="var(--muted-foreground)" strokeDasharray="4 3" />
                    <Tooltip
                      cursor={{ fill: "var(--muted)" }}
                      content={({ active, payload }) => {
                        const z = payload?.[0]?.payload as (typeof balken)[number] | undefined;
                        return active && z ? (
                          <div className="rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs">
                            {z.name}: {z.wert != null ? `${z.wert} Atemzüge/min (${z.abw! > 0 ? "+" : ""}${z.abw})` : "kein Wert"}
                          </div>
                        ) : null;
                      }}
                    />
                    <Bar dataKey="wert" radius={[4, 4, 0, 0]} isAnimationActive={false} label={{ position: "top", fontSize: 10, fill: "var(--muted-foreground)", formatter: (v: unknown) => (v == null ? "–" : String(v)) }}>
                      {balken.map((b) => (
                        <Cell key={b.phase} fill={PHASEN_FARBE[b.phase]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            {warn.map((w, i) => (
              <p key={i} className="flex gap-2 rounded-lg border border-status-orange/40 bg-status-orange/5 p-2.5 text-xs leading-snug">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-status-orange" />
                {w}
              </p>
            ))}
          </div>
        );
      }}
    </Karte>
  );
}

function HrvKarte({ d }: { d: Detail | null }) {
  return (
    <Karte titel="HRV in der Nacht" d={d}>
      {(d) => {
        const h = d.analyse.hrv;
        if (!h) return <NichtVerfuegbar text="Keine HRV-Daten für diese Nacht." />;
        const text = { unter: "unter deinem ausgeglichenen Bereich", im: "im ausgeglichenen Bereich", ueber: "über deinem ausgeglichenen Bereich" };
        return (
          <div className="space-y-3">
            <ReihenChart
              d={d}
              metrik="hrv"
              name="HRV"
              einheit="ms"
              farbe="var(--primary)"
              extra={
                h.band ? (
                  <ReferenceArea y1={h.band.von} y2={h.band.bis} fill="var(--status-green)" fillOpacity={0.1} stroke="none" ifOverflow="extendDomain" />
                ) : null
              }
            />
            <div className="grid grid-cols-3 gap-2">
              <Kennzahl label="Mittel" wert={Math.round(h.mittel)} einheit="ms" />
              <Kennzahl label="Bereich" wert={h.band ? `${h.band.von}–${h.band.bis}` : null} einheit="ms" />
              <Kennzahl label="Max (5 Min)" wert={h.max} einheit="ms" />
            </div>
            <p className="text-xs">
              {h.einordnung ? `Nachtmittel ${text[h.einordnung]}.` : "Kein persönlicher Bereich von Garmin verfügbar."}
              <span className="text-muted-foreground"> 5-Minuten-Werte; grünes Band = ausgeglichener Bereich laut Garmin.</span>
            </p>
          </div>
        );
      }}
    </Karte>
  );
}

function StressKarte({ d }: { d: Detail | null }) {
  return (
    <Karte titel="Stress während des Schlafs" d={d}>
      {(d) => {
        const s = d.analyse.stress;
        if (!s) return <NichtVerfuegbar text="Keine Stress-Daten für diese Nacht." />;
        return (
          <div className="space-y-2">
            <ReihenChart d={d} metrik="stress" name="Stress" einheit="0–100" farbe="var(--status-yellow)" flaeche yDomain={[0, 100]} />
            <p className="text-xs text-muted-foreground">
              Mittel <span className="stat-mono text-foreground">{Math.round(s.mittel)}</span>, Max <span className="stat-mono text-foreground">{s.max}</span> (Garmin-Skala 0–100, niedrig = entspannt).
            </p>
          </div>
        );
      }}
    </Karte>
  );
}

function BodyBatteryKarte({ d }: { d: Detail | null }) {
  return (
    <Karte titel="Body Battery in der Nacht" d={d}>
      {(d) => {
        const b = d.analyse.bodyBattery;
        if (!b) return <NichtVerfuegbar text="Keine Body-Battery-Daten für diese Nacht." />;
        return (
          <div className="space-y-2">
            <ReihenChart d={d} metrik="body_battery" name="Body Battery" einheit="0–100" farbe="var(--status-green)" flaeche yDomain={[0, 100]} />
            <p className="text-xs text-muted-foreground">
              Von <span className="stat-mono text-foreground">{b.start}</span> auf <span className="stat-mono text-foreground">{b.ende}</span> — Aufladung{" "}
              <span className="stat-mono text-foreground">{b.aufladung > 0 ? "+" : ""}{b.aufladung}</span>.
            </p>
          </div>
        );
      }}
    </Karte>
  );
}

function BewegungKarte({ d }: { d: Detail | null }) {
  return (
    <Karte titel="Bewegung und Unruhe" d={d}>
      {(d) => <Bewegung d={d} />}
    </Karte>
  );
}

function Bewegung({ d }: { d: Detail }) {
  const achse = useAchse(d);
  const b = d.analyse.bewegung;
  const zeilen = useMemo(() => {
    const roh = rasterReihe(d.zeitreihen.bewegung?.punkte, achse.endeS, 120).zeilen;
    return roh.map((z) => ({ t: z.t, v: (Object.entries(z).find(([k]) => k !== "t")?.[1] as number | undefined) ?? null }));
  }, [d.zeitreihen.bewegung, achse.endeS]);
  const unruhe = d.epochen
    .filter((e) => e.art === "bewegung")
    .map((e) => ({ t: Math.round((e.startMs - achse.start) / 60000) * 60, level: e.level }))
    .filter((e) => e.t >= 0 && e.t <= achse.endeS);
  if (!b) return <NichtVerfuegbar text="Keine Bewegungsdaten für diese Nacht." />;
  return (
    <div className="space-y-2">
      {d.zeitreihen.bewegung ? (
        <div>
        <EinheitZeile einheit="Bewegungsstärke (Garmin, 0–8)" />
        <div className={`${CHART_H} w-full`}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={zeilen} syncId="schlaf" margin={{ top: 8, right: 8, bottom: 0, left: -14 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAchse achse={achse} />
              <YAxis tick={ACHSE} width={44} />
              <Tooltip content={<TooltipBox achse={achse} einheit="" name="Bewegung" />} />
              <Bar dataKey="v" fill="var(--schlaf-leicht)" isAnimationActive={false} />
              {unruhe.map((u, i) => (
                <ReferenceLine key={i} x={u.t} stroke="var(--status-orange)" strokeOpacity={0.35 + u.level * 0.2} />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        </div>
      ) : (
        <NichtVerfuegbar text="Kein Bewegungsverlauf für diese Nacht (nur unruhige Momente)." />
      )}
      <p className="text-xs text-muted-foreground">
        <span className="stat-mono text-foreground">{b.bewegungsphasen ?? "–"}</span> Bewegungsphasen ·{" "}
        <span className="stat-mono text-foreground">{b.unruhigeMomente}</span> unruhige Momente (orange Linien, Stärke 1–3).
      </p>
    </div>
  );
}

function Pfeil({ v, fenster }: { v: VergleichsWert; fenster: 7 | 30 }) {
  const r = fenster === 7 ? v.richtung7 : v.richtung30;
  const bew = fenster === 7 ? v.bewertung7 : v.bewertung30;
  const abw = fenster === 7 ? v.abw7Proz : v.abw30Proz;
  if (abw == null || r == null) return <span className="text-muted-foreground">–</span>;
  const Icon = r === "hoch" ? ArrowUpRight : r === "runter" ? ArrowDownRight : Minus;
  const farbe = bew === "gut" ? "text-status-green" : bew === "schlecht" ? "text-status-orange" : "text-muted-foreground";
  return (
    <span className={`inline-flex items-center gap-0.5 whitespace-nowrap ${farbe}`}>
      <Icon className="size-3.5" />
      {abw > 0 ? "+" : ""}
      {Math.round(abw)} %
    </span>
  );
}

function wertText(v: VergleichsWert, x: number | null) {
  if (x == null) return "–";
  if (v.metrik === "dauerS") return formatDauer(x);
  const e = v.einheit === "Atemzüge/min" ? "/min" : v.einheit;
  return `${Math.round(x * 10) / 10}${e ? ` ${e}` : ""}`;
}

function VergleichKarte({ d }: { d: Detail | null }) {
  return (
    <Karte titel="Vergleich mit 7 und 30 Tagen" d={d} hoehe="h-56">
      {(d) => (
        <div className="space-y-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {d.analyse.vergleich.map((v) => (
              <div key={v.metrik} className="rounded-lg bg-muted p-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">{v.label}</span>
                  <span className="stat-display text-lg leading-none">{wertText(v, v.heute)}</span>
                </div>
                <div className="mt-1.5 grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <div className="text-muted-foreground">Ø 7 T. {v.n7 ? `(${v.n7})` : ""}</div>
                    <div className="flex flex-wrap items-center gap-x-1.5">
                      <span className="stat-mono">{wertText(v, v.mittel7)}</span>
                      <Pfeil v={v} fenster={7} />
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Ø 30 T. {v.n30 ? `(${v.n30})` : ""}</div>
                    <div className="flex flex-wrap items-center gap-x-1.5">
                      <span className="stat-mono">{wertText(v, v.mittel30)}</span>
                      <Pfeil v={v} fenster={30} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Mittel ohne die betrachtete Nacht, nur Nächte mit Wert (Anzahl in Klammern). Grün = günstige Richtung, orange = ungünstige.
          </p>
        </div>
      )}
    </Karte>
  );
}

function AnalyseKarte({ d }: { d: Detail | null }) {
  return (
    <Karte titel="Analyse" d={d} hoehe="h-40">
      {(d) => {
        const a = d.analyse;
        return (
          <div className="space-y-4 text-sm leading-snug">
            <section>
              <h3 className="mb-1 font-semibold">Zusammenfassung</h3>
              <p>{a.fazit}</p>
            </section>
            <section>
              <h3 className="mb-1 font-semibold">Auffälligkeiten</h3>
              {a.auffaelligkeiten.length ? (
                <ul className="list-disc space-y-1 pl-5">
                  {a.auffaelligkeiten.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">Keine besonderen Auffälligkeiten.</p>
              )}
            </section>
            <section>
              <h3 className="mb-1 font-semibold">Was das für Training und EP bedeutet</h3>
              <ul className="list-disc space-y-1 pl-5">
                {a.empfehlungen.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </section>
            {a.regelBewertung && (
              <section>
                <h3 className="mb-1 font-semibold">Regel-Bewertung {a.regelBewertung.punkte}/100</h3>
                <p className="mb-1 text-xs text-muted-foreground">
                  Eigene, transparente Punkte nach festen Regeln — ersetzt nicht den Garmin-Score.
                </p>
                <ul className="space-y-0.5 text-xs">
                  {a.regelBewertung.teile.map((t) => (
                    <li key={t.regel} className="flex justify-between gap-2">
                      <span className="text-muted-foreground">{t.regel}</span>
                      <span className="stat-mono whitespace-nowrap">
                        {t.punkte}/{t.max}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        );
      }}
    </Karte>
  );
}

function QualitaetKarte({ d }: { d: Detail | null }) {
  return (
    <Karte titel="Datenqualität" d={d} hoehe="h-32">
      {(d) => (
        <div className="space-y-2">
          {d.analyse.datenqualitaet.map((q) => (
            <div key={q.metrik} className="space-y-1">
              <div className="flex justify-between gap-2 text-xs">
                <span>{q.label}</span>
                <span className={`stat-mono whitespace-nowrap ${q.status === "nicht verfügbar" ? "text-muted-foreground" : q.status === "lueckenhaft" ? "text-status-orange" : ""}`}>
                  {q.status === "nicht verfügbar" ? "nicht verfügbar" : `${q.proz} %${q.status === "lueckenhaft" ? " · lückenhaft" : ""}`}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${q.proz}%` }} />
              </div>
            </div>
          ))}
          <p className="pt-1 text-[11px] text-muted-foreground">
            Anteil vorhandener Messpunkte gegenüber der üblichen Auflösung der Uhr über die Bettzeit.
          </p>
        </div>
      )}
    </Karte>
  );
}
