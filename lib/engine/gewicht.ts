/**
 * Smart Weight Tracking — reine, deterministische Funktionen (ohne DB).
 *
 * Zwei getrennte Ebenen:
 *  A. Rohmessungen: jede Wägung genau so, wie Garmin sie geliefert hat.
 *     Hier wird nie etwas verändert, korrigiert oder aufgefüllt.
 *  B. Standardisierter Trend: pro Kalendertag die am besten vergleichbare
 *     Messung, daraus ein gleitender 7-Tage-Median (nur echte Tageswerte,
 *     mindestens drei im Fenster). Nicht vergleichbare Messungen fliessen
 *     nicht ein — sie werden gekennzeichnet, nie umgerechnet.
 *
 * Bewusst KEINE Kilogramm-Korrekturen (z. B. „abends −0.8 kg"): Es gibt keine
 * Formel, die Mahlzeiten, Trinken oder Training für eine Person zuverlässig
 * in Kilogramm übersetzt.
 *
 * Der Messqualitäts-Score (0–100) beschreibt nur die Vergleichbarkeit einer
 * Messung mit standardisierten Bedingungen — keine medizinische Genauigkeit.
 * Fehlende Angaben zählen nie als erfüllt; die Uhrzeit allein beweist nicht,
 * dass jemand nüchtern war. Garmin empfiehlt, nach Essen, Trinken, Sport,
 * Baden oder Sauna zwei Stunden zu warten — das steckt in den Kriterien.
 */

import { addTage, tageDiff } from "@/lib/format";

/* ------------------------------------------------------------------ */
/* Typen                                                               */
/* ------------------------------------------------------------------ */

export interface GewichtMessung {
  id: string;
  /** exakter Messzeitpunkt (ISO, UTC) */
  zeitpunkt: string;
  /** Kalendertag der Messung (Ortszeit, laut Garmin) */
  datum: string;
  gewichtKg: number;
  bmi: number | null;
  koerperfettProz: number | null;
  koerperwasserProz: number | null;
  muskelmasseKg: number | null;
  knochenmasseKg: number | null;
  quelle: string | null;
}

/** Manuell ergänzte Messbedingungen; null = keine Angabe */
export interface Messbedingungen {
  nuechtern: boolean | null;
  vorFruehstueck: boolean | null;
  nachToilette: boolean | null;
  /** Minuten seit der letzten Mahlzeit */
  mahlzeitVorMin: number | null;
  /** Minuten seit der letzten Flüssigkeitsaufnahme */
  fluessigkeitVorMin: number | null;
  /** Minuten seit dem letzten Training (überschreibt die Garmin-Aktivitäten) */
  trainingVorMin: number | null;
  /** Bad oder Sauna in den zwei Stunden davor */
  badSauna: boolean | null;
}

export const LEERE_BEDINGUNGEN: Messbedingungen = {
  nuechtern: null,
  vorFruehstueck: null,
  nachToilette: null,
  mahlzeitVorMin: null,
  fluessigkeitVorMin: null,
  trainingVorMin: null,
  badSauna: null,
};

export type KriteriumId =
  | "morgens"
  | "nuechtern"
  | "vorFruehstueck"
  | "toilette"
  | "mahlzeit"
  | "fluessigkeit"
  | "sport"
  | "messzeit";

export type KriteriumStatus = "erfuellt" | "nicht_erfuellt" | "unbekannt" | "widerspruch";
/** Woher eine Bewertung stammt — automatisch Bekanntes wird nicht abgefragt */
export type Herkunft = "zeitstempel" | "garmin" | "angabe" | "abgeleitet" | "historie";

export interface Kriterium {
  id: KriteriumId;
  label: string;
  max: number;
  punkte: number;
  status: KriteriumStatus;
  herkunft: Herkunft | null;
  hinweis: string | null;
}

export type Klasse = "sehr_gut" | "gut" | "eingeschraenkt" | "gering";
export type Tageszeit = "morgens" | "mittags" | "abends" | "nachts";

export interface Messqualitaet {
  score: number;
  klasse: Klasse;
  kriterien: Kriterium[];
  /** Labels der Kriterien ohne Information */
  fehlend: string[];
  /** Stand der manuellen Angaben */
  datenstatus: "vollstaendig" | "teilweise" | "keine_angaben";
  widersprueche: string[];
  /** fliesst in den standardisierten Trend ein */
  trendTauglich: boolean;
  /** Ortszeit (Europe/Zurich), Minuten seit Mitternacht */
  minuteDesTages: number;
  tageszeit: Tageszeit;
}

