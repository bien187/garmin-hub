import { addTage, montagVon } from "@/lib/format";

/** Trainingsstunden einer Kalenderwoche (Mo–So) */
export interface KonsistenzWoche {
  /** Montag der Woche (ISO) */
  woche: string;
  stunden: number;
}

export interface Konsistenz {
  /** älteste zuerst, die letzte ist die laufende Woche */
  wochen: KonsistenzWoche[];
  /** Wochen-Budget in Stunden (Profil) */
  budgetH: number | null;
  /**
   * Abgeschlossene Wochen in Folge mit Training, rückwärts ab der Vorwoche.
   * Die laufende Woche zählt erst mit, sobald sie das Budget erreicht hat —
   * eine angefangene Woche soll die Serie weder brechen noch aufblähen.
   */
  serie: number;
}

const runde1 = (h: number) => Math.round(h * 10) / 10;

/**
 * Trainingszeit je Woche der letzten `anzahl` Wochen (inkl. laufender)
 * und die Serie aufeinanderfolgender Trainingswochen. Rein, ohne DB.
 * `einheiten.datum` = Kalendertag der Aktivität (ISO).
 */
export function berechneKonsistenz(
  einheiten: readonly { datum: string; dauerS: number }[],
  heute: string,
  budgetH: number | null,
  anzahl = 12
): Konsistenz {
  const proWoche = new Map<string, number>();
  for (const e of einheiten) {
    if (e.datum > heute || !(e.dauerS > 0)) continue;
    const w = montagVon(e.datum);
    proWoche.set(w, (proWoche.get(w) ?? 0) + e.dauerS);
  }
  const stundenVon = (w: string) => (proWoche.get(w) ?? 0) / 3600;

  const dieseWoche = montagVon(heute);
  const wochen: KonsistenzWoche[] = [];
  for (let i = anzahl - 1; i >= 0; i--) {
    const w = addTage(dieseWoche, -7 * i);
    wochen.push({ woche: w, stunden: runde1(stundenVon(w)) });
  }

  // Serie über die ganze Historie, nicht nur die sichtbaren Wochen
  const ersteWoche = [...proWoche.keys()].sort()[0];
  let serie = 0;
  if (ersteWoche) {
    for (let w = addTage(dieseWoche, -7); w >= ersteWoche && stundenVon(w) > 0; w = addTage(w, -7)) {
      serie++;
    }
  }
  if (budgetH != null && budgetH > 0 && stundenVon(dieseWoche) >= budgetH) serie++;

  return { wochen, budgetH, serie };
}
