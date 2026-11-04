import { addTage, montagVon } from '@/lib/format';
import { fasseZusammen } from './pace-bei-hr';
export interface PaceWoche { woche: string; bis: string; paceSKm: number | null }
export function fortschrittBisHeute(tage: {datum:string; paceRefHrSKm:number|null; paceRefHrSekunden:number|null}[], heute:string, seit:string) {
  const aktuell = tage.filter(t => t.datum >= seit && t.datum <= heute && t.paceRefHrSKm != null);
  const wochen: PaceWoche[] = [];
  for (let woche=montagVon(seit); woche<=heute; woche=addTage(woche,7)) {
    const ende=addTage(woche,6);
    const bis=ende>heute?heute:ende;
    const werte=aktuell.filter(t=>t.datum>=woche && t.datum<=bis)
      .map(t=>({paceSKm:t.paceRefHrSKm!,sekunden:t.paceRefHrSekunden??60}));
    const pace=fasseZusammen(werte);
    wochen.push({woche,bis,paceSKm:pace?Math.round(pace.paceSKm):null});
  }
  return {wochen, letzteMessung:aktuell.map(t=>t.datum).sort().at(-1)??null};
}

/**
 * Trainingsstart = erster Tag in computed_daily, aber nie vor der ersten
 * nicht gelöschten Aktivität. computed_daily wird nur per Upsert
 * geschrieben: Wird die erste Einheit gelöscht, beginnt die neu gerechnete
 * Serie später und die Zeilen davor bleiben veraltet stehen.
 */
export function trainingsstartAus(ersteZeile: string | null | undefined, ersteAktivitaet: string | null | undefined): string | null {
  if (ersteZeile && ersteAktivitaet) return ersteAktivitaet > ersteZeile ? ersteAktivitaet : ersteZeile;
  return ersteZeile ?? ersteAktivitaet ?? null;
}

/** Verlaufsreihe (Fitness + Pace-Wochen) seit Trainingsstart bis heute */
export function verlaufSeitTrainingsstart<T extends {datum:string; paceRefHrSKm:number|null; paceRefHrSekunden:number|null}>(
  rows: readonly T[], heute: string, ersteAktivitaet: string | null
) {
  const ersteZeile = rows.reduce<string | null>((min, r) => (min == null || r.datum < min ? r.datum : min), null);
  const trainingsstart = trainingsstartAus(ersteZeile, ersteAktivitaet);
  const verlauf = trainingsstart ? rows.filter(r => r.datum >= trainingsstart && r.datum <= heute) : [];
  return { trainingsstart, verlauf, fortschritt: fortschrittBisHeute(verlauf, heute, trainingsstart ?? heute) };
}
