import { addTage, tageDiff } from "@/lib/format";

export interface Phase {
  nr: 1 | 2 | 3 | 4;
  name: string;
  fokus: string[];
  von: string; // ISO inklusiv
  bis: string; // ISO inklusiv
}

/**
 * 4-Phasen-Rahmenplan bis zur EP. Phasengrenzen 1/2 sind kalendarisch fixiert
 * (Anfang Aug. / Ende Sep.), Taper hängt am EP-Datum (letzte ~2 Wochen,
 * ausgerichtet auf Tag 1 der zweitägigen EP).
 */
export function berechnePhasen(epDatum: string): Phase[] {
  const taperStart = addTage(epDatum, -13);
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
      bis: addTage(taperStart, -1),
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
      von: taperStart,
      bis: epDatum,
      fokus: [
        "Umfang halbieren, Intensität kurz halten",
        "Letzte 3 Tage: nur Spazieren, Schlaf, Elektrolyte, Kohlenhydrate",
        "Taper auf Tag 1 der zweitägigen EP ausrichten",
      ],
    },
  ];
}

export function aktuellePhase(heute: string, epDatum: string): Phase {
  const phasen = berechnePhasen(epDatum);
  for (const p of phasen) {
    if (heute >= p.von && heute <= p.bis) return p;
  }
  return heute < phasen[0].bis ? phasen[0] : phasen[3];
}

export interface Countdown {
  wochen: number;
  tage: number;
  gesamtTage: number;
  vorbei: boolean;
}

export function epCountdown(heute: string, epDatum: string): Countdown {
  const diff = tageDiff(heute, epDatum);
  if (diff < 0) return { wochen: 0, tage: 0, gesamtTage: 0, vorbei: true };
  return {
    wochen: Math.floor(diff / 7),
    tage: diff % 7,
    gesamtTage: diff,
    vorbei: false,
  };
}

/** Restwochen (aufgerundet) bis zur EP — Basis für Plan-Interpolationen */
export function restwochen(heute: string, epDatum: string): number {
  return Math.max(0, Math.ceil(tageDiff(heute, epDatum) / 7));
}
