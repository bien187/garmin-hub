/**
 * Was passiert beim Neugenerieren einer Woche mit den bestehenden Einträgen?
 * Reine Funktion — die DB-Schreibzugriffe macht lib/server/plan-service.ts.
 *
 * Regeln:
 *  - `absolviert` und alles vor heute bleibt.
 *  - Bereits an Garmin übertragene Einträge (gepusht bzw. mit Garmin-ID)
 *    werden nie gelöscht.
 *  - Offene `geplant`-Einträge ohne Garmin-ID ab heute werden ersetzt, wenn
 *    ihr Tag frei (nicht belegt) oder gesperrt ist. Auf belegten Tagen (ein
 *    Eintrag liegt schon auf der Uhr oder ist erledigt) bleiben sie stehen.
 */

import type { PlanEinheit } from "./plan";

export interface BestandsEintrag {
  id: string;
  datum: string;
  typ: string;
  titel: string;
  status: string; // geplant | gepusht | absolviert | verpasst
  garminWorkoutId: number | null;
  beschreibung?: string | null;
}

export type BestandsAktion = "behalten" | "ersetzen";

export interface BestandsEntscheid {
  id: string;
  datum: string;
  aktion: BestandsAktion;
  grund: string;
}

const aufDerUhr = (e: BestandsEintrag) => e.status === "gepusht" || e.garminWorkoutId != null;

/** Tage, die beim Neugenerieren fix bleiben (erledigt, verpasst oder übertragen) */
export function belegteTage(bestehende: BestandsEintrag[]): string[] {
  return [
    ...new Set(
      bestehende.filter((b) => b.status !== "geplant" || b.garminWorkoutId != null).map((b) => b.datum)
    ),
  ];
}

export function entscheideEintrag(
  e: BestandsEintrag,
  ctx: { heute: string; gesperrt: string[]; belegt: string[] }
): BestandsEntscheid {
  const ergebnis = (aktion: BestandsAktion, grund: string): BestandsEntscheid => ({
    id: e.id,
    datum: e.datum,
    aktion,
    grund,
  });
  if (e.status === "absolviert") return ergebnis("behalten", "bereits absolviert");
  if (e.datum < ctx.heute) return ergebnis("behalten", "liegt in der Vergangenheit");
  if (aufDerUhr(e)) return ergebnis("behalten", "liegt auf der Uhr");
  if (e.status !== "geplant") return ergebnis("behalten", `Status ${e.status}`);
  if (ctx.gesperrt.includes(e.datum) || !ctx.belegt.includes(e.datum)) {
    return ergebnis("ersetzen", "wird neu geplant");
  }
  return ergebnis("behalten", "Tag ist bereits belegt");
}

export interface BestandsPlan {
  entscheide: BestandsEntscheid[];
  /** IDs, die gelöscht werden */
  loeschen: string[];
  /** neu anzulegende Einheiten */
  einfuegen: PlanEinheit[];
}

/**
 * @param neu  geplante Einheiten nach dem Verteilen (nur freie Tage ab heute)
 */
export function planeBestand(inp: {
  bestehende: BestandsEintrag[];
  neu: PlanEinheit[];
  heute: string;
  gesperrt: string[];
  belegt?: string[];
}): BestandsPlan {
  const belegt = inp.belegt ?? belegteTage(inp.bestehende);
  const entscheide = inp.bestehende.map((e) =>
    entscheideEintrag(e, { heute: inp.heute, gesperrt: inp.gesperrt, belegt })
  );
  return {
    entscheide,
    loeschen: entscheide.filter((d) => d.aktion === "ersetzen").map((d) => d.id),
    einfuegen: [...inp.neu].sort((a, b) => a.datum.localeCompare(b.datum)),
  };
}
