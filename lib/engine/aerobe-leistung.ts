/**
 * Aerobic Performance, Schritt 2: individuelles Modell, Normierung, Trend.
 *
 * Frage: „Wie schnell laufe ich bei vergleichbarer aerober Belastung?"
 *
 * 1. Modell: Aus den stabilen Abschnitten aller Läufe rund um ein Datum
 *    (±9 Wochen, notfalls ±20 Wochen) entsteht eine robuste Regression
 *    ln(v) = a + b · HF (Huber-gewichtet). b ist die persönliche Beziehung
 *    zwischen Puls und Geschwindigkeit; sie darf sich über die Zeit ändern.
 * 2. Normierung: Jeder Lauf behält seinen eigenen Achsenabschnitt
 *    a_Lauf = Median(ln v − b · HF) seiner Abschnitte und wird auf den
 *    Referenzpuls verschoben: v_ref = exp(a_Lauf + b · HF_ref),
 *    Pace_ref = 1000 / v_ref.
 * 3. Grenzen: Normiert wird nur, wo das Modell Daten hat — Referenzpuls und
 *    Lauf liegen im Modellbereich (10.–90. Perzentil der Abschnittspulse)
 *    plus höchstens 5 bpm, und der Lauf liegt höchstens 15 bpm vom
 *    Referenzpuls entfernt. Ohne Modell zählen nur Abschnitte, die direkt
 *    am Referenzpuls (±3 bpm) gelaufen wurden — unverändert.
 * 4. Trend: rollierende 28 Tage, robustes gewichtetes Mittel (Huber um den
 *    gewichteten Median), neuere und bessere Messungen zählen mehr. Ohne
 *    Messung in 28 Tagen bricht die Linie ab — nichts wird erfunden.
 *
 * Zusätzlich „Zone 2 Efficiency": dieselbe Rechnung nur mit den
 * Zone-2-Abschnitten überwiegend aerober Läufe, normiert auf den Puls, bei
 * dem diese Läufe tatsächlich stattfinden.
 *
 * Rein und deterministisch, ohne DB — läuft auf dem Server (Punkte) und im
 * Client (Trend).
 */

import { addTage, montagVon, tageDiff } from "@/lib/format";
import type { Abschnitt, LaufStatus } from "./aerobe-abschnitte";

/* ------------------------------------------------------------------ */
/* Typen                                                               */
/* ------------------------------------------------------------------ */

/** Ein ausgewerteter Lauf (aus dem Analyse-Cache) */
export interface AerobLauf {
  id: number;
  datum: string;
  status: LaufStatus;
  abschnitte: Abschnitt[];
  hoehe: boolean;
  /** Höhenmeter pro km laut Aktivität — entscheidet bei fehlendem Höhenprofil */
  hmProKm: number | null;
  hfAbdeckung: number;
  hfVon: number | null;
  hfS: number[];
  /** bisherige Methode (Pace bei ±3 bpm um den Referenzpuls), s/km — nur zum Vergleich */
  alt: number | null;
}

export interface Modell {
  a: number;
  /** ln(v) je bpm */
  b: number;
  /** belastbarer Pulsbereich (10.–90. Perzentil der Abschnitte) */
  lo: number;
  hi: number;
  laeufe: number;
  abschnitte: number;
}

export type PunktArt = "gemessen" | "geschaetzt";

/** Normierter Wert eines Laufs */
export interface AerobPunkt {
  id: number;
  datum: string;
  /** normierte Pace in s/km */
  paceSKm: number;
  /** gemessen = ≥ 5 Min. direkt am Referenzpuls (±3 bpm); geschaetzt = über das Modell verschoben */
  art: PunktArt;
  /** Puls der verwendeten Abschnitte (gewichteter Median) */
  hf: number;
  /** Datenqualität 0–1 (Gewicht im Trend) */
  q: number;
  /** höhenkorrigiert */
  hoehe: boolean;
}

export type Ausschluss = "keine_streams" | "zu_kurz" | "keine_hf" | "hf_luecken" | "instabil" | "ohne_hoehe";

