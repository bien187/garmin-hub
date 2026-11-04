import { addTage, tageDiff } from "@/lib/format";
import { EP_DATUM, EP_TAG_2, TAPER_START } from "./konstanten";

export interface Phase {
  nr: 1 | 2 | 3 | 4;
  name: string;
  fokus: string[];
  von: string; // ISO inklusiv
  bis: string; // ISO inklusiv
}

/**
 * 4-Phasen-Rahmenplan bis zur EP. Alle Grenzen sind kalendarisch fix:
 * Phase 3 „Spezifisch" endet am 04.11., der Taper läuft vom 05.11. bis zum
 * zweiten EP-Tag (19.11.). Die Tagesregeln des Tapers stehen in
 * `lib/engine/taper.ts` (`taperRegelFuerTag`).
 */
export function berechnePhasen(): Phase[] {
  return [
    {
      nr: 1,
      name: "Aerobe Basis",
      von: "2026-01-01",
      bis: "2026-08-02",
      fokus: [
        "80 % aller Läufe strikt Z2 (137–152 bpm)",
        "1× Intervalle (Z5) und 1× langer Lauf bis 80 Min. pro Woche",
        "Klimmzüge: Do schwer, WE Volumen, täglich Grease the Groove",
        "EP-Liegestütz-Technik 2×/Woche",
        "Rumpf im Sekundentakt 3×/Woche",
        "Exzentrische Bein-Konditionierung, Elektrolyte täglich",
      ],
    },
    {
      nr: 2,
      name: "Last & Hügel",
      von: "2026-08-03",
      bis: "2026-09-27",
      fokus: [
        "1 Lastlauf/Woche: Start 6–8 kg, +2 kg/Woche bis 20 kg",
        "Ab Woche 10 in Kampfstiefeln",
        "Hügel-Intervalle 8–10 × 60–90 s",
        "Klimmzüge mit Zusatzgewicht",
        "Step-ups, Ausfallschritte, Waden mit Gewichtsweste",
      ],
    },
    {
      nr: 3,
      name: "Spezifisch",
      von: "2026-09-28",
      bis: addTage(TAPER_START, -1),
      fokus: [
        "Lastläufe nur noch mit 20-kg-Rucksack + Stiefel, 5 km auf Zeit",
        "2 komplette Probe-EPs (alle 5 Disziplinen in EP-Reihenfolge)",
        "Schwachstellen gezielt nachschärfen",
        "Weste ≠ Rucksack-Mechanik: jetzt zwingend mit echtem Rucksack",
      ],
    },
    {
      nr: 4,
      name: "Taper",
      von: TAPER_START,
      bis: EP_TAG_2,
      fokus: [
        "05.–08.11.: Umfang −40 %, letzte Intensität am Sa 07.11.",
        "Mo 09.11. letzte schwere Beineinheit, Di 10.11. letzter Zieltempo-Lauf (max. 20 Min Z4)",
        "11.–15.11.: nur Z2 bis 30 Min flach, Klimmzüge/Liegestütze submaximal",
        "16./17.11.: Spazieren, Mobilität, frei — Schlaf, Elektrolyte, Kohlenhydrate",
        "Keine Probe-EP, kein Lastlauf, keine neuen Übungen",
      ],
    },
  ];
}

/**
 * Phase eines Datums. Vor Phase 1 → Phase 1; nach dem zweiten EP-Tag bleibt
 * es bei Phase 4 (Annahme: es gibt noch keine Phase „nach der EP" — der
 * Plan liefert dann über die Taper-Regeln Regeneration bzw. keinen Plan,
 * der Countdown meldet „EP absolviert").
 */
export function aktuellePhase(heute: string): Phase {
  const phasen = berechnePhasen();
  for (const p of phasen) {
    if (heute >= p.von && heute <= p.bis) return p;
  }
  return heute < phasen[0].von ? phasen[0] : phasen[3];
}

export interface Countdown {
  wochen: number;
  tage: number;
  gesamtTage: number;
  /** erst nach EP Tag 2 */
  vorbei: boolean;
  /** 1 bzw. 2 an den beiden EP-Tagen, sonst null */
  epTag: 1 | 2 | null;
}

/** Countdown bis Tag 1 der EP; an beiden EP-Tagen 0, „vorbei" erst nach Tag 2 */
export function epCountdown(heute: string): Countdown {
  const epTag = heute === EP_DATUM ? 1 : heute === EP_TAG_2 ? 2 : null;
  if (tageDiff(heute, EP_TAG_2) < 0) return { wochen: 0, tage: 0, gesamtTage: 0, vorbei: true, epTag: null };
  const diff = Math.max(0, tageDiff(heute, EP_DATUM));
  return {
    wochen: Math.floor(diff / 7),
    tage: diff % 7,
    gesamtTage: diff,
    vorbei: false,
    epTag,
  };
}

/** Restwochen (aufgerundet) bis zur EP — Basis für Plan-Interpolationen */
export function restwochen(heute: string): number {
  return Math.max(0, Math.ceil(tageDiff(heute, EP_DATUM) / 7));
}
