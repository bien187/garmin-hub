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

export interface LastlaufPrognoseInput {
  /** 5-km-Prognose flach ohne Last, Sekunden */
  fuenfKmFlachS: number;
  zusatzlastKg: number;
  mitStiefeln: boolean;
  /** kalibrierter Zuschlag s/km pro 10 kg Zusatzlast */
  zuschlagSproKmPro10kg: number;
  stiefelMalusSproKm: number;
}

/**
 * Lastlauf-Prognose: empirischer Zuschlag auf die 5-km-GAP-Prognose,
 * ~7–10 s/km pro 10 kg + Stiefel-Malus. Faktor wird per Regression
 * kalibriert, sobald echte Lastläufe vorliegen (kalibriereZuschlag).
 */
export function lastlaufPrognose(inp: LastlaufPrognoseInput): number {
  const basisPace = inp.fuenfKmFlachS / 5;
  const zuschlag =
    (inp.zusatzlastKg / 10) * inp.zuschlagSproKmPro10kg +
    (inp.mitStiefeln ? inp.stiefelMalusSproKm : 0);
  return (basisPace + zuschlag) * 5;
}

export interface LastlaufMessung {
  zusatzlastKg: number;
  /** Pace-Differenz zum unbelasteten GAP-Niveau am selben Fitnessstand, s/km */
  paceDifferenzSproKm: number;
}

/**
 * Kalibrierung: Regression (durch Ursprung) Zusatzgewicht ↔ Pace-Differenz.
 * Liefert den neuen Zuschlag s/km pro 10 kg; null bei zu wenig Daten.
 */
export function kalibriereZuschlag(
  messungen: LastlaufMessung[]
): number | null {
  const valide = messungen.filter((m) => m.zusatzlastKg > 0);
  if (valide.length < 2) return null;
  let zaehler = 0;
  let nenner = 0;
  for (const m of valide) {
    zaehler += m.zusatzlastKg * m.paceDifferenzSproKm;
    nenner += m.zusatzlastKg ** 2;
  }
  if (nenner === 0) return null;
  const proKg = zaehler / nenner;
  // plausibler Bereich: 3–20 s/km pro 10 kg
  return Math.min(20, Math.max(3, proKg * 10));
}

/** Riegel-Umrechnung für beliebige Zieldistanz auf Basis der 5-km-Prognose */
export function zeitFuerDistanz(fuenfKmZeitS: number, distanzM: number): number {
  return riegelPrognose(fuenfKmZeitS, 5000, distanzM);
}