export interface AerobReihe {
  /** Referenzpuls der Reihe */
  ziel: number | null;
  punkte: AerobPunkt[];
  /** Läufe mit stabilen Abschnitten, die sich nicht zuverlässig normieren liessen */
  nichtVergleichbar: number;
}

export interface Zone2Info {
  von: number;
  bis: number;
  /** garmin = Zonen aus dem Garmin-Konto; karvonen = geschätzt aus Ruhe- und Maximalpuls */
  quelle: "garmin" | "karvonen";
}

export interface AerobeLeistung {
  refHr: number;
  hauptreihe: AerobReihe;
  zone2: Zone2Info & { reihe: AerobReihe; laeufe: number };
  /** Modell rund um heute (null = zu wenig Daten) */
  modell: Pick<Modell, "b" | "lo" | "hi" | "laeufe"> | null;
  transparenz: {
    /** Läufe ab 1.5 km */
    laeufe: number;
    /** noch nicht ausgewertet (Analyse läuft) */
    offen: number;
    /** Läufe mit stabilen Abschnitten */
    mitAbschnitten: number;
    ausgeschlossen: Record<Ausschluss, number>;
    /** Läufe mit einem Wert nach der bisherigen Methode */
    bisherigeMethode: number;
  };
}

/* ------------------------------------------------------------------ */
/* Regeln                                                              */
/* ------------------------------------------------------------------ */

export const MODELL_REGELN = {
  halbfensterTage: 63,
  halbfensterWeitTage: 140,
  minLaeufe: 6,
  minAbschnitte: 15,
  /** Spannweite 10.–90. Perzentil der Abschnittspulse */
  minSpreizungBpm: 8,
  /** plausible Steigung: +1 bpm ≈ +0.4 … +3 % Geschwindigkeit */
  bMin: 0.004,
  bMax: 0.03,
  /** Extrapolation über den Modellbereich hinaus */
  extrapolationBpm: 5,
  /** grösster Abstand zwischen Lauf und Referenzpuls */
  maxAbstandBpm: 15,
  /** „gemessen": Abschnitte so nah am Referenzpuls */
  direktToleranzBpm: 3,
  /** Läufe ohne Höhenprofil zählen nur auf flachen Strecken */
  flachHmProKm: 10,
  /** Zone-2-Lauf: Anteil der Bewegungszeit bis zur Obergrenze von Zone 2 */
  aerobAnteil: 0.7,
} as const;

export const TREND_REGELN = {
  fensterTage: 28,
  /** ohne Lauf in so vielen Tagen gilt der Trend als fortgeschrieben */
  neuTage: 7,
  /** darunter (Summe der Gewichte) ist der Trend unsicher */
  minGewicht: 0.8,
} as const;

const M = MODELL_REGELN;

/* ------------------------------------------------------------------ */
/* Statistik                                                           */
/* ------------------------------------------------------------------ */

interface Gewichtet {
  wert: number;
  gewicht: number;
}

/** Gewichtetes Quantil (q = 0.5 → gewichteter Median) */
export function gewichtetesQuantil(werte: Gewichtet[], q: number): number | null {
  const gueltig = werte.filter((w) => w.gewicht > 0 && Number.isFinite(w.wert));
  if (gueltig.length === 0) return null;
  const s = [...gueltig].sort((a, b) => a.wert - b.wert);
  const gesamt = s.reduce((x, w) => x + w.gewicht, 0);
  let kum = 0;
  for (const w of s) {
    kum += w.gewicht;
    if (kum >= q * gesamt - 1e-12) return w.wert;
  }
  return s[s.length - 1].wert;
}

const gMedian = (werte: Gewichtet[]) => gewichtetesQuantil(werte, 0.5);

/**
 * Robuste, gewichtete Gerade y = a + b·x (Huber-IRLS, k = 1.345·MAD).
 * Einzelne Ausreisser (Hitze, müde Beine) ziehen sie kaum.
 */
