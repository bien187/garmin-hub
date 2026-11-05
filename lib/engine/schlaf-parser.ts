/**
 * Normalisiert die rohe Garmin-Schlafantwort (sleep_nights.raw =
 * get_sleep_data kompakt, optional mit `zusatz`) in das Speicherformat von
 * sleep_epochen / sleep_zeitreihen plus abgeleitete Nacht-Kennzahlen.
 *
 * Reine Funktion ohne DB, getestet mit den echten Fixtures unter
 * tests/fixtures/garmin/. Formate siehe README „Garmin-Datenformat (Schlaf)":
 * - Zeitstempel sind entweder ms (UTC) oder ISO-Strings OHNE Zone, die
 *   ebenfalls UTC meinen ("2026-11-03T21:40:17.0").
 * - sleepLevels.activityLevel: 0 Tief, 1 Leicht, 2 REM, 3 Wach.
 * - Fehlende Werte / Platzhalter (null, negativ) sind Lücken, nie 0.
 */

export const SCHLAF_METRIKEN = [
  "hr",
  "spo2",
  "atemfrequenz",
  "hrv",
  "stress",
  "body_battery",
  "bewegung",
] as const;
export type SchlafMetrik = (typeof SCHLAF_METRIKEN)[number];

export type EpochenArt = "phase" | "wach" | "bewegung";

/** Phasen-Codes aus sleepLevels.activityLevel */
export const PHASE = { tief: 0, leicht: 1, rem: 2, wach: 3 } as const;

export interface SchlafEpoche {
  art: EpochenArt;
  startMs: number; // UTC
  dauerS: number;
  /** phase: 0 Tief, 1 Leicht, 2 REM · wach: 3 · bewegung: Unruhe 1–3 */
  level: number;
}

export interface SchlafZeitreihe {
  /** [sekunden_seit_schlaf_start, minutenmittel] — max. 1 Punkt pro Minute */
  punkte: [number, number][];
  /** Gültige Rohpunkte vor der Minutenreduktion */
  rohAnzahl: number;
  /** Median-Abstand der Rohpunkte in Sekunden (null bei < 2 Punkten) */
  rohAufloesungS: number | null;
  /** get_sleep_data oder der Endpunkt der Ersatzreihe (raw.zusatz) */
  quelle: string;
}

export interface HrvBaseline {
  balancedLow: number | null;
  balancedUpper: number | null;
  lowUpper: number | null;
  lastNightAvg: number | null;
  weeklyAvg: number | null;
  status: string | null;
}

export interface SchlafNachtAbgeleitet {
  schlafStartMs: number | null;
  schlafEndeMs: number | null;
  /** Schlafzeit / (Ende − Start) in %, 1 Nachkommastelle */
  effizienzProz: number | null;
  /** Dauer eines Wach-Segments ganz am Anfang; sonst nicht ableitbar → null */
  einschlafzeitS: number | null;
  /** Wach-Segmente zwischen erstem und letztem Schlafsegment */
  anzahlWachphasen: number | null;
  /** dailySleepDTO.awakeCount (Garmin-eigene, strengere Zählung) */
  garminAwakeCount: number | null;
  /** Beim Speichern von der eigenen Python-Bridge weggelassene Listen (raw._gekuerzt, raw > 1 MB), z. B. sleepMovement */
  gekuerzt: string[];
  hrvBaseline: HrvBaseline | null;
}

export interface NormalisierteSchlafNacht {
  nacht: SchlafNachtAbgeleitet;
  epochen: SchlafEpoche[];
  zeitreihen: Partial<Record<SchlafMetrik, SchlafZeitreihe>>;
}

type Obj = Record<string, unknown>;

const istObj = (v: unknown): v is Obj =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function zahl(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:?\d{2})?$/;

