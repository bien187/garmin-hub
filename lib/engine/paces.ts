import { riegelPrognose } from "./riegel";

/**
 * Trainings-Paces (Daniels-ähnliche Abstufung) aus der aktuellen
 * 5-km-Prognose (flach, ohne Last). Alle Paces in s/km.
 */
export interface TrainingsPaces {
  /** lockerer Dauerlauf / Z2 */
  z2: { von: number; bis: number };
  /** Marathon-/steady */
  steady: number;
  /** Schwelle (~1h-Rennpace) */
  schwelle: number;
  /** VO2max-Intervalle (~3-5 min Wiederholungen) */
  intervall: number;
  /** Wiederholungsläufe kurz/schnell */
  wiederholung: number;
  /** 5-km-Rennpace als Referenz */
  rennpace5k: number;
}

export function trainingsPaces(fuenfKmZeitS: number): TrainingsPaces {
  const renn = fuenfKmZeitS / 5; // s/km
  // Abstufungen relativ zur 5-km-Pace (empirisch an Daniels angelehnt)
  return {
    z2: { von: renn * 1.28, bis: renn * 1.42 },
    steady: renn * 1.18,
    schwelle: renn * 1.09,
    intervall: renn * 1.0,
    wiederholung: renn * 0.94,
    rennpace5k: renn,
  };
}

/** Riegel-Umrechnung für beliebige Zieldistanz auf Basis der 5-km-Prognose */
export function zeitFuerDistanz(fuenfKmZeitS: number, distanzM: number): number {
  return riegelPrognose(fuenfKmZeitS, 5000, distanzM);
}