export function robusteGerade(punkte: { x: number; y: number; w: number }[]): { a: number; b: number } | null {
  if (punkte.length < 3) return null;
  let w = punkte.map((p) => p.w);
  let a = 0;
  let b = 0;
  for (let it = 0; it < 40; it++) {
    let sw = 0;
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < punkte.length; i++) {
      sw += w[i];
      sx += w[i] * punkte[i].x;
      sy += w[i] * punkte[i].y;
    }
    if (sw <= 0) return null;
    const mx = sx / sw;
    const my = sy / sw;
    let sxx = 0;
    let sxy = 0;
    for (let i = 0; i < punkte.length; i++) {
      const dx = punkte[i].x - mx;
      sxx += w[i] * dx * dx;
      sxy += w[i] * dx * (punkte[i].y - my);
    }
    if (sxx <= 1e-9) return null;
    const bNeu = sxy / sxx;
    const aNeu = my - bNeu * mx;
    const stabil = it > 0 && Math.abs(bNeu - b) < 1e-8;
    a = aNeu;
    b = bNeu;
    if (stabil) break;
    const r = punkte.map((p) => p.y - (a + b * p.x));
    const abw = [...r].map(Math.abs).sort((x, y) => x - y);
    const mad = abw[abw.length >> 1];
    const k = 1.345 * Math.max(1.4826 * mad, 1e-6);
    w = punkte.map((p, i) => p.w * (Math.abs(r[i]) <= k ? 1 : k / Math.abs(r[i])));
  }
  return { a, b };
}

/** Robustes gewichtetes Mittel: Huber-Gewichte um den gewichteten Median */
export function robustesMittel(werte: Gewichtet[]): number | null {
  const gueltig = werte.filter((w) => w.gewicht > 0);
  let m = gMedian(gueltig);
  if (m == null) return null;
  const mad = gMedian(gueltig.map((w) => ({ wert: Math.abs(w.wert - (m as number)), gewicht: w.gewicht }))) ?? 0;
  // mindestens 4 s/km Streuung: sonst wiegen zwei fast gleiche Läufe einen dritten auf null
  const k = 1.5 * Math.max(1.4826 * mad, 4);
  for (let it = 0; it < 10; it++) {
    let sw = 0;
    let s = 0;
    for (const w of gueltig) {
      const d = Math.abs(w.wert - m);
      const g = w.gewicht * (d <= k ? 1 : k / d);
      sw += g;
      s += g * w.wert;
    }
    if (sw <= 0) break;
    m = s / sw;
  }
  return m;
}

/* ------------------------------------------------------------------ */
/* Modell                                                              */
/* ------------------------------------------------------------------ */

/** Lauf geht in Modell und Auswertung ein (Abschnitte, Höhe kontrolliert) */
export function istNutzbar(l: AerobLauf): boolean {
  if (l.status !== "ok" || l.abschnitte.length === 0) return false;
  return l.hoehe || (l.hmProKm != null && l.hmProKm <= M.flachHmProKm);
}

function modellAus(laeufe: readonly AerobLauf[], datum: string, halb: number): Modell | null {
  const von = addTage(datum, -halb);
  const bis = addTage(datum, halb);
  const punkte: { x: number; y: number; w: number }[] = [];
  let anzahl = 0;
  for (const l of laeufe) {
    if (l.datum < von || l.datum > bis || !istNutzbar(l)) continue;
    anzahl++;
    // ein langer Lauf zählt höchstens wie sechs Abschnitte
    const faktor = Math.min(1, 6 / l.abschnitte.length);
    for (const [hf, v, s] of l.abschnitte) punkte.push({ x: hf, y: Math.log(v), w: (faktor * s) / 300 });
  }
  if (anzahl < M.minLaeufe || punkte.length < M.minAbschnitte) return null;
  const pulse = punkte.map((p) => ({ wert: p.x, gewicht: p.w }));
  const lo = gewichtetesQuantil(pulse, 0.1);
  const hi = gewichtetesQuantil(pulse, 0.9);
  if (lo == null || hi == null || hi - lo < M.minSpreizungBpm) return null;
  const g = robusteGerade(punkte);
  if (!g || g.b < M.bMin || g.b > M.bMax) return null;
  return { a: g.a, b: g.b, lo, hi, laeufe: anzahl, abschnitte: punkte.length };
}

