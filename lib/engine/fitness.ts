/**
 * CTL/ATL/TSB nach dem klassischen Impuls-Response-Modell:
 * EWMA des Tages-TRIMP mit Zeitkonstante 42 (CTL) bzw. 7 (ATL) Tagen.
 * TSB(heute) = CTL(gestern) − ATL(gestern) — hier vereinfacht auf
 * TSB = CTL − ATL des Vortagsstands vor Addition der heutigen Last.
 */

export interface FitnessTag {
  datum: string;
  trimp: number;
  ctl: number;
  atl: number;
  tsb: number;
  acwr: number | null;
}

const CTL_TC = 42;
const ATL_TC = 7;

/**
 * Berechnet die komplette Fitness-Serie über lückenlose, aufsteigend
 * sortierte Tage (Lücken müssen vorher mit trimp=0 gefüllt sein).
 */
export function berechneFitnessSerie(
  tage: { datum: string; trimp: number }[]
): FitnessTag[] {
  const kCtl = 1 - Math.exp(-1 / CTL_TC);
  const kAtl = 1 - Math.exp(-1 / ATL_TC);
  let ctl = 0;
  let atl = 0;
  const out: FitnessTag[] = [];
  const trimps: number[] = [];

  for (let i = 0; i < tage.length; i++) {
    const t = tage[i];
    // TSB = Form vor der heutigen Einheit (gestriger Stand)
    const tsb = ctl - atl;
    ctl = ctl + kCtl * (t.trimp - ctl);
    atl = atl + kAtl * (t.trimp - atl);
    trimps.push(t.trimp);

    out.push({
      datum: t.datum,
      trimp: t.trimp,
      ctl,
      atl,
      tsb,
      acwr: berechneAcwr(trimps),
    });
  }
  return out;
}

/**
 * ACWR = Last der letzten 7 Tage / Ø-Wochenlast der letzten 28 Tage.
 * null, solange < 28 Tage Daten (nicht aussagekräftig).
 */
export function berechneAcwr(trimps: number[]): number | null {
  if (trimps.length < 28) return null;
  const letzte7 = trimps.slice(-7).reduce((a, b) => a + b, 0);
  const letzte28 = trimps.slice(-28).reduce((a, b) => a + b, 0);
  const chronischProWoche = letzte28 / 4;
  if (chronischProWoche === 0) return null;
  return letzte7 / chronischProWoche;
}

export type TsbZone = "frisch" | "produktiv" | "neutral" | "warnung";

export function tsbZone(tsb: number): TsbZone {
  if (tsb > 10) return "frisch";
  if (tsb >= -10) return "produktiv";
  if (tsb >= -20) return "neutral";
  return "warnung";
}

export type AcwrZone = "unter" | "sweetspot" | "erhoeht" | "gefahr";

export function acwrZone(acwr: number | null): AcwrZone | null {
  if (acwr == null) return null;
  if (acwr < 0.8) return "unter";
  if (acwr <= 1.3) return "sweetspot";
  if (acwr <= 1.5) return "erhoeht";
  return "gefahr";
}
