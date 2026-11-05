/**
 * Schlaf-Analyse-Engine (Auftrag D3). Reine, deterministische Funktionen auf
 * dem normalisierten Format aus schlaf-parser.ts — ohne DB, ohne Systemzeit.
 *
 * Alle Aussagen sind Uhr-Schätzungen und Richtwerte, keine Diagnose. Fehlende
 * Daten bleiben `null` und werden im UI als „nicht verfügbar" gezeigt.
 */

import { addTage, tageDiff } from "@/lib/format";
import { EP_DATUM, EP_TAG_2, TAPER_START } from "@/lib/ep/konstanten";
import {
  PHASE,
  type HrvBaseline,
  type SchlafEpoche,
  type SchlafMetrik,
  type SchlafZeitreihe,
} from "./schlaf-parser";

/* ------------------------------------------------------------------ */
/* Eingaben                                                            */
/* ------------------------------------------------------------------ */

export type PhasenName = "tief" | "leicht" | "rem" | "wach";
export const PHASEN: PhasenName[] = ["tief", "leicht", "rem", "wach"];
export const PHASEN_LABEL: Record<PhasenName, string> = {
  tief: "Tief",
  leicht: "Leicht",
  rem: "REM",
  wach: "Wach",
};

export interface Bereich {
  von: number;
  bis: number;
}

/** Eine Nacht, wie sie die Analyse braucht (aus sleep_nights + Epochen + Zeitreihen) */
export interface SchlafNachtDaten {
  datum: string; // Aufwachdatum
  schlafStartMs: number | null;
  schlafEndeMs: number | null;
  garminScore: number | null;
  schlafDauerS: number | null;
  tiefS: number | null;
  leichtS: number | null;
  remS: number | null;
  wachS: number | null;
  anzahlWachphasen: number | null;
  einschlafzeitS: number | null;
  effizienzProz: number | null;
  /** Ruhepuls der Nacht (get_sleep_data.restingHeartRate bzw. daily_health) */
  ruhepuls: number | null;
  hrvBaseline: HrvBaseline | null;
  /** Garmins persönliche Zielbereiche der Phasenanteile in % (sleepScores.*Percentage) */
  richtwerte: Partial<Record<"tief" | "leicht" | "rem", Bereich>> | null;
  epochen: SchlafEpoche[];
  zeitreihen: Partial<Record<SchlafMetrik, SchlafZeitreihe>>;
}

/** Kernwerte einer Nacht für 7-/30-Tage-Vergleiche (gleich berechnet für heute und Historie) */
export interface SchlafKernwerte {
  datum: string;
  dauerS: number | null;
  effizienzProz: number | null;
  hrvMittel: number | null;
  ruhepuls: number | null;
  atemMittel: number | null;
  spo2Min: number | null;
  tiefAnteilProz: number | null;
  tiefS: number | null;
  garminScore: number | null;
}

export interface SchlafKontext {
  /** Geplante Einheiten am Aufwachtag (aus dem Plan), z. B. für „harte Einheit verschieben" */
  geplant?: { typ: string; titel: string }[];
}

/* ------------------------------------------------------------------ */
/* Ausgabe                                                             */
/* ------------------------------------------------------------------ */

export interface PhasenAnteil {
  minuten: number | null;
  prozent: number | null;
  richtwert: Bereich | null;
  richtwertQuelle: "garmin" | "allgemein" | null;
}

export type Richtung = "hoch" | "runter" | "gleich";
export type Bewertung = "gut" | "schlecht" | "neutral";

export interface VergleichsWert {
  metrik: keyof Omit<SchlafKernwerte, "datum" | "tiefS">;
  label: string;
  einheit: string;
  heute: number | null;
  mittel7: number | null;
  mittel30: number | null;
  n7: number;
  n30: number;
  abw7Proz: number | null;
  abw30Proz: number | null;
  richtung7: Richtung | null;
  richtung30: Richtung | null;
  bewertung7: Bewertung | null;
  bewertung30: Bewertung | null;
}

export interface DatenqualitaetEintrag {
  metrik: SchlafMetrik;
  label: string;
  vorhanden: number;
  erwartet: number | null;
  proz: number;
  status: "gut" | "lueckenhaft" | "nicht verfügbar";
  quelle: string | null;
}

export interface RegelTeil {
  regel: string;
  punkte: number;
  max: number;
}

export interface SchlafAnalyse {
  datum: string;
  zusammenfassung: {
    startMs: number | null;
    endeMs: number | null;
    startUhr: string | null;
    endeUhr: string | null;
    bettzeitS: number | null;
    dauerS: number | null;
    effizienzProz: number | null;
    einschlafzeitS: number | null;
    /** Erster Nicht-Wach-Zeitpunkt (Einschlafen) */
    einschlafUhr: string | null;
    /** Ende des letzten Schlafsegments (Aufwachen) */
    aufwachUhr: string | null;
    anzahlWachphasen: number | null;
    laengsteWachphaseS: number | null;
  };
  phasen: Record<PhasenName, PhasenAnteil>;
  hr: {
    min: number;
    minZeitS: number;
    mittel: number;
    max: number;
    maxZeitS: number;
    nachtabfallBpm: number | null;
    nachtabfallProz: number | null;
    tiefsteImTiefschlaf: number | null;
  } | null;
  spo2: {
    mittel: number;
    min: number;
    minZeitS: number;
    minutenUnter90: number;
    minutenUnter92: number;
    abfaelleUnter92: number;
    abfaelleUnter90: number;
  } | null;
  atem: {
    mittel: number;
    min: number;
    max: number;
    stdAbw: number;
    jePhase: Record<PhasenName, number | null>;
  } | null;
  hrv: {
    mittel: number;
    min: number;
    max: number;
    band: Bereich | null;
    einordnung: "unter" | "im" | "ueber" | null;
    status: string | null;
  } | null;
  stress: { mittel: number; max: number } | null;
  bodyBattery: { start: number; ende: number; aufladung: number; max: number } | null;
  bewegung: { bewegungsphasen: number | null; unruhigeMomente: number; unruheSumme: number } | null;
  vergleich: VergleichsWert[];
  garminScore: number | null;
  regelBewertung: { punkte: number; teile: RegelTeil[] } | null;
  ampel: "gruen" | "gelb" | "rot" | null;
  datenqualitaet: DatenqualitaetEintrag[];
  auffaelligkeiten: string[];
  empfehlungen: string[];
  warnungen: string[];
  hinweise: string[];
  fazit: string;
  phaseKontext: { taper: boolean; epTag: 1 | 2 | null; tageBisEp: number | null };
}

