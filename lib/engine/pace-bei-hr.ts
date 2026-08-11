/**
 * Pace bei Referenzpuls — der belastbarste Fortschrittsbeleg, den die
 * Daten hergeben.
 *
 * Idee: Tagesform, Wetter und Streckenwahl verschieben jede rohe Pace.
 * Hält man dagegen den Puls fest und fragt „wie schnell war ich bei 148
 * bpm?", misst man die aerobe Grundlage selbst. Wird die Kurve über die
 * Wochen schneller, ist der Fortschritt echt.
 *
 * Zwei Korrekturen halten den Vergleich sauber:
 *  - Steigungen werden über das Minetti-Polynom herausgerechnet (GAP),
 *    sonst schlägt eine hügelige Woche als „Rückschritt" durch.
 *  - Puls und Geschwindigkeit werden über ein Zeitfenster geglättet, damit
 *    nicht einzelne GPS-Zacken das Ergebnis bestimmen.
 *
 * Ergebnis ist der ZEITGEWICHTETE Median: eine Minute im Pulsfenster zählt
 * doppelt gegenüber 30 Sekunden, Ausreisser bleiben trotzdem harmlos.
 */

import { gapFaktor } from "./gap";

export interface PaceBeiHrStreams {
  zeitS: number[];
  distanzM: (number | null)[];
  hr: (number | null)[];
  ele?: (number | null)[] | null;
}

export interface PaceBeiHrOptionen {
  /** Referenzpuls, üblicherweise die Mitte von Zone 2 */
  refHr: number;
  /** Halbe Breite des Pulsfensters in bpm */
  toleranzBpm?: number;
  /** Mindestzeit im Fenster, sonst ist das Ergebnis Zufall */
  minSekunden?: number;
  /** Glättungsfenster (gesamte Breite) in Sekunden */
  fensterS?: number;
}

export interface PaceBeiHrErgebnis {
  /** Höhenkorrigierte Pace in s/km */
  paceSKm: number;
  /** Wie lange die Aktivität im Pulsfenster lag */
  sekunden: number;
}

interface Segment {
  t: number;
  dt: number;
  /** flachäquivalente Distanz in m */
  dFlat: number;
  hr: number;
}

/** Zeitgewichteter Median über (Wert, Gewicht)-Paare */
export function gewichteterMedian(
  werte: { wert: number; gewicht: number }[]
): number | null {
  if (werte.length === 0) return null;
  const sortiert = [...werte].sort((a, b) => a.wert - b.wert);
  const gesamt = sortiert.reduce((s, w) => s + w.gewicht, 0);
  if (gesamt <= 0) return null;
  let kumuliert = 0;
  for (const w of sortiert) {
    kumuliert += w.gewicht;
    if (kumuliert >= gesamt / 2) return w.wert;
  }
  return sortiert[sortiert.length - 1].wert;
}

/** Gleitendes Mittel über ein ZEITfenster (nicht über Indizes) */
function glaetteUeberZeit(
  t: number[],
  werte: number[],
  fensterS: number
): number[] {
  const halb = fensterS / 2;
  return werte.map((_, i) => {
    let summe = 0;
    let anz = 0;
    for (let j = i; j >= 0 && t[i] - t[j] <= halb; j--) {
      summe += werte[j];
      anz++;
    }
    for (let j = i + 1; j < werte.length && t[j] - t[i] <= halb; j++) {
      summe += werte[j];
      anz++;
    }
    return anz > 0 ? summe / anz : werte[i];
  });
}

export function medianPaceBeiHr(
  s: PaceBeiHrStreams,
  opt: PaceBeiHrOptionen
): PaceBeiHrErgebnis | null {
  const toleranz = opt.toleranzBpm ?? 3;
  const minSekunden = opt.minSekunden ?? 300;
  const fensterS = opt.fensterS ?? 20;
  if (!(opt.refHr > 0)) return null;

  const n = Math.min(s.zeitS.length, s.distanzM.length, s.hr.length);
  if (n < 30) return null;

  /* Höhe leicht glätten — rohe Barometer-/GPS-Höhen erzeugen sonst
     Phantomsteigungen, die der GAP-Faktor kräftig verstärkt. */
  const ele = s.ele ?? null;
  const eleGlatt: (number | null)[] | null = ele
    ? ele.map((_, i) => {
        let summe = 0;
        let anz = 0;
        for (let j = Math.max(0, i - 2); j <= Math.min(n - 1, i + 2); j++) {
          const e = ele[j];
          if (e != null) {
            summe += e;
            anz++;
          }
        }
        return anz > 0 ? summe / anz : null;
      })
    : null;

  const segmente: Segment[] = [];
  for (let i = 1; i < n; i++) {
    const dt = s.zeitS[i] - s.zeitS[i - 1];
    if (!(dt > 0) || dt > 30) continue;
    const d0 = s.distanzM[i - 1];
    const d1 = s.distanzM[i];
    if (d0 == null || d1 == null) continue;
    const dd = d1 - d0;
    if (dd <= 0) continue;
    const v = dd / dt;
    // Gehen/Stehen und GPS-Sprünge draussen lassen
    if (v < 1.2 || v > 8) continue;
    const hr = s.hr[i];
    if (hr == null || hr <= 0) continue;

    let faktor = 1;
    if (eleGlatt) {
      const e0 = eleGlatt[i - 1];
      const e1 = eleGlatt[i];
      if (e0 != null && e1 != null && dd > 0.5) faktor = gapFaktor((e1 - e0) / dd);
    }
    segmente.push({ t: s.zeitS[i], dt, dFlat: dd * faktor, hr });
  }
  if (segmente.length < 20) return null;

  const t = segmente.map((x) => x.t);
  const hrGlatt = glaetteUeberZeit(
    t,
    segmente.map((x) => x.hr),
    fensterS
  );
  const speedGlatt = glaetteUeberZeit(
    t,
    segmente.map((x) => x.dFlat / x.dt),
    fensterS
  );

  const treffer: { wert: number; gewicht: number }[] = [];
  let sekunden = 0;
  for (let i = 0; i < segmente.length; i++) {
    if (Math.abs(hrGlatt[i] - opt.refHr) > toleranz) continue;
    const v = speedGlatt[i];
    if (!(v > 0.5) || v > 8) continue;
    treffer.push({ wert: 1000 / v, gewicht: segmente[i].dt });
    sekunden += segmente[i].dt;
  }
  if (sekunden < minSekunden) return null;

  const paceSKm = gewichteterMedian(treffer);
  return paceSKm != null ? { paceSKm, sekunden } : null;
}

/** Zeitgewichteter Median über mehrere Einzelergebnisse (z.B. eine Woche) */
export function fasseZusammen(
  ergebnisse: PaceBeiHrErgebnis[]
): PaceBeiHrErgebnis | null {
  const gueltig = ergebnisse.filter((e) => e.sekunden > 0);
  if (gueltig.length === 0) return null;
  const paceSKm = gewichteterMedian(
    gueltig.map((e) => ({ wert: e.paceSKm, gewicht: e.sekunden }))
  );
  if (paceSKm == null) return null;
  return {
    paceSKm,
    sekunden: gueltig.reduce((s, e) => s + e.sekunden, 0),
  };
}