export interface Aktivitaetsfenster {
  startMs: number;
  endeMs: number;
}

export interface BewerteteMessung extends GewichtMessung {
  bedingungen: Messbedingungen;
  qualitaet: Messqualitaet;
  /** Minuten seit dem Ende des letzten Trainings laut Garmin (≤ 24 h), sonst null */
  trainingAbstandMin: number | null;
  /** liegen überhaupt Garmin-Aktivitäten vor (sonst ist „kein Training" nicht belegt) */
  aktivitaetenBekannt: boolean;
  /** übliche Messzeit zum Zeitpunkt dieser Messung (Minuten seit Mitternacht) */
  referenzMinute: number | null;
}

/**
 * Score einer Messung mit geänderten Angaben neu berechnen (Vorschau im
 * Messprotokoll) — mit denselben automatisch bekannten Informationen.
 */
export function bewerteNeu(m: BewerteteMessung, b: Messbedingungen): Messqualitaet {
  const t = Date.parse(m.zeitpunkt);
  const aktivitaeten: Aktivitaetsfenster[] | null = m.aktivitaetenBekannt
    ? m.trainingAbstandMin != null
      ? [{ startMs: t - (m.trainingAbstandMin + 1) * 60_000, endeMs: t - m.trainingAbstandMin * 60_000 }]
      : []
    : null;
  return bewerteMessung(m, b, { aktivitaeten, referenzMinute: m.referenzMinute });
}

/* ------------------------------------------------------------------ */
/* Score                                                               */
/* ------------------------------------------------------------------ */

export const KRITERIEN: Record<KriteriumId, { label: string; max: number }> = {
  morgens: { label: "Morgens (05–10 Uhr)", max: 15 },
  nuechtern: { label: "Nüchtern", max: 25 },
  vorFruehstueck: { label: "Vor dem Frühstück", max: 10 },
  toilette: { label: "Nach dem Toilettengang", max: 10 },
  mahlzeit: { label: "≥ 2 h nach dem Essen", max: 10 },
  fluessigkeit: { label: "≥ 2 h nach dem Trinken", max: 10 },
  sport: { label: "≥ 2 h nach Sport, Bad oder Sauna", max: 10 },
  messzeit: { label: "Übliche Messzeit", max: 10 },
};

/** Manuelle Angaben, die für „vollständig" vorliegen müssen */
const MANUELL: KriteriumId[] = ["nuechtern", "vorFruehstueck", "toilette", "mahlzeit", "fluessigkeit"];

export const ZWEI_STUNDEN_MIN = 120;
/** Abweichung von der üblichen Messzeit, die noch als „ähnlich" gilt */
export const MESSZEIT_TOLERANZ_MIN = 60;

export const KLASSEN: Record<Klasse, { label: string; ab: number }> = {
  sehr_gut: { label: "Sehr gut vergleichbar", ab: 85 },
  gut: { label: "Gut vergleichbar", ab: 70 },
  eingeschraenkt: { label: "Eingeschränkt vergleichbar", ab: 45 },
  gering: { label: "Geringe Vergleichbarkeit", ab: 0 },
};

export function klasseFuer(score: number): Klasse {
  if (score >= 85) return "sehr_gut";
  if (score >= 70) return "gut";
  if (score >= 45) return "eingeschraenkt";
  return "gering";
}

const ZEIT = new Intl.DateTimeFormat("de-CH", {
  timeZone: "Europe/Zurich",
  hour: "numeric",
  minute: "numeric",
  hourCycle: "h23",
});

