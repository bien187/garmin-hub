/**
 * Plan-Typen und kleine Helfer — rein, client-sicher (kein DB-Import).
 *
 * Ältere Einträge in `planned_workouts` können noch Typen tragen, die der
 * Generator nicht mehr erzeugt (z. B. „rumpf" oder „gtg"). Die Oberfläche
 * zeigt sie trotzdem an; die Engine plant sie nur nicht mehr neu ein.
 */

export type PlanTyp =
  | "lauf_z2"
  | "intervalle"
  | "huegel_intervalle"
  | "langer_lauf"
  | "kraft"
  | "klimmzuege"
  | "ruhe";

/** Typen, die als Lauf zählen (höchstens einer pro Tag) */
export const LAUF_TYPEN: readonly string[] = ["lauf_z2", "intervalle", "huegel_intervalle", "langer_lauf"];

export function istLaufTyp(typ: string): boolean {
  return LAUF_TYPEN.includes(typ);
}

/** Minuten aus einem Titel wie „Z2-Lauf 45 Min" (sonst null) */
export function minutenAusTitel(titel: string): number | null {
  const m = titel.match(/(\d{2,3})\s*Min/i);
  return m ? parseInt(m[1], 10) : null;
}
