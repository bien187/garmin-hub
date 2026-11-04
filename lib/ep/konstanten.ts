/**
 * Fixer EP-Termin — client-sicher, keine Imports.
 *
 * Das Datum ist bewusst NICHT mehr im Profil editierbar: Taper-Plan,
 * Countdown und EP-Einträge im Plan hängen daran. Ein gespeicherter
 * `profil.epDatum`-Wert in der DB wird ignoriert.
 */

/** Tag 1 der zweitägigen Eignungsprüfung (Mi 18.11.2026) */
export const EP_DATUM = "2026-11-18";

/** Tag 2 der EP (Do 19.11.2026) — Annahme, siehe README */
export const EP_TAG_2 = "2026-11-19";

/** Erster Taper-Tag (Do 05.11.2026); Phase „Spezifisch" endet am Vortag */
export const TAPER_START = "2026-11-05";

/** Letzter Tag der Regenerationsvorgabe nach der EP (Annahme, siehe README) */
export const REGENERATION_BIS = "2026-11-22";

export function istEpTag(datum: string): boolean {
  return datum === EP_DATUM || datum === EP_TAG_2;
}
