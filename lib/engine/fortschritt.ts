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

/**
 * Verlaufsreihe (Fitness) seit Trainingsstart bis heute. Die frühere
 * Wochenkurve „Pace bei Puls" ersetzt Aerobic Performance
 * (lib/engine/aerobe-leistung.ts).
 */
export function verlaufSeitTrainingsstart<T extends {datum:string}>(
  rows: readonly T[], heute: string, ersteAktivitaet: string | null
) {
  const ersteZeile = rows.reduce<string | null>((min, r) => (min == null || r.datum < min ? r.datum : min), null);
  const trainingsstart = trainingsstartAus(ersteZeile, ersteAktivitaet);
  const verlauf = trainingsstart ? rows.filter(r => r.datum >= trainingsstart && r.datum <= heute) : [];
  return { trainingsstart, verlauf };
}