/** Individuelles Modell rund um ein Datum (±9 Wochen, notfalls ±20 Wochen) */
export function modellFuer(laeufe: readonly AerobLauf[], datum: string): Modell | null {
  return modellAus(laeufe, datum, M.halbfensterTage) ?? modellAus(laeufe, datum, M.halbfensterWeitTage);
}

/* ------------------------------------------------------------------ */
/* Normierung                                                          */
/* ------------------------------------------------------------------ */

export type Normierung =
  | { paceSKm: number; art: PunktArt; hf: number; q: number }
  | { grund: "keine_abschnitte" | "ausserhalb_modell" | "kein_modell" };

/**
 * Normiert die Abschnitte eines Laufs auf den Zielpuls. Ohne Modell oder
 * ausserhalb seines Bereichs zählen nur Abschnitte direkt am Zielpuls.
 */
export function normiere(
  abschnitte: readonly Abschnitt[],
  ziel: number,
  modell: Modell | null,
  lauf: { hoehe: boolean; hfAbdeckung: number }
): Normierung {
  if (abschnitte.length === 0) return { grund: "keine_abschnitte" };
  const hfMedian = gMedian(abschnitte.map(([hf, , s]) => ({ wert: hf, gewicht: s }))) as number;
  const nah = abschnitte.filter(([hf]) => Math.abs(hf - ziel) <= M.direktToleranzBpm);
  const nahS = nah.reduce((x, [, , s]) => x + s, 0);
  const art: PunktArt = nahS >= 300 ? "gemessen" : "geschaetzt";

  let v: number | null = null;
  let hf = hfMedian;
  if (modell) {
    const rand = M.extrapolationBpm;
    const imModell =
      ziel >= modell.lo - rand && ziel <= modell.hi + rand && hfMedian >= modell.lo - rand && hfMedian <= modell.hi + rand;
    if (imModell && Math.abs(hfMedian - ziel) <= M.maxAbstandBpm) {
      const a = gMedian(abschnitte.map(([h, vv, s]) => ({ wert: Math.log(vv) - modell.b * h, gewicht: s }))) as number;
      v = Math.exp(a + modell.b * ziel);
    }
  }
  if (v == null && art === "gemessen") {
    v = gMedian(nah.map(([, vv, s]) => ({ wert: vv, gewicht: s })));
    hf = gMedian(nah.map(([h, , s]) => ({ wert: h, gewicht: s }))) as number;
  }
  if (v == null || !(v > 0)) return { grund: modell ? "ausserhalb_modell" : "kein_modell" };

  const abstand = Math.abs(hf - ziel);
  let q = 1;
  if (art === "geschaetzt") q *= Math.max(0.55, 1 - 0.03 * Math.max(0, abstand - M.direktToleranzBpm));
  if (!lauf.hoehe) q *= 0.8;
  if (abschnitte.reduce((x, [, , s]) => x + s, 0) < 600) q *= 0.8;
  if (lauf.hfAbdeckung < 0.95) q *= 0.9;
  return { paceSKm: 1000 / v, art, hf: Math.round(hf), q: Math.round(q * 100) / 100 };
}

/* ------------------------------------------------------------------ */
/* Zone 2                                                              */
/* ------------------------------------------------------------------ */

/** Anteil der Bewegungszeit mit Puls bis `obergrenze` (aus der Pulsverteilung) */
export function anteilBis(l: Pick<AerobLauf, "hfVon" | "hfS">, obergrenze: number): number | null {
  if (l.hfVon == null || l.hfS.length === 0) return null;
  let unter = 0;
  let gesamt = 0;
  l.hfS.forEach((s, i) => {
    const klasse = (l.hfVon as number) + 2 * i; // enthält klasse und klasse + 1
    gesamt += s;
    unter += s * Math.max(0, Math.min(1, (obergrenze + 1 - klasse) / 2));
  });
  return gesamt > 0 ? unter / gesamt : null;
}

