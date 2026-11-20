/**
 * Trainingsblock — rein, client-sicher (kein DB-Import).
 *
 * Das Programm läuft in wiederkehrenden 4-Wochen-Blöcken: drei Aufbauwochen
 * mit wechselndem Intervall-Schwerpunkt, danach eine Entlastungswoche. Der
 * Rhythmus ist kalendarisch fix (Anker: `PROGRAMM_START`), damit jede Woche
 * eindeutig einer Blockwoche zugeordnet ist — auch rückwirkend.
 */

import { montagVon, tageDiff } from "@/lib/format";

/** Montag der ersten Woche des Programms „Personal Fitness & Running Performance" */
export const PROGRAMM_START = "2026-11-23";

export type BlockWoche = 1 | 2 | 3 | 4;

export interface Trainingsblock {
  /** 1–3 Aufbau, 4 Entlastung */
  woche: BlockWoche;
  /** fortlaufender Wochenindex seit Programmstart (0 = erste Woche, davor negativ) */
  index: number;
  /** Kurzname, z. B. „Aufbau 2" */
  name: string;
  /** Schwerpunkt der Woche in wenigen Worten */
  fokus: string;
  entlastung: boolean;
}

const BLOCK: Record<BlockWoche, { name: string; fokus: string }> = {
  1: { name: "Aufbau 1", fokus: "VO₂max-Intervalle" },
  2: { name: "Aufbau 2", fokus: "Hügel und Laufkraft" },
  3: { name: "Aufbau 3", fokus: "Tempo an der Schwelle" },
  4: { name: "Entlastung", fokus: "Erholen und Frische sammeln" },
};

/** Blockwoche eines beliebigen Datums (massgebend ist der Montag der Woche) */
export function trainingsblock(datum: string): Trainingsblock {
  const index = Math.floor(tageDiff(PROGRAMM_START, montagVon(datum)) / 7);
  const woche = ((((index % 4) + 4) % 4) + 1) as BlockWoche;
  return { woche, index, ...BLOCK[woche], entlastung: woche === 4 };
}
