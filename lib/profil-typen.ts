/** Pure Profil-Typen/Helfer — client-sicher (kein DB-Import) */

export interface Profil {
  name: string;
  gewichtKg: number;
  groesseCm: number;
  /** wird bei Sync live aus Garmin überschrieben (7-Tage-Median) */
  ruhepuls: number;
  /** geschätzt, editierbar (Max-Puls-Test folgt) */
  hfMax: number;
  /** ISO, Tag 1 der zweitägigen EP */
  epDatum: string;
  /** Zusatzlast-Kalibrierung Lastlauf: s/km Zuschlag pro 10 kg (auto-kalibriert) */
  lastZuschlagSproKmPro10kg: number;
  stiefelMalusSproKm: number;
}

export const PROFIL_DEFAULTS: Profil = {
  name: "Ben",
  gewichtKg: 88,
  groesseCm: 185,
  ruhepuls: 46,
  hfMax: 197,
  epDatum: "2026-11-14", // Mitte November 2026 (editierbar in /settings)
  lastZuschlagSproKmPro10kg: 8.5, // ~7–10 s/km pro 10 kg, Startwert
  stiefelMalusSproKm: 10,
};

/** Karvonen-Herzfrequenzzonen aus Profil */
export function hrZonen(p: Pick<Profil, "ruhepuls" | "hfMax">) {
  const reserve = p.hfMax - p.ruhepuls;
  const k = (f: number) => Math.round(p.ruhepuls + f * reserve);
  return {
    z1: { von: k(0.5), bis: k(0.6) },
    z2: { von: k(0.6), bis: k(0.7) }, // Ben: 137–152
    z3: { von: k(0.7), bis: k(0.8) },
    z4: { von: k(0.8), bis: k(0.9) }, // 168–183
    z5: { von: k(0.9), bis: p.hfMax }, // 183–198
  };
}