/** Überwiegend aerob: mindestens 70 % der Bewegungszeit bis zur Obergrenze von Zone 2 */
export function istZone2Lauf(l: AerobLauf, zone2: Zone2Info): boolean {
  const anteil = anteilBis(l, zone2.bis);
  return anteil != null && anteil >= M.aerobAnteil;
}

const zone2Abschnitte = (l: AerobLauf, z: Zone2Info) => l.abschnitte.filter(([hf]) => hf >= z.von && hf <= z.bis);

/* ------------------------------------------------------------------ */
/* Gesamtauswertung                                                    */
/* ------------------------------------------------------------------ */

function reiheAus(
  laeufe: readonly AerobLauf[],
  ziel: number | null,
  modellVon: (datum: string) => Modell | null,
  abschnitteVon: (l: AerobLauf) => Abschnitt[]
): AerobReihe {
  const punkte: AerobPunkt[] = [];
  let nichtVergleichbar = 0;
  if (ziel == null) return { ziel, punkte, nichtVergleichbar };
  for (const l of laeufe) {
    const abschnitte = abschnitteVon(l);
    if (abschnitte.length === 0) continue;
    const n = normiere(abschnitte, ziel, modellVon(l.datum), l);
    if ("grund" in n) {
      nichtVergleichbar++;
      continue;
    }
    punkte.push({ id: l.id, datum: l.datum, paceSKm: Math.round(n.paceSKm * 10) / 10, art: n.art, hf: n.hf, q: n.q, hoehe: l.hoehe });
  }
  punkte.sort((a, b) => (a.datum === b.datum ? a.id - b.id : a.datum < b.datum ? -1 : 1));
  return { ziel, punkte, nichtVergleichbar };
}

/**
 * Normierte Werte je Lauf für den Referenzpuls (Hauptreihe) und für
 * Zone 2, dazu Modell rund um heute und Transparenzzahlen.
 */
