/**
 * Texte des Dashboard-Kopfs — rein, client-sicher.
 * Kontextbezogen statt Zufall: erst der heutige Plan, dann der Wochenstand,
 * dann ein fester Satz pro Wochentag.
 */

import { tageDiff } from "@/lib/format";

const SAETZE = [
  "Konstanz schlägt Intensität — Woche für Woche.",
  "Jeder Kilometer baut an deiner Grundlage.",
  "Locker bleibt locker, hart bleibt hart.",
  "Kleine Schritte, grosse Wirkung.",
  "Heute ein bisschen besser als letzte Woche.",
  "Erholung ist Teil des Trainings.",
  "Dein Tempo, dein Weg.",
];

export function motivation(inp: {
  heute: string;
  naechste: { datum: string; titel: string; typ: string } | null;
  fortschritt: { erledigt: number; geplant: number };
}): string {
  const { heute, naechste, fortschritt } = inp;
  if (naechste && naechste.datum === heute) {
    return `Heute steht «${naechste.titel}» an — du schaffst das.`;
  }
  if (fortschritt.geplant > 0 && fortschritt.erledigt >= fortschritt.geplant) {
    return `Alle ${fortschritt.geplant} Einheiten dieser Woche erledigt. Stark!`;
  }
  if (naechste && tageDiff(heute, naechste.datum) === 1) {
    return `Morgen: «${naechste.titel}». Heute zählt die Erholung.`;
  }
  const wochentag = (new Date(heute + "T12:00:00").getDay() + 6) % 7; // Mo = 0
  if (wochentag >= 5) return "Freies Wochenende — Lust auf einen lockeren Lauf? Alles kann, nichts muss.";
  return SAETZE[wochentag];
}
