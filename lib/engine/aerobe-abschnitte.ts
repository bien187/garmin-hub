/**
 * Aerobic Performance, Schritt 1: gleichmässige Laufabschnitte erkennen.
 *
 * Aus den Zeitreihen eines Laufs (Zeit, Distanz, Puls, Höhe) entstehen
 * 5-Minuten-Abschnitte mit stabilem Puls und gleichmässiger,
 * höhenkorrigierter Geschwindigkeit. Nur diese Abschnitte gehen in die
 * Auswertung ein — nie der Durchschnitt einer ganzen Einheit, in dem
 * Intervalle und Trabpausen ineinander verschwimmen.
 *
 * Ignoriert werden:
 *  - Stehen und Gehen (< 1.6 m/s) sowie Aufzeichnungslücken (> 30 s),
 *  - GPS-Sprünge (rückwärts, > 7 m/s oder deutlich schneller als die
 *    Nachbarschaft),
 *  - die ersten 8 Minuten Bewegungszeit (Aufwärmen; der Puls hinkt der
 *    Belastung hinterher) und die letzten 2 Minuten (Auslaufen),
 *  - Fenster mit Pulslücken, Pausen oder unruhigem Verlauf (Intervalle,
 *    Antritte, Stop-and-go).
 *
 * Steigungen rechnet das Minetti-Polynom heraus (GAP, wie im Detail einer
 * Aktivität). Die Steigung kommt aus ±20 m Strecke statt aus einzelnen
 * Messpunkten — Höhenrauschen würde den GAP-Faktor sonst aufblähen.
 *
 * Rein und deterministisch, ohne DB.
 */

import { gapFaktor } from "./gap";

/** Bei einer Änderung der Regeln erhöhen: alle Läufe werden neu ausgewertet. */
export const ABSCHNITT_VERSION = 1;

export const ABSCHNITT_REGELN = {
  /** Länge eines Abschnitts (Bewegungszeit) */
  fensterS: 300,
  /** Vorschub der Suche */
  schrittS: 30,
  /** Teilblöcke für die Stabilitätsprüfung */
  teilS: 30,
  aufwaermenS: 480,
  auslaufenS: 120,
  /** kürzere Läufe liefern keinen belastbaren Abschnitt */
  minBewegungS: 900,
  /** m/s — darunter Gehen oder Stehen */
  vMin: 1.6,
  /** m/s — darüber GPS-Sprung */
  vMax: 7,
  /** grössere Zeitsprünge sind Pausen oder Aufzeichnungslücken */
  dtMax: 30,
  hfMin: 60,
  hfMax: 220,
  /** max. Spanne der 30-s-Pulsmittel im Fenster (bpm) */
  hfSpanne: 8,
  /** max. Variationskoeffizient der 30-s-Geschwindigkeiten */
  vCv: 0.07,
  /** Mindestanteil der Fensterzeit mit gültigem Puls */
  hfAbdeckung: 0.9,
  /** Pausen innerhalb eines Fensters (Wanduhr minus Bewegung) */
  pauseImFensterS: 30,
} as const;

export interface LaufStreams {
  zeitS: number[];
  distanzM: (number | null)[];
  hr: (number | null)[];
  ele?: (number | null)[] | null;
}

export type LaufStatus = "ok" | "keine_streams" | "zu_kurz" | "keine_hf" | "hf_luecken" | "instabil";

/** Stabiler Abschnitt: [Puls bpm, Geschwindigkeit m/s, Dauer s] */
export type Abschnitt = [number, number, number];

export interface LaufAnalyse {
  status: LaufStatus;
  abschnitte: Abschnitt[];
  /** Geschwindigkeiten höhenkorrigiert (Höhenprofil vorhanden) */
  hoehe: boolean;
  /** Bewegungszeit nach Abzug von Pausen, Gehen und Ausreissern */
  bewegungS: number;
  /** Anteil der Bewegungszeit mit gültigem Puls (0–1) */
  hfAbdeckung: number;
  /** Pulsverteilung der Bewegungszeit: Sekunden je 2-bpm-Klasse ab `hfVon` */
  hfVon: number | null;
  hfS: number[];
  /** verworfene GPS-Ausreisser */
  ausreisser: number;
}

const R = ABSCHNITT_REGELN;

function leer(status: LaufStatus, teil: Partial<LaufAnalyse> = {}): LaufAnalyse {
  return { status, abschnitte: [], hoehe: false, bewegungS: 0, hfAbdeckung: 0, hfVon: null, hfS: [], ausreisser: 0, ...teil };
}