export function berechneAerobeLeistung(eingabe: {
  laeufe: readonly AerobLauf[];
  refHr: number;
  zone2: Zone2Info;
  heute: string;
  /** Läufe, deren Analyse noch aussteht */
  offen?: number;
}): AerobeLeistung {
  const { refHr, zone2, heute } = eingabe;
  const laeufe = [...eingabe.laeufe].sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : a.id - b.id));
  const nutzbar = laeufe.filter(istNutzbar);

  // Ein Modell je Woche (Donnerstag als Mitte) — glatt über die Zeit, günstig zu rechnen
  const proWoche = new Map<string, Modell | null>();
  const modellVon = (datum: string) => {
    const montag = montagVon(datum);
    if (!proWoche.has(montag)) proWoche.set(montag, modellFuer(nutzbar, addTage(montag, 3)));
    return proWoche.get(montag) ?? null;
  };

  const hauptreihe = reiheAus(nutzbar, refHr, modellVon, (l) => l.abschnitte);

  const z2Laeufe = nutzbar.filter((l) => istZone2Lauf(l, zone2));
  const z2Pulse = z2Laeufe.flatMap((l) => zone2Abschnitte(l, zone2).map(([hf, , s]) => ({ wert: hf, gewicht: s })));
  const z2MedianHf = gMedian(z2Pulse);
  const z2Ziel = z2MedianHf != null ? Math.round(z2MedianHf) : null;
  const zone2Reihe = reiheAus(z2Laeufe, z2Ziel, modellVon, (l) => zone2Abschnitte(l, zone2));

  const ausgeschlossen: Record<Ausschluss, number> = {
    keine_streams: 0,
    zu_kurz: 0,
    keine_hf: 0,
    hf_luecken: 0,
    instabil: 0,
    ohne_hoehe: 0,
  };
  for (const l of laeufe) {
    if (l.status !== "ok") ausgeschlossen[l.status]++;
    else if (!istNutzbar(l)) ausgeschlossen.ohne_hoehe++;
  }

  const modellHeute = modellFuer(nutzbar, heute);
  return {
    refHr,
    hauptreihe,
    zone2: { ...zone2, reihe: zone2Reihe, laeufe: z2Laeufe.length },
    modell: modellHeute
      ? {
          b: Math.round(modellHeute.b * 10000) / 10000,
          lo: Math.round(modellHeute.lo),
          hi: Math.round(modellHeute.hi),
          laeufe: modellHeute.laeufe,
        }
      : null,
    transparenz: {
      laeufe: laeufe.length + (eingabe.offen ?? 0),
      offen: eingabe.offen ?? 0,
      mitAbschnitten: laeufe.filter((l) => l.status === "ok").length,
      ausgeschlossen,
      bisherigeMethode: laeufe.filter((l) => l.alt != null).length,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Rollierender 28-Tage-Trend                                          */
/* ------------------------------------------------------------------ */

export type TrendStatus = "gemessen" | "fortgeschrieben" | "unsicher";

export interface TrendTag {
  datum: string;
  paceSKm: number | null;
  status: TrendStatus | null;
  /** Läufe im 28-Tage-Fenster */
  anzahl: number;
  /** mittlere Datenqualität der Läufe im Fenster */
  q: number | null;
}

/**
 * Gewicht nach Datenalter: 0–14 Tage voll, bis 21 Tage auf 0.5, bis
 * 27 Tage auf 0.2, ab 28 Tagen nicht mehr im Trend.
 */
export function altersGewicht(alterTage: number): number {
  if (alterTage < 0 || alterTage >= TREND_REGELN.fensterTage) return 0;
  if (alterTage <= 14) return 1;
  if (alterTage <= 21) return 1 - (0.5 * (alterTage - 14)) / 7;
  return 0.5 - (0.3 * (alterTage - 21)) / 6;
}

/**
 * Trend je Tag von `von` bis `bis`. Ohne Lauf in den letzten 28 Tagen ist
 * der Wert null (die Linie bricht ab). Ohne neuen Lauf seit 7 Tagen gilt
 * er als fortgeschrieben, bei zu wenig Gewicht als unsicher.
 */
export function rollierenderTrend(punkte: readonly AerobPunkt[], von: string, bis: string): TrendTag[] {
  const sortiert = [...punkte].sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0));
  const tage: TrendTag[] = [];
  if (von > bis) return tage;
  let start = 0;
  let ende = 0;
  for (let d = von; d <= bis; d = addTage(d, 1)) {
    const fruehestes = addTage(d, -(TREND_REGELN.fensterTage - 1));
    while (ende < sortiert.length && sortiert[ende].datum <= d) ende++;
    while (start < ende && sortiert[start].datum < fruehestes) start++;
    const fenster = sortiert.slice(start, ende);
    if (fenster.length === 0) {
      tage.push({ datum: d, paceSKm: null, status: null, anzahl: 0, q: null });
      continue;
    }
    const gewichtet = fenster.map((p) => ({ wert: p.paceSKm, gewicht: altersGewicht(tageDiff(p.datum, d)) * p.q }));
    const summe = gewichtet.reduce((x, g) => x + g.gewicht, 0);
    const wert = robustesMittel(gewichtet);
    const juengster = tageDiff(fenster[fenster.length - 1].datum, d);
    const status: TrendStatus =
      summe < TREND_REGELN.minGewicht ? "unsicher" : juengster >= TREND_REGELN.neuTage ? "fortgeschrieben" : "gemessen";
    tage.push({
      datum: d,
      paceSKm: wert != null ? Math.round(wert * 10) / 10 : null,
      status: wert != null ? status : null,
      anzahl: fenster.length,
      q: Math.round((fenster.reduce((x, p) => x + p.q, 0) / fenster.length) * 100) / 100,
    });
  }
  return tage;
}

export type Datenqualitaet = "gut" | "mittel" | "gering";

/** Einordnung des aktuellen Trendwerts für die Kennzahl „Datenqualität" */
export function datenqualitaet(tag: TrendTag | null | undefined): Datenqualitaet | null {
  if (!tag || tag.paceSKm == null || tag.status == null) return null;
  if (tag.status === "gemessen" && tag.anzahl >= 4 && (tag.q ?? 0) >= 0.75) return "gut";
  if (tag.status !== "unsicher" && tag.anzahl >= 2) return "mittel";
  return "gering";
}
