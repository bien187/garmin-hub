/**
 * Standard, ob eine Einheit an Garmin geht — explizit über den Typ, NICHT
 * über Namens-Matching. Gym-/nicht-pushbare Einheiten werden ausgeschlossen.
 * Pro Einheit in der UI überschreibbar — ausser `ep`: EP-Tage gehen nie an
 * die Uhr (auch serverseitig in Push-/PATCH-Route abgesichert).
 */
export function standardSyncToGarmin(typ: string): boolean {
  return !["kraft", "klimmzuege", "gtg", "ruhe", "probe_ep", "liegestuetze", "ep"].includes(typ);
}

/** EP-Einträge sind fix: nicht an Garmin, nicht löschbar, nicht umtypisierbar */
export function istFixerEpEintrag(e: { typ: string }): boolean {
  return e.typ === "ep";
}