/* ------------------------------------------------------------------ */
/* Hilfen                                                              */
/* ------------------------------------------------------------------ */

const UHR = new Intl.DateTimeFormat("de-CH", {
  timeZone: "Europe/Zurich",
  hour: "2-digit",
  minute: "2-digit",
});

export function uhrzeit(ms: number | null): string | null {
  return ms == null ? null : UHR.format(new Date(ms));
}

export function formatDauer(s: number | null): string {
  if (s == null) return "–";
  const min = Math.round(s / 60);
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min`;
}

const r1 = (v: number) => Math.round(v * 10) / 10;

function mittel(werte: number[]): number | null {
  return werte.length ? werte.reduce((a, b) => a + b, 0) / werte.length : null;
}

function werteVon(reihe: SchlafZeitreihe | undefined): number[] {
  return reihe ? reihe.punkte.map((p) => p[1]) : [];
}

/** Phasen-Segmente (Tief/Leicht/REM/Wach) chronologisch */
export function phasenSegmente(epochen: SchlafEpoche[]) {
  return epochen
    .filter((e) => e.art === "phase" || e.art === "wach")
    .map((e) => ({
      startMs: e.startMs,
      endeMs: e.startMs + e.dauerS * 1000,
      phase: phaseName(e.art === "wach" ? PHASE.wach : e.level),
    }))
    .sort((a, b) => a.startMs - b.startMs);
}

function phaseName(level: number): PhasenName {
  return level === PHASE.tief ? "tief" : level === PHASE.rem ? "rem" : level === PHASE.wach ? "wach" : "leicht";
}

/** Phase zum absoluten Zeitpunkt (ms) oder null ausserhalb der Segmente */
export function phaseZu(
  segmente: ReturnType<typeof phasenSegmente>,
  ms: number
): PhasenName | null {
  for (const s of segmente) if (ms >= s.startMs && ms < s.endeMs) return s.phase;
  return null;
}

/** Nominale Auflösung laut echten Fixtures (README „Garmin-Datenformat") */
export const NOMINAL_AUFLOESUNG_S: Record<SchlafMetrik, number> = {
  hr: 120,
  spo2: 60,
  atemfrequenz: 120,
  hrv: 300,
  stress: 180,
  body_battery: 180,
  bewegung: 60,
};

export const METRIK_LABEL: Record<SchlafMetrik, string> = {
  hr: "Herzfrequenz",
  spo2: "Sauerstoffsättigung (SpO2)",
  atemfrequenz: "Atemfrequenz",
  hrv: "HRV",
  stress: "Stress",
  body_battery: "Body Battery",
  bewegung: "Bewegung",
};

/** Allgemeine Richtwerte für Erwachsene (Anteil an der Schlafzeit), falls Garmin keine liefert */
export const ALLGEMEINE_RICHTWERTE: Record<"tief" | "leicht" | "rem", Bereich> = {
  tief: { von: 16, bis: 33 },
  leicht: { von: 30, bis: 64 },
  rem: { von: 21, bis: 31 },
};

/* ------------------------------------------------------------------ */
/* Teil-Analysen                                                       */
/* ------------------------------------------------------------------ */

export function analysiereZusammenfassung(n: SchlafNachtDaten): SchlafAnalyse["zusammenfassung"] {
  const seg = phasenSegmente(n.epochen);
  const schlaf = seg.filter((s) => s.phase !== "wach");
  const ersterSchlaf = schlaf[0]?.startMs ?? null;
  const letzterSchlaf = schlaf.length ? schlaf[schlaf.length - 1].endeMs : null;
  const wachInnen = seg.filter(
    (s) =>
      s.phase === "wach" &&
      ersterSchlaf != null &&
      letzterSchlaf != null &&
      s.startMs >= ersterSchlaf &&
      s.endeMs <= letzterSchlaf
  );
  const laengste = wachInnen.length
    ? Math.max(...wachInnen.map((s) => (s.endeMs - s.startMs) / 1000))
    : seg.length
      ? 0
      : null;
  const bettzeitS =
    n.schlafStartMs != null && n.schlafEndeMs != null
      ? Math.max(0, (n.schlafEndeMs - n.schlafStartMs) / 1000)
      : null;
  const dauerS =
    n.schlafDauerS ??
    (schlaf.length ? schlaf.reduce((a, s) => a + (s.endeMs - s.startMs) / 1000, 0) : null);
  const effizienz =
    n.effizienzProz ??
    (dauerS != null && bettzeitS ? r1(Math.min(100, (dauerS / bettzeitS) * 100)) : null);
  return {
    startMs: n.schlafStartMs,
    endeMs: n.schlafEndeMs,
    startUhr: uhrzeit(n.schlafStartMs),
    endeUhr: uhrzeit(n.schlafEndeMs),
    bettzeitS,
    dauerS,
    effizienzProz: effizienz,
    einschlafzeitS: n.einschlafzeitS,
    einschlafUhr: uhrzeit(ersterSchlaf),
    aufwachUhr: uhrzeit(letzterSchlaf),
    anzahlWachphasen: n.anzahlWachphasen ?? (seg.length ? wachInnen.length : null),
    laengsteWachphaseS: laengste,
  };
}

export function analysierePhasen(n: SchlafNachtDaten): Record<PhasenName, PhasenAnteil> {
  // Sekunden je Phase: Garmin-Summen bevorzugt, sonst aus den Segmenten
  const seg = phasenSegmente(n.epochen);
  const ausSeg = (p: PhasenName) =>
    seg.length ? seg.filter((s) => s.phase === p).reduce((a, s) => a + (s.endeMs - s.startMs) / 1000, 0) : null;
  const sek: Record<PhasenName, number | null> = {
    tief: n.tiefS ?? ausSeg("tief"),
    leicht: n.leichtS ?? ausSeg("leicht"),
    rem: n.remS ?? ausSeg("rem"),
    wach: n.wachS ?? ausSeg("wach"),
  };
  // Prozent der Schlafzeit (Tief+Leicht+REM) — wie Garmin; Wach in % der Bettzeit
  const schlafSumme = (["tief", "leicht", "rem"] as const).reduce(
    (a, p) => (sek[p] == null ? a : a + (sek[p] as number)),
    0
  );
  const bett = schlafSumme + (sek.wach ?? 0);
  const out = {} as Record<PhasenName, PhasenAnteil>;
  for (const p of PHASEN) {
    const s = sek[p];
    const basis = p === "wach" ? bett : schlafSumme;
    const garmin = p !== "wach" ? n.richtwerte?.[p] ?? null : null;
    out[p] = {
      minuten: s == null ? null : Math.round(s / 60),
      prozent: s == null || basis <= 0 ? null : r1((s / basis) * 100),
      richtwert: p === "wach" ? null : garmin ?? ALLGEMEINE_RICHTWERTE[p],
      richtwertQuelle: p === "wach" ? null : garmin ? "garmin" : "allgemein",
    };
  }
  return out;
}

export function analysiereHr(n: SchlafNachtDaten): SchlafAnalyse["hr"] {
  const reihe = n.zeitreihen.hr;
  if (!reihe || reihe.punkte.length === 0) return null;
  const p = reihe.punkte;
  let min = p[0];
  let max = p[0];
  for (const x of p) {
    if (x[1] < min[1]) min = x;
    if (x[1] > max[1]) max = x;
  }
  const seg = phasenSegmente(n.epochen);
  const start = n.schlafStartMs;
  let nachtabfallBpm: number | null = null;
  let nachtabfallProz: number | null = null;
  let tiefste: number | null = null;
  if (start != null) {
    const einschlafS = seg.find((s) => s.phase !== "wach");
    const t0 = einschlafS ? (einschlafS.startMs - start) / 1000 : 0;
    const endeS = n.schlafEndeMs != null ? (n.schlafEndeMs - start) / 1000 : p[p.length - 1][0];
    const mitte = (t0 + endeS) / 2;
    const anfang = mittel(p.filter(([t]) => t >= t0 && t < t0 + 1800).map((x) => x[1]));
    const mitt = mittel(p.filter(([t]) => Math.abs(t - mitte) <= 1800).map((x) => x[1]));
    if (anfang != null && mitt != null) {
      nachtabfallBpm = r1(anfang - mitt);
      nachtabfallProz = r1(((anfang - mitt) / anfang) * 100);
    }
    const imTief = p.filter(([t]) => phaseZu(seg, start + t * 1000) === "tief").map((x) => x[1]);
    tiefste = imTief.length ? Math.min(...imTief) : null;
  }
  return {
    min: min[1],
    minZeitS: min[0],
    mittel: r1(mittel(p.map((x) => x[1])) as number),
    max: max[1],
    maxZeitS: max[0],
    nachtabfallBpm,
    nachtabfallProz,
    tiefsteImTiefschlaf: tiefste,
  };
}

/** Zusammenhängende Läufe unter einer Schwelle (Lücke > 3 min trennt) */
function laeufeUnter(punkte: [number, number][], schwelle: number): number {
  let laeufe = 0;
  let imLauf = false;
  let letzteT = -Infinity;
  for (const [t, v] of punkte) {
    const unter = v < schwelle;
    if (unter && (!imLauf || t - letzteT > 180)) laeufe++;
    imLauf = unter;
    letzteT = t;
  }
  return laeufe;
}

export function analysiereSpo2(n: SchlafNachtDaten): SchlafAnalyse["spo2"] {
  const reihe = n.zeitreihen.spo2;
  if (!reihe || reihe.punkte.length === 0) return null;
  const p = reihe.punkte;
  // Minuten unter Schwelle: jeder Punkt steht für seine Auflösung (Minutenmittel → 1 min)
  const minProPunkt = Math.max(1, (reihe.rohAufloesungS ?? 60) / 60);
  let min = p[0];
  for (const x of p) if (x[1] < min[1]) min = x;
  return {
    mittel: r1(mittel(p.map((x) => x[1])) as number),
    min: min[1],
    minZeitS: min[0],
    minutenUnter90: Math.round(p.filter((x) => x[1] < 90).length * minProPunkt),
    minutenUnter92: Math.round(p.filter((x) => x[1] < 92).length * minProPunkt),
    abfaelleUnter92: laeufeUnter(p, 92),
    abfaelleUnter90: laeufeUnter(p, 90),
  };
}

function stdAbw(werte: number[]): number {
  const m = mittel(werte) ?? 0;
  return Math.sqrt(mittel(werte.map((v) => (v - m) ** 2)) ?? 0);
}

export function analysiereAtem(n: SchlafNachtDaten): SchlafAnalyse["atem"] {
  const reihe = n.zeitreihen.atemfrequenz;
  if (!reihe || reihe.punkte.length === 0) return null;
  const w = werteVon(reihe);
  const jePhase = { tief: null, leicht: null, rem: null, wach: null } as Record<PhasenName, number | null>;
  if (n.schlafStartMs != null) {
    const seg = phasenSegmente(n.epochen);
    const gruppen: Record<PhasenName, number[]> = { tief: [], leicht: [], rem: [], wach: [] };
    for (const [t, v] of reihe.punkte) {
      const ph = phaseZu(seg, n.schlafStartMs + t * 1000);
      if (ph) gruppen[ph].push(v);
    }
    for (const ph of PHASEN) {
      const m = mittel(gruppen[ph]);
      jePhase[ph] = m == null ? null : r1(m);
    }
  }
  return {
    mittel: r1(mittel(w) as number),
    min: Math.min(...w),
    max: Math.max(...w),
    stdAbw: r1(stdAbw(w)),
    jePhase,
  };
}

export function analysiereHrv(n: SchlafNachtDaten): SchlafAnalyse["hrv"] {
  const w = werteVon(n.zeitreihen.hrv);
  if (!w.length) return null;
  const m = r1(mittel(w) as number);
  const b = n.hrvBaseline;
  const band =
    b?.balancedLow != null && b?.balancedUpper != null ? { von: b.balancedLow, bis: b.balancedUpper } : null;
  return {
    mittel: m,
    min: Math.min(...w),
    max: Math.max(...w),
    band,
    einordnung: band ? (m < band.von ? "unter" : m > band.bis ? "ueber" : "im") : null,
    status: b?.status ?? null,
  };
}

export function analysiereStress(n: SchlafNachtDaten): SchlafAnalyse["stress"] {
  const w = werteVon(n.zeitreihen.stress);
  return w.length ? { mittel: r1(mittel(w) as number), max: Math.max(...w) } : null;
}

export function analysiereBodyBattery(n: SchlafNachtDaten): SchlafAnalyse["bodyBattery"] {
  const p = n.zeitreihen.body_battery?.punkte ?? [];
  if (!p.length) return null;
  const start = p[0][1];
  const ende = p[p.length - 1][1];
  return { start, ende, aufladung: ende - start, max: Math.max(...p.map((x) => x[1])) };
}

/** Bewegungsminuten über dieser Schwelle (activityLevel 0–≈8) gelten als Bewegung */
export const BEWEGUNG_SCHWELLE = 2;

export function analysiereBewegung(n: SchlafNachtDaten): SchlafAnalyse["bewegung"] {
  const unruhe = n.epochen.filter((e) => e.art === "bewegung");
  const reihe = n.zeitreihen.bewegung;
  if (!reihe && unruhe.length === 0) return null;
  let phasen: number | null = null;
  if (reihe && n.schlafStartMs != null && n.schlafEndeMs != null) {
    // nur innerhalb der Schlafzeit zählen (die Reihe reicht ±1 h darüber hinaus)
    const ende = (n.schlafEndeMs - n.schlafStartMs) / 1000;
    const innen = reihe.punkte.filter(([t]) => t >= 0 && t <= ende);
    phasen = 0;
    let davor = false;
    for (const [, v] of innen) {
      const bewegt = v > BEWEGUNG_SCHWELLE;
      if (bewegt && !davor) phasen++;
      davor = bewegt;
    }
  }
  return {
    bewegungsphasen: phasen,
    unruhigeMomente: unruhe.length,
    unruheSumme: unruhe.reduce((a, e) => a + e.level, 0),
  };
}

/* ------------------------------------------------------------------ */
/* Kernwerte, Baseline-Vergleich                                       */
/* ------------------------------------------------------------------ */

/**
 * Kernwerte einer Nacht. Für die Historie liefert der Service dieselben
 * Felder aus sleep_nights/raw (Garmin-Zusammenfassung), damit heute und die
 * Vergleichsnächte gleich berechnet sind; `zusammenfassung` hat Vorrang.
 */
export function kernwerte(
  n: SchlafNachtDaten,
  zusammenfassung?: { hrvMittel?: number | null; atemMittel?: number | null; spo2Min?: number | null }
): SchlafKernwerte {
  const z = analysiereZusammenfassung(n);
  const ph = analysierePhasen(n);
  const hrvW = werteVon(n.zeitreihen.hrv);
  const atemW = werteVon(n.zeitreihen.atemfrequenz);
  const spoW = werteVon(n.zeitreihen.spo2);
  return {
    datum: n.datum,
    dauerS: z.dauerS,
    effizienzProz: z.effizienzProz,
    hrvMittel: zusammenfassung?.hrvMittel ?? (hrvW.length ? r1(mittel(hrvW) as number) : null),
    ruhepuls: n.ruhepuls,
    atemMittel: zusammenfassung?.atemMittel ?? (atemW.length ? r1(mittel(atemW) as number) : null),
    spo2Min: zusammenfassung?.spo2Min ?? (spoW.length ? Math.min(...spoW) : null),
    tiefAnteilProz: ph.tief.prozent,
    tiefS: n.tiefS ?? (ph.tief.minuten == null ? null : ph.tief.minuten * 60),
    garminScore: n.garminScore,
  };
}

const VERGLEICH_DEF: {
  metrik: VergleichsWert["metrik"];
  label: string;
  einheit: string;
  hoeherBesser: boolean | null;
}[] = [
  { metrik: "dauerS", label: "Schlafdauer", einheit: "s", hoeherBesser: true },
  { metrik: "effizienzProz", label: "Effizienz", einheit: "%", hoeherBesser: true },
  { metrik: "hrvMittel", label: "HRV", einheit: "ms", hoeherBesser: true },
  { metrik: "ruhepuls", label: "Ruhepuls", einheit: "bpm", hoeherBesser: false },
  { metrik: "atemMittel", label: "Atemfrequenz", einheit: "Atemzüge/min", hoeherBesser: null },
  { metrik: "spo2Min", label: "SpO2-Minimum", einheit: "%", hoeherBesser: true },
  { metrik: "tiefAnteilProz", label: "Tiefschlaf-Anteil", einheit: "%", hoeherBesser: true },
  { metrik: "garminScore", label: "Garmin-Score", einheit: "", hoeherBesser: true },
];

/** Abweichungen unter dieser Schwelle (in %) gelten als „gleich" */
export const GLEICH_SCHWELLE_PROZ = 3;

function richtungUndBewertung(
  abw: number | null,
  hoeherBesser: boolean | null
): [Richtung | null, Bewertung | null] {
  if (abw == null) return [null, null];
  if (Math.abs(abw) < GLEICH_SCHWELLE_PROZ) return ["gleich", "neutral"];
  const r: Richtung = abw > 0 ? "hoch" : "runter";
  if (hoeherBesser == null) return [r, "neutral"];
  return [r, (r === "hoch") === hoeherBesser ? "gut" : "schlecht"];
}

/**
 * Vergleich mit 7- und 30-Tage-Mittel OHNE den betrachteten Tag. Es zählen
 * nur Nächte im Fenster [datum − N, datum − 1], die einen Wert haben.
 */
export function vergleicheMitBaseline(heute: SchlafKernwerte, historie: SchlafKernwerte[]): VergleichsWert[] {
  const fenster = (tage: number) =>
    historie.filter((h) => h.datum < heute.datum && h.datum >= addTage(heute.datum, -tage));
  const h7 = fenster(7);
  const h30 = fenster(30);
  return VERGLEICH_DEF.map((d) => {
    const w7 = h7.map((h) => h[d.metrik]).filter((v): v is number => v != null);
    const w30 = h30.map((h) => h[d.metrik]).filter((v): v is number => v != null);
    const m7 = mittel(w7);
    const m30 = mittel(w30);
    const x = heute[d.metrik];
    const abw = (m: number | null) => (x == null || m == null || m === 0 ? null : r1(((x - m) / m) * 100));
    const a7 = abw(m7);
    const a30 = abw(m30);
    const [ri7, b7] = richtungUndBewertung(a7, d.hoeherBesser);
    const [ri30, b30] = richtungUndBewertung(a30, d.hoeherBesser);
    return {
      metrik: d.metrik,
      label: d.label,
      einheit: d.einheit,
      heute: x,
      mittel7: m7 == null ? null : r1(m7),
      mittel30: m30 == null ? null : r1(m30),
      n7: w7.length,
      n30: w30.length,
      abw7Proz: a7,
      abw30Proz: a30,
      richtung7: ri7,
      richtung30: ri30,
      bewertung7: b7,
      bewertung30: b30,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Datenqualität, Regel-Bewertung                                      */
/* ------------------------------------------------------------------ */

export function datenqualitaet(n: SchlafNachtDaten): DatenqualitaetEintrag[] {
  const bettS =
    n.schlafStartMs != null && n.schlafEndeMs != null ? (n.schlafEndeMs - n.schlafStartMs) / 1000 : null;
  return (Object.keys(NOMINAL_AUFLOESUNG_S) as SchlafMetrik[]).map((m) => {
    const r = n.zeitreihen[m];
    const vorhanden = r?.rohAnzahl ?? 0;
    const erwartet = bettS ? Math.max(1, Math.floor(bettS / NOMINAL_AUFLOESUNG_S[m])) : null;
    const proz = !r || vorhanden === 0 ? 0 : erwartet ? Math.min(100, Math.round((vorhanden / erwartet) * 100)) : 100;
    return {
      metrik: m,
      label: METRIK_LABEL[m],
      vorhanden,
      erwartet,
      proz,
      status: proz === 0 ? "nicht verfügbar" : proz >= 80 ? "gut" : "lueckenhaft",
      quelle: r?.quelle ?? null,
    };
  });
}

const linear = (x: number, null0: number, voll: number) =>
  Math.max(0, Math.min(1, (x - null0) / (voll - null0)));

/**
 * Eigene, transparente „Regel-Bewertung" (0–100). Ersetzt nie den
 * Garmin-Score, sondern zeigt, woraus sich ein Urteil nach festen Regeln ergibt.
 * Teile ohne Daten fallen weg; die Summe wird auf die verfügbaren Maxima normiert.
 */
export function regelBewertung(
  z: SchlafAnalyse["zusammenfassung"],
  ph: Record<PhasenName, PhasenAnteil>
): SchlafAnalyse["regelBewertung"] {
  const teile: RegelTeil[] = [];
  const add = (regel: string, anteil: number | null, max: number) => {
    if (anteil != null) teile.push({ regel, punkte: Math.round(anteil * max), max });
  };
  add("Dauer (voll ab 7.5 h, 0 bei 4 h)", z.dauerS == null ? null : linear(z.dauerS / 3600, 4, 7.5), 40);
  add("Effizienz (voll ab 90 %, 0 bei 70 %)", z.effizienzProz == null ? null : linear(z.effizienzProz, 70, 90), 20);
  add("Tiefschlaf-Anteil (voll ab 16 %, 0 bei 5 %)", ph.tief.prozent == null ? null : linear(ph.tief.prozent, 5, 16), 15);
  add("REM-Anteil (voll ab 20 %, 0 bei 8 %)", ph.rem.prozent == null ? null : linear(ph.rem.prozent, 8, 20), 15);
  add(
    "Wachphasen (voll bis 2, −2 Punkte je weitere)",
    z.anzahlWachphasen == null ? null : Math.max(0, 1 - Math.max(0, z.anzahlWachphasen - 2) * 0.2),
    10
  );
  if (!teile.length) return null;
  const max = teile.reduce((a, t) => a + t.max, 0);
  const summe = teile.reduce((a, t) => a + t.punkte, 0);
  return { punkte: Math.round((summe / max) * 100), teile };
}

/* ------------------------------------------------------------------ */
/* Empfehlungen, Warnungen, Fazit                                      */
/* ------------------------------------------------------------------ */

const HARTE_TYPEN = ["intervalle", "huegel_intervalle", "lastlauf", "langer_lauf", "probe_ep"];
const BEIN_TYPEN = ["lastlauf", "kraft", "huegel_intervalle", "langer_lauf"];

export function phaseKontext(datum: string): SchlafAnalyse["phaseKontext"] {
  const tageBisEp = tageDiff(datum, EP_DATUM);
  return {
    taper: datum >= TAPER_START && datum <= EP_TAG_2,
    epTag: datum === EP_DATUM ? 1 : datum === EP_TAG_2 ? 2 : null,
    tageBisEp: tageBisEp >= 0 ? tageBisEp : null,
  };
}

/** Schwellen der Warnhinweise (bewusst konservativ, kein Befund) */
export const WARN = {
  spo2AbfaelleUnter90: 2,
  spo2MinutenUnter90: 5,
  atemUeberMittel30: 3,
  atemAnteilErhoeht: 0.6,
  atemMinNaechte30: 5,
};

export function warnungen(a: Pick<SchlafAnalyse, "spo2" | "atem" | "vergleich">, atemPunkte: number[]): string[] {
  const out: string[] = [];
  const s = a.spo2;
  if (s && (s.abfaelleUnter90 >= WARN.spo2AbfaelleUnter90 || s.minutenUnter90 >= WARN.spo2MinutenUnter90)) {
    out.push(
      `Die Uhr hat die Sauerstoffsättigung mehrfach unter 90 % geschätzt (${s.minutenUnter90} Min, ` +
        `${s.abfaelleUnter90}× unter 90 %). Die Uhr liefert keinen medizinischen Befund — Messfehler durch ` +
        `Lage oder Sitz des Armbands sind möglich. Wenn du Beschwerden hast (z. B. Atemaussetzer, starke ` +
        `Tagesmüdigkeit, Kopfschmerzen am Morgen), lass das ärztlich abklären.`
    );
  }
  const v = a.vergleich.find((x) => x.metrik === "atemMittel");
  if (a.atem && v?.mittel30 != null && v.n30 >= WARN.atemMinNaechte30) {
    const grenze = v.mittel30 + WARN.atemUeberMittel30;
    const anteil = atemPunkte.length ? atemPunkte.filter((x) => x > v.mittel30! + 2).length / atemPunkte.length : 0;
    if (a.atem.mittel >= grenze && anteil >= WARN.atemAnteilErhoeht) {
      out.push(
        `Die Atemfrequenz lag die ganze Nacht deutlich über deinem 30-Tage-Mittel (${a.atem.mittel} statt ` +
          `${v.mittel30} Atemzüge/min). Das kann z. B. bei einem Infekt, nach sehr hartem Training oder bei ` +
          `Hitze vorkommen. Die Uhr liefert keinen medizinischen Befund; bei Beschwerden ärztlich abklären.`
      );
    }
  }
  return out;
}

export function empfehlungen(
  a: Pick<SchlafAnalyse, "zusammenfassung" | "hrv" | "phaseKontext">,
  heute: SchlafKernwerte,
  historie: SchlafKernwerte[],
  kontext: SchlafKontext
): string[] {
  const out: string[] = [];
  const geplant = kontext.geplant ?? [];
  const hart = geplant.find((g) => HARTE_TYPEN.includes(g.typ));
  const bein = geplant.find((g) => BEIN_TYPEN.includes(g.typ));
  const { taper, epTag, tageBisEp } = a.phaseKontext;

  if (epTag) {
    out.push(
      epTag === 1
        ? "Heute ist EP Tag 1: Nach dem Aufstehen nichts Neues ausprobieren, Frühstück wie in der Checkliste, ruhig ankommen. Eine kürzere Nacht vor einer Prüfung ist normal und kostet kaum Leistung."
        : "Heute ist EP Tag 2: Locker aufwärmen, gewohnt essen und trinken. Die Nacht nach Tag 1 ist oft unruhig — das ist normal."
    );
  } else if (taper) {
    out.push(
      tageBisEp != null && tageBisEp <= 3
        ? `Noch ${tageBisEp} ${tageBisEp === 1 ? "Tag" : "Tage"} bis zur EP: Schlaf hat jetzt Vorrang vor jedem Training. Fester Rhythmus, früh ins Bett, Bildschirm abends weg.`
        : "Taper-Phase: Schlaf ist jetzt der wichtigste Erholungsfaktor. Ziel sind 8 h im Bett und ein fester Rhythmus bis zur EP."
    );
  }

  // < 7 h in den letzten drei Nächten (heute + zwei Vornächte, alle mit Wert)
  const vornaechte = historie
    .filter((h) => h.datum < heute.datum && h.datum >= addTage(heute.datum, -2))
    .map((h) => h.dauerS);
  const drei = [heute.dauerS, ...vornaechte];
  if (drei.length === 3 && drei.every((d) => d != null && d < 7 * 3600)) {
    out.push(
      hart
        ? `Drei Nächte in Folge unter 7 h: «${hart.titel}» heute besser auf einen Ruhetag verschieben oder durch einen lockeren Z2-Lauf ersetzen.`
        : "Drei Nächte in Folge unter 7 h: heute keine harte Einheit — wenn eine ansteht, auf einen Ruhetag verschieben."
    );
  }

  if (a.hrv?.einordnung === "unter") {
    out.push(
      `HRV unter deinem ausgeglichenen Bereich (${a.hrv.mittel} ms, Bereich ${a.hrv.band!.von}–${a.hrv.band!.bis} ms): Intensität heute senken${hart ? ` — «${hart.titel}» lieber locker oder kürzer` : ""}.`
    );
  }

  const tief30 = historie
    .filter((h) => h.datum < heute.datum && h.datum >= addTage(heute.datum, -30))
    .map((h) => h.tiefS)
    .filter((v): v is number => v != null);
  const m30 = mittel(tief30);
  if (heute.tiefS != null && m30 != null && tief30.length >= 5 && heute.tiefS < 0.75 * m30) {
    out.push(
      `Deutlich weniger Tiefschlaf als im 30-Tage-Mittel (${Math.round(heute.tiefS / 60)} statt ${Math.round(m30 / 60)} Min): heute keinen Lastlauf${bein ? ` und «${bein.titel}» nur moderat` : " und keine schwere Beineinheit"}.`
    );
  }

  if (out.length === 0) {
    out.push(
      geplant.length
        ? `Schlaf im gewohnten Rahmen — der geplante Tag («${geplant[0].titel}») passt.`
        : "Schlaf im gewohnten Rahmen — keine Anpassung am Training nötig."
    );
  }
  return out.slice(0, 3);
}

export function auffaelligkeiten(a: SchlafAnalyse): string[] {
  const out: string[] = [];
  const z = a.zusammenfassung;
  if (z.dauerS != null && z.dauerS < 6 * 3600) out.push(`Kurze Nacht: ${formatDauer(z.dauerS)} Schlaf.`);
  if (z.effizienzProz != null && z.effizienzProz < 85) out.push(`Niedrige Schlafeffizienz (${z.effizienzProz} %).`);
  if (z.anzahlWachphasen != null && z.anzahlWachphasen >= 5) out.push(`Viele Wachphasen (${z.anzahlWachphasen}).`);
  if (z.laengsteWachphaseS != null && z.laengsteWachphaseS >= 20 * 60)
    out.push(`Lange Wachphase von ${Math.round(z.laengsteWachphaseS / 60)} Min.`);
  for (const p of ["tief", "rem"] as const) {
    const ph = a.phasen[p];
    if (ph.prozent != null && ph.richtwert && ph.prozent < ph.richtwert.von)
      out.push(`${PHASEN_LABEL[p]}-Anteil ${ph.prozent} % liegt unter dem Richtwert ${ph.richtwert.von}–${ph.richtwert.bis} %.`);
  }
  if (a.hr?.nachtabfallProz != null && a.hr.nachtabfallProz < 5)
    out.push(`Kaum Pulsabfall in der Nacht (${a.hr.nachtabfallProz} %) — oft nach spätem Training, Alkohol oder Stress.`);
  if (a.spo2 && a.spo2.min < 90) out.push(`SpO2-Minimum ${a.spo2.min} % (Uhr-Schätzung).`);
  if (a.hrv?.einordnung === "unter") out.push("HRV unter dem ausgeglichenen Bereich.");
  for (const v of a.vergleich) {
    if (v.abw30Proz != null && Math.abs(v.abw30Proz) >= 15 && v.bewertung30 === "schlecht")
      out.push(`${v.label} ${v.abw30Proz > 0 ? "+" : ""}${v.abw30Proz} % gegenüber dem 30-Tage-Mittel.`);
  }
  return out;
}

function fazitSatz(a: SchlafAnalyse): string {
  const z = a.zusammenfassung;
  if (z.dauerS == null) return "Für diese Nacht liegen keine verwertbaren Schlafdaten vor.";
  const teile = [`${formatDauer(z.dauerS)} geschlafen`];
  if (z.effizienzProz != null) teile.push(`Effizienz ${Math.round(z.effizienzProz)} %`);
  const d7 = a.vergleich.find((v) => v.metrik === "dauerS");
  let vergleich = "";
  if (d7?.abw7Proz != null) {
    vergleich =
      d7.richtung7 === "gleich"
        ? ", etwa wie dein 7-Tage-Mittel"
        : d7.richtung7 === "hoch"
          ? ", mehr als dein 7-Tage-Mittel"
          : ", weniger als dein 7-Tage-Mittel";
  }
  const sorge = a.warnungen.length
    ? " Auffällige Uhr-Werte, siehe Hinweis."
    : a.hrv?.einordnung === "unter"
      ? " HRV unter deinem Bereich."
      : "";
  return `${teile.join(", ")}${vergleich}.${sorge}`;
}

function ampelVon(score: number | null, regel: number | null): SchlafAnalyse["ampel"] {
  const s = score ?? regel;
  if (s == null) return null;
  return s >= 80 ? "gruen" : s >= 60 ? "gelb" : "rot";
}

/* ------------------------------------------------------------------ */
/* Fassade                                                             */
/* ------------------------------------------------------------------ */

export function analysiereSchlaf(
  nacht: SchlafNachtDaten,
  historie: SchlafKernwerte[],
  kontext: SchlafKontext = {},
  zusammenfassung?: Parameters<typeof kernwerte>[1]
): SchlafAnalyse {
  const z = analysiereZusammenfassung(nacht);
  const phasen = analysierePhasen(nacht);
  const heute = kernwerte(nacht, zusammenfassung);
  const teil = {
    datum: nacht.datum,
    zusammenfassung: z,
    phasen,
    hr: analysiereHr(nacht),
    spo2: analysiereSpo2(nacht),
    atem: analysiereAtem(nacht),
    hrv: analysiereHrv(nacht),
    stress: analysiereStress(nacht),
    bodyBattery: analysiereBodyBattery(nacht),
    bewegung: analysiereBewegung(nacht),
    vergleich: vergleicheMitBaseline(heute, historie),
    garminScore: nacht.garminScore,
    regelBewertung: regelBewertung(z, phasen),
    datenqualitaet: datenqualitaet(nacht),
    phaseKontext: phaseKontext(nacht.datum),
  };
  const warn = warnungen(teil, werteVon(nacht.zeitreihen.atemfrequenz));
  const analyse: SchlafAnalyse = {
    ...teil,
    ampel: ampelVon(nacht.garminScore, teil.regelBewertung?.punkte ?? null),
    warnungen: warn,
    empfehlungen: empfehlungen(teil, heute, historie, kontext),
    hinweise: [
      "Alle Werte sind Schätzungen der Uhr, keine medizinische Messung. Bei Beschwerden ärztlich abklären.",
      ...(teil.spo2 ? ["SpO2 ist eine Uhr-Schätzung (optischer Sensor am Handgelenk), kein medizinischer Befund."] : []),
    ],
    auffaelligkeiten: [],
    fazit: "",
  };
  analyse.auffaelligkeiten = auffaelligkeiten(analyse);
  analyse.fazit = fazitSatz(analyse);
  return analyse;
}

/* ------------------------------------------------------------------ */
/* Aus roher Garmin-Antwort (Tests, Fallback)                          */
/* ------------------------------------------------------------------ */

type Obj = Record<string, unknown>;
const istObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const zahlOderNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** Garmins persönliche Zielbereiche der Phasenanteile aus dailySleepDTO.sleepScores */
export function richtwerteAusScores(scores: unknown): SchlafNachtDaten["richtwerte"] {
  if (!istObj(scores)) return null;
  const out: NonNullable<SchlafNachtDaten["richtwerte"]> = {};
  const map = { tief: "deepPercentage", leicht: "lightPercentage", rem: "remPercentage" } as const;
  for (const [p, k] of Object.entries(map) as [keyof typeof map, string][]) {
    const s = scores[k];
    if (!istObj(s)) continue;
    const von = zahlOderNull(s.optimalStart);
    const bis = zahlOderNull(s.optimalEnd);
    if (von != null && bis != null && bis > von) out[p] = { von, bis };
  }
  return Object.keys(out).length ? out : null;
}

/** Positive Zahl oder null (0/negativ = von Garmin nicht gemessen) */
const positiv = (v: unknown) => {
  const n = zahlOderNull(v);
  return n != null && n > 0 ? n : null;
};

/**
 * Baut eine Nacht direkt aus der rohen get_sleep_data-Antwort (wie die DB sie
 * nach Sync + Aufbereitung enthält). Für Tests mit echten Fixtures.
 */
export function nachtAusRaw(
  datum: string,
  raw: unknown,
  normalisiert: {
    nacht: { schlafStartMs: number | null; schlafEndeMs: number | null; effizienzProz: number | null; einschlafzeitS: number | null; anzahlWachphasen: number | null; hrvBaseline: HrvBaseline | null };
    epochen: SchlafEpoche[];
    zeitreihen: Partial<Record<SchlafMetrik, SchlafZeitreihe>>;
  }
): { nacht: SchlafNachtDaten; zusammenfassung: Parameters<typeof kernwerte>[1] } {
  const r = istObj(raw) ? raw : {};
  const dto = istObj(r.dailySleepDTO) ? r.dailySleepDTO : {};
  const scores = istObj(dto.sleepScores) ? dto.sleepScores : {};
  const overall = istObj(scores.overall) ? scores.overall : {};
  return {
    nacht: {
      datum,
      schlafStartMs: normalisiert.nacht.schlafStartMs,
      schlafEndeMs: normalisiert.nacht.schlafEndeMs,
      garminScore: zahlOderNull(overall.value),
      schlafDauerS: positiv(dto.sleepTimeSeconds),
      tiefS: zahlOderNull(dto.deepSleepSeconds),
      leichtS: zahlOderNull(dto.lightSleepSeconds),
      remS: zahlOderNull(dto.remSleepSeconds),
      wachS: zahlOderNull(dto.awakeSleepSeconds),
      anzahlWachphasen: normalisiert.nacht.anzahlWachphasen,
      einschlafzeitS: normalisiert.nacht.einschlafzeitS,
      effizienzProz: normalisiert.nacht.effizienzProz,
      ruhepuls: positiv(r.restingHeartRate),
      hrvBaseline: normalisiert.nacht.hrvBaseline,
      richtwerte: richtwerteAusScores(scores),
      epochen: normalisiert.epochen,
      zeitreihen: normalisiert.zeitreihen,
    },
    zusammenfassung: {
      hrvMittel: positiv(r.avgOvernightHrv),
      atemMittel: positiv(dto.averageRespirationValue),
      spo2Min: positiv(dto.lowestSpO2Value),
    },
  };
}