/** ms-Zahl oder ISO-String (ohne Zone = UTC) → ms UTC */
export function garminZeitMs(v: unknown): number | null {
  const n = zahl(v);
  if (n !== null) return n > 0 ? n : null;
  if (typeof v !== "string") return null;
  const m = ISO.exec(v.trim());
  if (!m) return null;
  const [, j, mo, t, h, mi, s, frac, zone] = m;
  let ms = Date.UTC(+j, +mo - 1, +t, +h, +mi, +s);
  if (frac) ms += Math.round(Number(`0.${frac}`) * 1000);
  if (zone && zone !== "Z") {
    const vz = zone[0] === "-" ? -1 : 1;
    const ziffern = zone.slice(1).replace(":", "");
    ms -= vz * (Number(ziffern.slice(0, 2)) * 60 + Number(ziffern.slice(2, 4))) * 60_000;
  }
  return Number.isFinite(ms) ? ms : null;
}

/** Herkunft einer Zeitreihe in get_sleep_data */
const REIHEN: Record<
  SchlafMetrik,
  { liste: string; zeit: string; wert: string; nullIstLuecke: boolean }
> = {
  hr: { liste: "sleepHeartRate", zeit: "startGMT", wert: "value", nullIstLuecke: true },
  spo2: {
    liste: "wellnessEpochSPO2DataDTOList",
    zeit: "epochTimestamp",
    wert: "spo2Reading",
    nullIstLuecke: true,
  },
  atemfrequenz: {
    liste: "wellnessEpochRespirationDataDTOList",
    zeit: "startTimeGMT",
    wert: "respirationValue",
    nullIstLuecke: true,
  },
  hrv: { liste: "hrvData", zeit: "startGMT", wert: "value", nullIstLuecke: true },
  stress: { liste: "sleepStress", zeit: "startGMT", wert: "value", nullIstLuecke: false },
  body_battery: {
    liste: "sleepBodyBattery",
    zeit: "startGMT",
    wert: "value",
    nullIstLuecke: false,
  },
  bewegung: {
    liste: "sleepMovement",
    zeit: "startGMT",
    wert: "activityLevel",
    nullIstLuecke: false,
  },
};

/**
 * Gültiger Messwert? null/negativ ist immer eine Lücke (Garmin-Platzhalter
 * -1/-2). Bei HF, SpO2, Atmung und HRV ist auch 0 physiologisch unmöglich
 * und damit eine Lücke; bei Stress, Body Battery und Bewegung ist 0 echt.
 */
function gueltig(w: number | null, nullIstLuecke: boolean): w is number {
  if (w === null || w < 0) return false;
  return !(nullIstLuecke && w === 0);
}

