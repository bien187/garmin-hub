import type { PhasenName } from "@/lib/engine/schlaf";

/** CSS-Variablen der Schlafphasen (app/globals.css, hell + dunkel) */
export const PHASEN_FARBE: Record<PhasenName, string> = {
  tief: "var(--schlaf-tief)",
  leicht: "var(--schlaf-leicht)",
  rem: "var(--schlaf-rem)",
  wach: "var(--schlaf-wach)",
};

/** Höhe im Hypnogramm: Tief unten (0) … Wach oben (3) */
export const PHASEN_STUFE: Record<PhasenName, number> = { tief: 0, leicht: 1, rem: 2, wach: 3 };