/** Ortszeit (Europe/Zurich) eines Zeitpunkts in Minuten seit Mitternacht */
export function minuteDesTages(iso: string): number {
  const teile = ZEIT.formatToParts(new Date(iso));
  const h = Number(teile.find((t) => t.type === "hour")?.value ?? 0);
  const m = Number(teile.find((t) => t.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

export function tageszeitVon(minute: number): Tageszeit {
  if (minute >= 300 && minute < 600) return "morgens"; // 05:00–09:59 (wie das Score-Kriterium)
  if (minute >= 600 && minute < 1020) return "mittags"; // 10:00–16:59
  if (minute >= 1020 && minute < 1380) return "abends"; // 17:00–22:59
  return "nachts";
}

/** Minuten seit dem Ende des letzten Trainings (laufendes Training = 0), höchstens 24 h zurück */
export function trainingAbstand(zeitpunktMs: number, fenster: Aktivitaetsfenster[] | null): number | null {
  if (!fenster) return null;
  let best: number | null = null;
  for (const f of fenster) {
    if (f.startMs > zeitpunktMs) continue;
    const abstand = f.endeMs >= zeitpunktMs ? 0 : (zeitpunktMs - f.endeMs) / 60_000;
    if (abstand <= 24 * 60 && (best == null || abstand < best)) best = abstand;
  }
  return best == null ? null : Math.round(best);
}

interface Kontext {
  /** Aktivitäten (Start/Ende); null = keine Aktivitätsdaten vorhanden */
  aktivitaeten: Aktivitaetsfenster[] | null;
  /** übliche Messzeit (Minuten seit Mitternacht), null = noch keine Referenz */
  referenzMinute: number | null;
}

/**
 * Messqualität einer einzelnen Messung. Rein; `kontext` liefert die
 * automatisch verfügbaren Informationen (Garmin-Aktivitäten, Messzeit-Historie).
 */
export function bewerteMessung(
  m: Pick<GewichtMessung, "zeitpunkt">,
  b: Messbedingungen,
  kontext: Kontext
): Messqualitaet {
  const minute = minuteDesTages(m.zeitpunkt);
  const ms = Date.parse(m.zeitpunkt);
  const widersprueche: string[] = [];

  const k = (id: KriteriumId, status: KriteriumStatus, herkunft: Herkunft | null, hinweis: string | null = null): Kriterium => ({
    id,
    label: KRITERIEN[id].label,
    max: KRITERIEN[id].max,
    punkte: status === "erfuellt" ? KRITERIEN[id].max : 0,
    status,
    herkunft,
    hinweis,
  });

  /* Widersprüche zuerst: sie entwerten die betroffenen Angaben */
  const nuechternNachFruehstueck = b.nuechtern === true && b.vorFruehstueck === false;
  const nuechternKurzNachEssen = b.nuechtern === true && b.mahlzeitVorMin != null && b.mahlzeitVorMin < ZWEI_STUNDEN_MIN;
  if (nuechternNachFruehstueck) widersprueche.push("Nüchtern angegeben, aber nach dem Frühstück gemessen.");
  if (nuechternKurzNachEssen) widersprueche.push("Nüchtern angegeben, aber vor weniger als 2 Stunden gegessen.");
  const nuechternGilt = b.nuechtern === true && !nuechternNachFruehstueck && !nuechternKurzNachEssen;

  const morgens = minute >= 300 && minute < 600;
  const kriterien: Kriterium[] = [
    k("morgens", morgens ? "erfuellt" : "nicht_erfuellt", "zeitstempel"),
    b.nuechtern == null
      ? k("nuechtern", "unbekannt", null)
      : b.nuechtern === false
        ? k("nuechtern", "nicht_erfuellt", "angabe")
        : nuechternGilt
          ? k("nuechtern", "erfuellt", "angabe")
          : k("nuechtern", "widerspruch", "angabe", "widersprüchliche Angaben"),
    b.vorFruehstueck === true
      ? k("vorFruehstueck", "erfuellt", "angabe")
      : b.vorFruehstueck === false
        ? k("vorFruehstueck", "nicht_erfuellt", "angabe")
        : nuechternGilt
          ? k("vorFruehstueck", "erfuellt", "abgeleitet", "folgt aus «nüchtern»")
          : k("vorFruehstueck", "unbekannt", null),
    b.nachToilette == null
      ? k("toilette", "unbekannt", null)
      : k("toilette", b.nachToilette ? "erfuellt" : "nicht_erfuellt", "angabe"),
    b.mahlzeitVorMin != null
      ? k("mahlzeit", b.mahlzeitVorMin >= ZWEI_STUNDEN_MIN ? "erfuellt" : "nicht_erfuellt", "angabe")
      : nuechternGilt
        ? k("mahlzeit", "erfuellt", "abgeleitet", "folgt aus «nüchtern»")
        : k("mahlzeit", "unbekannt", null),
    b.fluessigkeitVorMin != null
      ? k("fluessigkeit", b.fluessigkeitVorMin >= ZWEI_STUNDEN_MIN ? "erfuellt" : "nicht_erfuellt", "angabe")
      : k("fluessigkeit", "unbekannt", null),
  ];

  /* Sport/Bad/Sauna: Angabe vor Garmin-Aktivitäten */
  const abstand = trainingAbstand(ms, kontext.aktivitaeten);
  if (b.badSauna === true) {
    kriterien.push(k("sport", "nicht_erfuellt", "angabe", "Bad oder Sauna in den 2 Stunden davor"));
  } else if (b.trainingVorMin != null) {
    kriterien.push(k("sport", b.trainingVorMin >= ZWEI_STUNDEN_MIN ? "erfuellt" : "nicht_erfuellt", "angabe"));
  } else if (kontext.aktivitaeten != null) {
    kriterien.push(
      abstand != null && abstand < ZWEI_STUNDEN_MIN
        ? k("sport", "nicht_erfuellt", "garmin", abstand === 0 ? "während eines Trainings" : `Training endete ${abstand} Min vorher`)
        : k("sport", "erfuellt", "garmin", "kein Training in den 2 Stunden davor")
    );
  } else {
    kriterien.push(k("sport", "unbekannt", null));
  }

  /* Übliche Messzeit aus der eigenen Historie */
  kriterien.push(
    kontext.referenzMinute == null
      ? k("messzeit", "unbekannt", null, "noch zu wenige Referenzmessungen")
      : k(
          "messzeit",
          Math.abs(minute - kontext.referenzMinute) <= MESSZEIT_TOLERANZ_MIN ? "erfuellt" : "nicht_erfuellt",
          "historie",
          `üblich um ${uhrzeit(kontext.referenzMinute)}`
        )
  );

  const score = kriterien.reduce((s, c) => s + c.punkte, 0);
  const bekannt = (id: KriteriumId) => kriterien.find((c) => c.id === id)!.status !== "unbekannt";
  const manuellBekannt = MANUELL.filter(bekannt).length;
  const negativ =
    widersprueche.length > 0 ||
    kriterien.some((c) => ["nuechtern", "vorFruehstueck", "mahlzeit", "fluessigkeit", "sport"].includes(c.id) && c.status === "nicht_erfuellt");

  return {
    score,
    klasse: klasseFuer(score),
    kriterien,
    fehlend: kriterien.filter((c) => c.status === "unbekannt").map((c) => c.label),
    datenstatus: manuellBekannt === MANUELL.length ? "vollstaendig" : manuellBekannt === 0 ? "keine_angaben" : "teilweise",
    widersprueche,
    // Trend: ausreichend vergleichbar — oder eine Morgenmessung ohne Gegenanzeige
    trendTauglich: score >= 45 || (morgens && !negativ),
    minuteDesTages: minute,
    tageszeit: tageszeitVon(minute),
  };
}

function uhrzeit(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(Math.round(minute % 60)).padStart(2, "0")}`;
}

export function median(werte: number[]): number | null {
  if (werte.length === 0) return null;
  const s = [...werte].sort((a, b) => a - b);
  const mitte = Math.floor(s.length / 2);
  return s.length % 2 ? s[mitte] : (s[mitte - 1] + s[mitte]) / 2;
}

/** Referenz der üblichen Messzeit: Median früherer trendtauglicher Messungen (≥ 3, letzte 60 Tage) */
export const REFERENZ_MIN_MESSUNGEN = 3;
export const REFERENZ_TAGE = 60;

/**
 * Bewertet alle Messungen chronologisch. Die übliche Messzeit entsteht nur
 * aus Messungen VOR der jeweiligen Messung (keine Zirkelbezüge).
 */
export function bewerteAlle(
  messungen: GewichtMessung[],
  bedingungen: Record<string, Messbedingungen | undefined>,
  aktivitaeten: Aktivitaetsfenster[] | null
): BewerteteMessung[] {
  const sortiert = [...messungen].sort((a, b) => a.zeitpunkt.localeCompare(b.zeitpunkt));
  const referenzen: { datum: string; minute: number }[] = [];
  const out: BewerteteMessung[] = [];
  for (const m of sortiert) {
    const b = { ...LEERE_BEDINGUNGEN, ...(bedingungen[m.id] ?? {}) };
    const fenster = referenzen.filter((r) => tageDiff(r.datum, m.datum) <= REFERENZ_TAGE && r.datum < m.datum);
    const referenzMinute =
      fenster.length >= REFERENZ_MIN_MESSUNGEN ? median(fenster.map((r) => r.minute)) : null;
    const qualitaet = bewerteMessung(m, b, { aktivitaeten, referenzMinute });
    // Für die Referenz zählt die Tauglichkeit OHNE das Messzeit-Kriterium
    const basis = bewerteMessung(m, b, { aktivitaeten, referenzMinute: null });
    if (basis.trendTauglich) referenzen.push({ datum: m.datum, minute: qualitaet.minuteDesTages });
    out.push({
      ...m,
      bedingungen: b,
      qualitaet,
      trainingAbstandMin: trainingAbstand(Date.parse(m.zeitpunkt), aktivitaeten),
      aktivitaetenBekannt: aktivitaeten != null,
      referenzMinute,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Standardisierter Trend                                              */
/* ------------------------------------------------------------------ */

/**
 * Pro Kalendertag die am besten vergleichbare trendtaugliche Messung:
 * höchster Score, bei Gleichstand die morgendliche, dann die frühere.
 * Tage ohne taugliche Messung fehlen — es wird nichts aufgefüllt.
 */
export function tageswerte(bewertete: BewerteteMessung[]): BewerteteMessung[] {
  const proTag = new Map<string, BewerteteMessung>();
  for (const m of bewertete) {
    if (!m.qualitaet.trendTauglich) continue;
    const bisher = proTag.get(m.datum);
    if (!bisher || besser(m, bisher)) proTag.set(m.datum, m);
  }
  return [...proTag.values()].sort((a, b) => a.datum.localeCompare(b.datum));
}

function besser(a: BewerteteMessung, b: BewerteteMessung): boolean {
  if (a.qualitaet.score !== b.qualitaet.score) return a.qualitaet.score > b.qualitaet.score;
  const am = a.qualitaet.tageszeit === "morgens";
  const bm = b.qualitaet.tageszeit === "morgens";
  if (am !== bm) return am;
  return a.zeitpunkt < b.zeitpunkt;
}

export interface TrendPunkt {
  datum: string;
  kg: number;
  /** Anzahl Tageswerte im Fenster */
  n: number;
}

/**
 * Gleitender Median über `fensterTage` Kalendertage (inklusive des Tages),
 * nur an Tagen mit eigenem Tageswert und mit mindestens `minWerte` Werten
 * im Fenster. Fehlende Tage werden nicht aufgefüllt.
 */
export function gleitenderMedian(
  werte: { datum: string; wert: number }[],
  fensterTage = 7,
  minWerte = 3
): TrendPunkt[] {
  const sortiert = [...werte].sort((a, b) => a.datum.localeCompare(b.datum));
  const out: TrendPunkt[] = [];
  for (const w of sortiert) {
    const ab = addTage(w.datum, -(fensterTage - 1));
    const fenster = sortiert.filter((x) => x.datum >= ab && x.datum <= w.datum).map((x) => x.wert);
    if (fenster.length < minWerte) continue;
    out.push({ datum: w.datum, kg: Math.round(median(fenster)! * 100) / 100, n: fenster.length });
  }
  return out;
}

export function standardTrend(bewertete: BewerteteMessung[], fensterTage = 7, minWerte = 3): TrendPunkt[] {
  return gleitenderMedian(
    tageswerte(bewertete).map((m) => ({ datum: m.datum, wert: m.gewichtKg })),
    fensterTage,
    minWerte
  );
}

/**
 * Veränderung des Trends über `tage`: letzter Trendpunkt minus dem
 * Trendpunkt, der am nächsten an (letzter − tage) liegt (höchstens 3 Tage
 * daneben). Ohne passenden Vergleichspunkt → null.
 */
export function veraenderung(trend: TrendPunkt[], tage: number): { kg: number; seit: string } | null {
  const letzter = trend.at(-1);
  if (!letzter) return null;
  const ziel = addTage(letzter.datum, -tage);
  let best: TrendPunkt | null = null;
  for (const p of trend) {
    const abw = Math.abs(tageDiff(ziel, p.datum));
    if (abw > 3 || p.datum >= letzter.datum) continue;
    if (!best || abw < Math.abs(tageDiff(ziel, best.datum))) best = p;
  }
  return best ? { kg: Math.round((letzter.kg - best.kg) * 100) / 100, seit: best.datum } : null;
}

/* ------------------------------------------------------------------ */
/* Kennzahlen und Körperzusammensetzung                                */
/* ------------------------------------------------------------------ */

export interface Kennzahlen {
  aktuell: { kg: number; zeitpunkt: string; datum: string; score: number } | null;
  trend: TrendPunkt | null;
  veraenderung7: { kg: number; seit: string } | null;
  veraenderung30: { kg: number; seit: string } | null;
  zeitraum: {
    anzahl: number;
    tiefst: { kg: number; datum: string } | null;
    hoechst: { kg: number; datum: string } | null;
    /** Ø Messqualität (gerundet) */
    qualitaet: number | null;
    /** Trend am Ende minus Trend am Anfang des Zeitraums */
    trendDelta: number | null;
    /** Veränderung gegenüber dem vorherigen, gleich langen Zeitraum (Median der Tageswerte) */
    vorperiodeDelta: number | null;
  };
}

/** Kennzahlen; `von` = erster Tag des gewählten Zeitraums (null = alles) */
export function kennzahlen(bewertete: BewerteteMessung[], trend: TrendPunkt[], von: string | null, heute: string): Kennzahlen {
  const letzte = [...bewertete].sort((a, b) => a.zeitpunkt.localeCompare(b.zeitpunkt)).at(-1) ?? null;
  const imZeitraum = bewertete.filter((m) => von == null || m.datum >= von);
  const trendZeitraum = trend.filter((p) => von == null || p.datum >= von);
  const extrem = (cmp: (a: number, b: number) => boolean) =>
    imZeitraum.reduce<{ kg: number; datum: string } | null>(
      (best, m) => (!best || cmp(m.gewichtKg, best.kg) ? { kg: m.gewichtKg, datum: m.datum } : best),
      null
    );
  let vorperiodeDelta: number | null = null;
  if (von != null) {
    const laenge = tageDiff(von, heute) + 1;
    const vorVon = addTage(von, -laenge);
    const tw = tageswerte(bewertete);
    const jetzt = median(tw.filter((m) => m.datum >= von).map((m) => m.gewichtKg));
    const vorher = median(tw.filter((m) => m.datum >= vorVon && m.datum < von).map((m) => m.gewichtKg));
    if (jetzt != null && vorher != null) vorperiodeDelta = Math.round((jetzt - vorher) * 100) / 100;
  }
  return {
    aktuell: letzte
      ? { kg: letzte.gewichtKg, zeitpunkt: letzte.zeitpunkt, datum: letzte.datum, score: letzte.qualitaet.score }
      : null,
    trend: trend.at(-1) ?? null,
    veraenderung7: veraenderung(trend, 7),
    veraenderung30: veraenderung(trend, 30),
    zeitraum: {
      anzahl: imZeitraum.length,
      tiefst: extrem((a, b) => a < b),
      hoechst: extrem((a, b) => a > b),
      qualitaet: imZeitraum.length
        ? Math.round(imZeitraum.reduce((s, m) => s + m.qualitaet.score, 0) / imZeitraum.length)
        : null,
      trendDelta:
        trendZeitraum.length >= 2
          ? Math.round((trendZeitraum.at(-1)!.kg - trendZeitraum[0].kg) * 100) / 100
          : null,
      vorperiodeDelta,
    },
  };
}

export type KompositionsFeld = "koerperfettProz" | "muskelmasseKg" | "koerperwasserProz" | "bmi";

export interface KompositionsReihe {
  feld: KompositionsFeld;
  /** Tageswerte (beste vergleichbare Messung mit diesem Wert) */
  punkte: { datum: string; wert: number }[];
  /** gleitender 7-Tage-Median */
  trend: { datum: string; wert: number }[];
}

/**
 * Körperzusammensetzung getrennt vom Gewicht: gleiche Tageswahl und
 * 7-Tage-Median. Bioimpedanz reagiert auf Flüssigkeitshaushalt und
 * Messbedingungen — deshalb nur vergleichbare Messungen.
 */
export function komposition(bewertete: BewerteteMessung[], feld: KompositionsFeld): KompositionsReihe {
  const tw = tageswerte(bewertete.filter((m) => m[feld] != null));
  const punkte = tw.map((m) => ({ datum: m.datum, wert: m[feld] as number }));
  return {
    feld,
    punkte,
    trend: gleitenderMedian(punkte, 7, 3).map((p) => ({ datum: p.datum, wert: p.kg })),
  };
}
