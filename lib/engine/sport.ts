/**
 * Sportart einer Garmin-Aktivität — rein, client-sicher.
 * Eine Quelle der Wahrheit für Server (compute) und Oberfläche (Icons/Farben).
 */

const LAUF_TYPEN = ["running", "trail_running", "street_running", "track_running", "treadmill_running"];
const KRAFT_TYPEN = ["strength_training", "indoor_cardio", "fitness_equipment"];

export function istLauf(typ: string): boolean {
  return LAUF_TYPEN.includes(typ) || typ.includes("running");
}

export function istKraft(typ: string): boolean {
  return KRAFT_TYPEN.includes(typ) || typ.includes("strength");
}

export type Sportart = "lauf" | "trail" | "kraft" | "velo" | "wandern" | "schwimmen" | "sonstiges";

export function sportart(typ: string): Sportart {
  const t = typ.toLowerCase();
  if (t.includes("trail")) return "trail";
  if (istLauf(t)) return "lauf";
  if (istKraft(t) || t.includes("fitness") || t.includes("cardio")) return "kraft";
  if (t.includes("cycling") || t.includes("biking") || t.includes("bike")) return "velo";
  if (t.includes("hiking") || t.includes("walking")) return "wandern";
  if (t.includes("swim")) return "schwimmen";
  return "sonstiges";
}

const NAMEN: Record<Sportart, string> = {
  lauf: "Lauf",
  trail: "Trail",
  kraft: "Kraft",
  velo: "Velo",
  wandern: "Wandern",
  schwimmen: "Schwimmen",
  sonstiges: "Training",
};

export function sportName(typ: string): string {
  return NAMEN[sportart(typ)];
}