function median(werte: number[]): number | null {
  if (werte.length === 0) return null;
  const s = [...werte].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const runde = (v: number, stellen: number) => {
  const f = 10 ** stellen;
  return Math.round(v * f) / f;
};

/** Rohpunkte [ms, wert] → Minutenmittel relativ zum Schlafstart */
export function reduziereAufMinuten(
  roh: [number, number][],
  startMs: number
): Pick<SchlafZeitreihe, "punkte" | "rohAnzahl" | "rohAufloesungS"> {
  const sortiert = [...roh].sort((a, b) => a[0] - b[0]);
  const abstaende: number[] = [];
  for (let i = 1; i < sortiert.length; i++) {
    abstaende.push((sortiert[i][0] - sortiert[i - 1][0]) / 1000);
  }
  const eimer = new Map<number, { summe: number; n: number }>();
  for (const [t, w] of sortiert) {
    const minute = Math.floor((t - startMs) / 60_000);
    const e = eimer.get(minute) ?? { summe: 0, n: 0 };
    e.summe += w;
    e.n += 1;
    eimer.set(minute, e);
  }
  const punkte = [...eimer.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([minute, e]) => [minute * 60, runde(e.summe / e.n, 2)] as [number, number]);
  const med = median(abstaende);
  return {
    punkte,
    rohAnzahl: sortiert.length,
    rohAufloesungS: med === null ? null : Math.round(med),
  };
}

function rohAusListe(liste: unknown, zeit: string, wert: string, nullIstLuecke: boolean) {
  const out: [number, number][] = [];
  if (!Array.isArray(liste)) return out;
  for (const e of liste) {
    if (!istObj(e)) continue;
    const t = garminZeitMs(e[zeit]);
    const w = zahl(e[wert]);
    if (t === null || !gueltig(w, nullIstLuecke)) continue;
    out.push([t, w]);
  }
  return out;
}

function rohAusPaaren(liste: unknown, nullIstLuecke: boolean) {
  const out: [number, number][] = [];
  if (!Array.isArray(liste)) return out;
  for (const p of liste) {
    if (!Array.isArray(p) || p.length < 2) continue;
    const t = garminZeitMs(p[0]);
    const w = zahl(p[1]);
    if (t === null || !gueltig(w, nullIstLuecke)) continue;
    out.push([t, w]);
  }
  return out;
}

interface Segment {
  startMs: number;
  endeMs: number;
  level: number;
}

/** sleepLevels → zeitlich sortierte Segmente, gleiche Nachbarn zusammengefasst */
function phasenSegmente(liste: unknown): Segment[] {
  if (!Array.isArray(liste)) return [];
  const roh: Segment[] = [];
  for (const e of liste) {
    if (!istObj(e)) continue;
    const s = garminZeitMs(e.startGMT);
    const en = garminZeitMs(e.endGMT);
    const lv = zahl(e.activityLevel);
    if (s === null || en === null || en <= s || lv === null) continue;
    const level = Math.round(lv);
    if (level < 0 || level > 3) continue;
    roh.push({ startMs: s, endeMs: en, level });
  }
  roh.sort((a, b) => a.startMs - b.startMs);
  const out: Segment[] = [];
  for (const seg of roh) {
    const vorher = out[out.length - 1];
    // Nahtlos (≤ 1 s Lücke) und gleiche Phase → ein Segment
    if (vorher && vorher.level === seg.level && seg.startMs - vorher.endeMs <= 1000) {
      vorher.endeMs = Math.max(vorher.endeMs, seg.endeMs);
    } else {
      out.push({ ...seg });
    }
  }
  return out;
}

function hrvBaselineAus(summary: unknown): HrvBaseline | null {
  if (!istObj(summary)) return null;
  const b = istObj(summary.baseline) ? summary.baseline : {};
  const erg: HrvBaseline = {
    balancedLow: zahl(b.balancedLow),
    balancedUpper: zahl(b.balancedUpper),
    lowUpper: zahl(b.lowUpper),
    lastNightAvg: zahl(summary.lastNightAvg),
    weeklyAvg: zahl(summary.weeklyAvg),
    status: typeof summary.status === "string" ? summary.status : null,
  };
  return Object.values(erg).some((v) => v !== null) ? erg : null;
}

/**
 * raw (get_sleep_data) → Epochen, Zeitreihen und abgeleitete Kennzahlen.
 * null, wenn raw keine verwertbare Nacht enthält.
 */
export function normalisiereSchlafNacht(
  raw: unknown,
  hrvSummary?: unknown
): NormalisierteSchlafNacht | null {
  if (!istObj(raw)) return null;
  const dto = istObj(raw.dailySleepDTO) ? raw.dailySleepDTO : null;
  const segmente = phasenSegmente(raw.sleepLevels);
  if (!dto && segmente.length === 0) return null;

  /* ---- Schlaffenster ---- */
  let startMs = dto ? garminZeitMs(dto.sleepStartTimestampGMT) : null;
  let endeMs = dto ? garminZeitMs(dto.sleepEndTimestampGMT) : null;
  if (startMs === null && segmente.length) startMs = segmente[0].startMs;
  if (endeMs === null && segmente.length) endeMs = segmente[segmente.length - 1].endeMs;
  if (startMs !== null && endeMs !== null && endeMs <= startMs) endeMs = null;

  /* ---- Epochen ---- */
  const epochen: SchlafEpoche[] = segmente.map((s) => ({
    art: s.level === PHASE.wach ? "wach" : "phase",
    startMs: s.startMs,
    dauerS: Math.round((s.endeMs - s.startMs) / 1000),
    level: s.level,
  }));
  const unruhe = new Map<number, number>();
  if (Array.isArray(raw.sleepRestlessMoments)) {
    for (const e of raw.sleepRestlessMoments) {
      if (!istObj(e)) continue;
      const t = garminZeitMs(e.startGMT);
      const v = zahl(e.value);
      if (t === null || v === null || v <= 0) continue;
      unruhe.set(t, Math.max(unruhe.get(t) ?? 0, Math.round(v)));
    }
  }
  for (const [t, level] of [...unruhe.entries()].sort((a, b) => a[0] - b[0])) {
    // Garmin liefert nur den Zeitpunkt; 60 s Dauer ist eine Annahme (README)
    epochen.push({ art: "bewegung", startMs: t, dauerS: 60, level });
  }

  /* ---- Abgeleitete Kennzahlen ---- */
  const schlafIdx = segmente
    .map((s, i) => (s.level !== PHASE.wach ? i : -1))
    .filter((i) => i >= 0);
  let anzahlWachphasen: number | null = null;
  let einschlafzeitS: number | null = null;
  if (segmente.length && schlafIdx.length) {
    const erster = schlafIdx[0];
    const letzter = schlafIdx[schlafIdx.length - 1];
    anzahlWachphasen = segmente
      .slice(erster, letzter + 1)
      .filter((s) => s.level === PHASE.wach).length;
    if (segmente[0].level === PHASE.wach) {
      einschlafzeitS = Math.round((segmente[0].endeMs - segmente[0].startMs) / 1000);
    }
  }
  const segmentSchlafS = segmente
    .filter((s) => s.level !== PHASE.wach)
    .reduce((a, s) => a + (s.endeMs - s.startMs) / 1000, 0);
  const dtoSchlaf = dto ? zahl(dto.sleepTimeSeconds) : null;
  const schlafzeitS =
    dtoSchlaf !== null && dtoSchlaf > 0 ? dtoSchlaf : segmentSchlafS > 0 ? segmentSchlafS : null;
  const effizienzProz =
    schlafzeitS !== null && startMs !== null && endeMs !== null
      ? runde(Math.min(100, (schlafzeitS / ((endeMs - startMs) / 1000)) * 100), 1)
      : null;
  const awake = dto ? zahl(dto.awakeCount) : null;

  /* ---- Zeitreihen ---- */
  const zeitreihen: Partial<Record<SchlafMetrik, SchlafZeitreihe>> = {};
  const zusatz = istObj(raw.zusatz) ? raw.zusatz : {};
  const quellen = istObj(zusatz.quellen) ? zusatz.quellen : {};
  const bezug =
    startMs ??
    Math.min(
      ...SCHLAF_METRIKEN.flatMap((m) =>
        rohAusListe(raw[REIHEN[m].liste], REIHEN[m].zeit, REIHEN[m].wert, false).map((p) => p[0])
      )
    );
  if (Number.isFinite(bezug)) {
    for (const metrik of SCHLAF_METRIKEN) {
      const def = REIHEN[metrik];
      let quelle = "get_sleep_data";
      let roh = rohAusListe(raw[def.liste], def.zeit, def.wert, def.nullIstLuecke);
      if (roh.length === 0) {
        roh = rohAusPaaren(zusatz[metrik], def.nullIstLuecke);
        const q = quellen[metrik];
        quelle = typeof q === "string" ? q : "tages_endpunkt";
      }
      if (roh.length === 0) continue; // fehlt → Metrik fehlt, keine Nullen
      zeitreihen[metrik] = { ...reduziereAufMinuten(roh, bezug), quelle };
    }
  }

  return {
    nacht: {
      schlafStartMs: startMs,
      schlafEndeMs: endeMs,
      effizienzProz,
      einschlafzeitS,
      anzahlWachphasen,
      garminAwakeCount: awake,
      gekuerzt: Array.isArray(raw._gekuerzt)
        ? raw._gekuerzt.filter((x): x is string => typeof x === "string")
        : [],
      hrvBaseline: hrvBaselineAus(hrvSummary),
    },
    epochen,
    zeitreihen,
  };
}
