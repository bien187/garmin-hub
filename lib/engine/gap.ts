/**
 * Grade Adjusted Pace (GAP) über das Minetti-Polynom der Energiekosten
 * des Laufens an der Steigung i (Anteil, z.B. 0.05 = 5 %):
 *
 * C(i) = 155.4i⁵ − 30.4i⁴ − 43.3i³ + 46.3i² + 19.5i + 3.6  [J/kg/m]
 *
 * GAP-Idee: gleiche metabolische Leistung auf der Ebene → Flach-Geschwindigkeit
 * v_flach = v_ist × C(i)/C(0).
 */

export function minettiKosten(steigung: number): number {
  const i = Math.max(-0.45, Math.min(0.45, steigung));
  return (
    155.4 * i ** 5 - 30.4 * i ** 4 - 43.3 * i ** 3 + 46.3 * i ** 2 + 19.5 * i + 3.6
  );
}

const C0 = 3.6; // Minetti-Kosten in der Ebene

/** Faktor, mit dem die Ist-Geschwindigkeit multipliziert wird → Flachäquivalent */
export function gapFaktor(steigung: number): number {
  return minettiKosten(steigung) / C0;
}

export interface GapErgebnis {
  /** Flachäquivalente Distanz in m */
  gapDistanzM: number;
  /** GAP-Pace in s/km */
  gapPaceSKm: number | null;
  /** Ist-Pace in s/km */
  istPaceSKm: number | null;
}

/**
 * GAP über Streams: pro Segment Steigung aus Distanz/Höhe, Energiekosten
 * normieren, flachäquivalente Distanz aufsummieren.
 * Höhen werden leicht geglättet (gleitendes Mittel über 5 Punkte).
 */
export function gapAusStreams(
  zeitS: number[],
  distanzM: (number | null)[],
  ele: (number | null)[]
): GapErgebnis | null {
  const n = Math.min(zeitS.length, distanzM.length, ele.length);
  if (n < 10) return null;

  // Höhe glätten
  const eleGlatt: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    let s = 0;
    let c = 0;
    for (let j = Math.max(0, i - 2); j <= Math.min(n - 1, i + 2); j++) {
      const e = ele[j];
      if (e != null) {
        s += e;
        c++;
      }
    }
    eleGlatt[i] = c > 0 ? s / c : null;
  }

  let gapDistanz = 0;
  let istDistanz = 0;
  let gesamtZeit = 0;
  let letzterIdx = -1;

  for (let i = 0; i < n; i++) {
    if (distanzM[i] == null || eleGlatt[i] == null) continue;
    if (letzterIdx >= 0) {
      const dd = (distanzM[i] as number) - (distanzM[letzterIdx] as number);
      const dt = zeitS[i] - zeitS[letzterIdx];
      if (dd > 0.5 && dt > 0 && dt < 60) {
        const dh = (eleGlatt[i] as number) - (eleGlatt[letzterIdx] as number);
        const steigung = dh / dd;
        gapDistanz += dd * gapFaktor(steigung);
        istDistanz += dd;
        gesamtZeit += dt;
      }
    }
    letzterIdx = i;
  }

  if (istDistanz < 200 || gesamtZeit <= 0) return null;
  return {
    gapDistanzM: gapDistanz,
    gapPaceSKm: gesamtZeit / (gapDistanz / 1000),
    istPaceSKm: gesamtZeit / (istDistanz / 1000),
  };
}
