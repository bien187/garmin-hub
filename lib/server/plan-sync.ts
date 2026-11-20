import { istLaufTyp } from "@/lib/engine/plan-typen";

/**
 * Standard, ob eine Einheit an Garmin geht — explizit über den Typ, NICHT
 * über Namens-Matching. Läufe gehen standardmässig auf die Uhr, Gym- und
 * Ruhe-Einheiten nicht. Pro Einheit in der UI überschreibbar.
 */
export function standardSyncToGarmin(typ: string): boolean {
  return istLaufTyp(typ);
}