function median(werte: number[]): number {
  const s = [...werte].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Steigung je Messpunkt über ±20 m Strecke (Anteil, 0.05 = 5 %) */
function steigungen(dist: (number | null)[], ele: (number | null)[], n: number): (number | null)[] {
  const pos: number[] = [];
  for (let i = 0; i < n; i++) if (dist[i] != null && ele[i] != null) pos.push(i);
  const out: (number | null)[] = new Array(n).fill(null);
  let lo = 0;
  let hi = 0;
  for (let p = 0; p < pos.length; p++) {
    const d = dist[pos[p]] as number;
    while (lo < p && (dist[pos[lo]] as number) < d - 20) lo++;
    if (hi < p) hi = p;
    while (hi + 1 < pos.length && (dist[pos[hi]] as number) < d + 20) hi++;
    const dd = (dist[pos[hi]] as number) - (dist[pos[lo]] as number);
    if (dd >= 15) {
      const s = ((ele[pos[hi]] as number) - (ele[pos[lo]] as number)) / dd;
      out[pos[p]] = Math.max(-0.3, Math.min(0.3, s));
    }
  }
  return out;
}

interface Probe {
  /** Zeitpunkt (Ende des Segments) */
  t: number;
  dt: number;
  /** flachäquivalente Distanz */
  dFlat: number;
  v: number;
  hr: number | null;
}

/**
 * Analysiert einen Lauf: stabile 5-Minuten-Abschnitte, Bewegungszeit,
 * Pulsabdeckung und Pulsverteilung. Läufe ohne verwertbare Abschnitte
 * bekommen einen Status, der den Grund nennt.
 */
export function analysiereLauf(s: LaufStreams): LaufAnalyse {
  const n = Math.min(s.zeitS.length, s.distanzM.length, s.hr.length);
  if (n < 30) return leer("keine_streams");

  const ele = s.ele ?? null;
  let eleAnzahl = 0;
  if (ele) for (let i = 0; i < Math.min(n, ele.length); i++) if (ele[i] != null) eleAnzahl++;
  const hoehe = ele != null && eleAnzahl >= 0.8 * n;
  const steig = hoehe ? steigungen(s.distanzM, ele as (number | null)[], n) : null;

  /* ---- Segmente in Bewegung ---- */
  const roh: Probe[] = [];
  let ausreisser = 0;
  for (let i = 1; i < n; i++) {
    const dt = s.zeitS[i] - s.zeitS[i - 1];
    if (!(dt > 0) || dt > R.dtMax) continue;
    const d0 = s.distanzM[i - 1];
    const d1 = s.distanzM[i];
    if (d0 == null || d1 == null) continue;
    const dd = d1 - d0;
    const v = dd / dt;
    if (dd < 0 || v > R.vMax) {
      ausreisser++;
      continue;
    }
    if (v < R.vMin) continue;
    const h = s.hr[i];
    const hr = h != null && h >= R.hfMin && h <= R.hfMax ? h : null;
    const faktor = steig ? gapFaktor(steig[i] ?? 0) : 1;
    roh.push({ t: s.zeitS[i], dt, dFlat: dd * faktor, v, hr });
  }

  /* ---- GPS-Sprünge: deutlich schneller als die Nachbarschaft ---- */
  const proben: Probe[] = [];
  for (let k = 0; k < roh.length; k++) {
    const nb: number[] = [];
    for (let j = Math.max(0, k - 7); j <= Math.min(roh.length - 1, k + 7); j++) if (j !== k) nb.push(roh[j].v);
    if (nb.length >= 6 && roh[k].v > 1.6 * median(nb)) {
      ausreisser++;
      continue;
    }
    proben.push(roh[k]);
  }
  if (proben.length < 20) return leer("keine_streams", { hoehe, ausreisser });

  /* ---- Bewegungszeit, Pulsabdeckung, Pulsverteilung ---- */
  const m = proben.length;
  const tau = new Array<number>(m);
  let bewegung = 0;
  let hfZeit = 0;
  const klassen = new Map<number, number>();
  for (let k = 0; k < m; k++) {
    const p = proben[k];
    bewegung += p.dt;
    tau[k] = bewegung;
    if (p.hr != null) {
      hfZeit += p.dt;
      const kl = Math.floor(p.hr / 2) * 2;
      klassen.set(kl, (klassen.get(kl) ?? 0) + p.dt);
    }
  }
  let hfVon: number | null = null;
  const hfS: number[] = [];
  if (klassen.size) {
    const schluessel = [...klassen.keys()];
    hfVon = Math.min(...schluessel);
    const bis = Math.max(...schluessel);
    for (let kl = hfVon; kl <= bis; kl += 2) hfS.push(Math.round(klassen.get(kl) ?? 0));
  }
  const basis = {
    hoehe,
    bewegungS: Math.round(bewegung),
    hfAbdeckung: bewegung > 0 ? Math.round((hfZeit / bewegung) * 100) / 100 : 0,
    hfVon,
    hfS,
    ausreisser,
  };
  if (bewegung < R.minBewegungS) return { status: "zu_kurz", abschnitte: [], ...basis };
  if (hfZeit === 0) return { status: "keine_hf", abschnitte: [], ...basis };

  /* ---- Präfixsummen über die Bewegungszeit ---- */
  const sDt = new Float64Array(m + 1);
  const sFlat = new Float64Array(m + 1);
  const sHrDt = new Float64Array(m + 1);
  const sHrT = new Float64Array(m + 1);
  for (let k = 0; k < m; k++) {
    const p = proben[k];
    sDt[k + 1] = sDt[k] + p.dt;
    sFlat[k + 1] = sFlat[k] + p.dFlat;
    sHrDt[k + 1] = sHrDt[k] + (p.hr != null ? p.hr * p.dt : 0);
    sHrT[k + 1] = sHrT[k] + (p.hr != null ? p.dt : 0);
  }
  /** Anzahl Segmente, die bis zur Bewegungszeit x enden */
  const bis = (x: number): number => {
    let lo = 0;
    let hi = m;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tau[mid] <= x + 1e-9) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const summe = (a: number, b: number) => {
    const i = bis(a);
    const j = bis(b);
    return { i, j, dt: sDt[j] - sDt[i], flat: sFlat[j] - sFlat[i], hrDt: sHrDt[j] - sHrDt[i], hrT: sHrT[j] - sHrT[i] };
  };

  /* ---- Fenster suchen: stabil, ohne Pausen, Puls vollständig ---- */
  const abschnitte: Abschnitt[] = [];
  const ende = bewegung - R.auslaufenS;
  let letztesEnde = -Infinity;
  let fenster = 0;
  let fensterMitLuecken = 0;
  for (let a = R.aufwaermenS; a + R.fensterS <= ende; a += R.schrittS) {
    if (a < letztesEnde) continue; // überlappt den letzten Abschnitt
    fenster++;
    const b = a + R.fensterS;
    const g = summe(a, b);
    if (g.j - g.i < 5 || g.dt < R.fensterS * 0.8) continue;
    const wanduhr = proben[g.j - 1].t - (proben[g.i].t - proben[g.i].dt);
    if (wanduhr - g.dt > R.pauseImFensterS) continue;
    if (g.hrT < R.hfAbdeckung * g.dt) {
      fensterMitLuecken++;
      continue;
    }
    const vs: number[] = [];
    const hs: number[] = [];
    for (let c = a; c < b - 1e-9; c += R.teilS) {
      const tb = summe(c, Math.min(c + R.teilS, b));
      if (tb.dt <= 0) continue;
      vs.push(tb.flat / tb.dt);
      if (tb.hrT > 0.5 * tb.dt) hs.push(tb.hrDt / tb.hrT);
    }
    if (vs.length < 8 || hs.length < 8) continue;
    const vMittel = vs.reduce((x, y) => x + y, 0) / vs.length;
    const vStd = Math.sqrt(vs.reduce((x, y) => x + (y - vMittel) ** 2, 0) / vs.length);
    if (vStd / vMittel > R.vCv) continue;
    if (Math.max(...hs) - Math.min(...hs) > R.hfSpanne) continue;
    abschnitte.push([
      Math.round((g.hrDt / g.hrT) * 10) / 10,
      Math.round((g.flat / g.dt) * 1000) / 1000,
      Math.round(g.dt),
    ]);
    letztesEnde = b;
  }

  if (abschnitte.length) return { status: "ok", abschnitte, ...basis };
  const luecken = basis.hfAbdeckung < 0.6 || (fenster > 0 && fensterMitLuecken > fenster / 2);
  return { status: luecken ? "hf_luecken" : "instabil", abschnitte: [], ...basis };
}
