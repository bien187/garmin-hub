/**
 * Riegel-Zeitprognose: T2 = T1 × (D2/D1)^1.06
 * plus Best-Effort-Erkennung über rollende Fenster in den Streams.
 */

export function riegelPrognose(
  t1S: number,
  d1M: number,
  d2M: number,
  exponent = 1.06
): number {
  if (t1S <= 0 || d1M <= 0 || d2M <= 0) return NaN;
  return t1S * Math.pow(d2M / d1M, exponent);
}

export interface BestEffort {
  distanzM: number;
  zeitS: number;
  paceSKm: number;
}

/**
 * Schnellstes zusammenhängendes Fenster über `zielDistanzM` in einer
 * Aktivität (Zwei-Zeiger über den Distanz-Stream). null, wenn die
 * Aktivität kürzer als die Zieldistanz ist.
 */
export function bestEffort(
  zeitS: number[],
  distanzM: (number | null)[],
  zielDistanzM: number
): BestEffort | null {
  // Auf gültige Punkte reduzieren
  const t: number[] = [];
  const d: number[] = [];
  const n0 = Math.min(zeitS.length, distanzM.length);
  for (let i = 0; i < n0; i++) {
    const di = distanzM[i];
    if (di == null) continue;
    if (d.length > 0 && di < d[d.length - 1]) continue; // GPS-Rückschritt
    t.push(zeitS[i]);
    d.push(di);
  }
  const n = d.length;
  if (n < 2 || d[n - 1] - d[0] < zielDistanzM) return null;

  let beste = Infinity;
  let j = 0;
  for (let i = 0; i < n; i++) {
    while (j < n && d[j] - d[i] < zielDistanzM) j++;
    if (j >= n) break;
    // Lineare Interpolation des exakten Zeitpunkts, an dem die
    // Zieldistanz erreicht wurde
    const distVor = d[j - 1] - d[i];
    const distNach = d[j] - d[i];
    const f = distNach > distVor ? (zielDistanzM - distVor) / (distNach - distVor) : 1;
    const zeit = t[j - 1] + f * (t[j] - t[j - 1]) - t[i];
    if (zeit > 0 && zeit < beste) beste = zeit;
  }

  if (!isFinite(beste)) return null;
  return {
    distanzM: zielDistanzM,
    zeitS: beste,
    paceSKm: beste / (zielDistanzM / 1000),
  };
}

/**
 * Aus den besten Efforts (1/5/10 km) der letzten Wochen die 5-km-Prognose
 * ableiten. Einzelprojektionen sind unzuverlässig — kurze Bestwerte
 * (Schlusssprint, GPS) zu optimistisch, lange Fenster aus Z2-Läufen zu
 * pessimistisch. Deshalb: pro Zieldistanz den besten Effort projizieren
 * und den MEDIAN aller Projektionen nehmen. Paces < 150 s/km (2:30/km)
 * gelten als GPS-Artefakte und fliegen raus.
 */
export function fuenfKmPrognose(efforts: BestEffort[]): number | null {
  const plausibel = efforts.filter(
    (e) => e.distanzM >= 800 && isFinite(e.zeitS) && e.paceSKm > 150
  );

  // pro Distanz nur den schnellsten Effort berücksichtigen
  const besteProDistanz = new Map<number, BestEffort>();
  for (const e of plausibel) {
    const alt = besteProDistanz.get(e.distanzM);
    if (!alt || e.zeitS < alt.zeitS) besteProDistanz.set(e.distanzM, e);
  }

  const projektionen = [...besteProDistanz.values()]
    .map((e) => riegelPrognose(e.zeitS, e.distanzM, 5000))
    .filter((t) => isFinite(t))
    .sort((a, b) => a - b);
  if (projektionen.length === 0) return null;

  const n = projektionen.length;
  return n % 2 === 1
    ? projektionen[(n - 1) / 2]
    : (projektionen[n / 2 - 1] + projektionen[n / 2]) / 2;
}
