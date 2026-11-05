/** Konstanten der öffentlichen Demo — client-sicher */

/** Statischer Datenstand (erzeugt mit `pnpm demo:daten`) */
export const DEMO_DATEN_PFAD = "/demo/daten";

export const DEMO_HINWEIS =
  "Garmin-Hub-Demo. Alle Aktivitäten, Gesundheits- und Schlafwerte sind fiktive Testdaten.";

/** „Heute" des fiktiven Datenstands (muss zu kern.json passen) */
export const DEMO_HEUTE = "2026-11-05";

/**
 * Optionaler Link „Zum Portfolio" (NEXT_PUBLIC_PORTFOLIO_URL, beim Build
 * eingesetzt). Nur http(s); ohne Variable kein Link.
 */
export function portfolioUrl(wert = process.env.NEXT_PUBLIC_PORTFOLIO_URL): string | null {
  if (!wert) return null;
  try {
    const u = new URL(wert);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}
