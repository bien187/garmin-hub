/**
 * Wöchentlicher Plan-Generator — reine, deterministische Funktion.
 *
 * (Blockwoche, Vorwochen-Umfang, TSB, ACWR, Muskelstatus, Readiness,
 *  Paces, Zonen) → Wochenplan
 *
 * Ziel: Laufleistung, Ausdauer und allgemeine Fitness verbessern.
 *
 * Fester Wochenrhythmus:
 *  - Mo  Gym (Brust/Trizeps + Rumpf)
 *  - Di  Intervalle — Schwerpunkt wechselt mit der Blockwoche
 *  - Mi  Lockerer Dauerlauf in Zone 2 (ab 70 Min als langer Lauf)
 *  - Do  Gym (Rücken/Bizeps, Klimmzüge, Läufer-Kraft für die Beine)
 *  - Fr  Ruhetag
 *  - Sa/So frei — keine Pflichteinheiten
 *
 * Anpassungsregeln (unverändert aus dem bisherigen Generator):
 *  - Umfangssteigerung max. +10 %/Woche, jede 4. Woche Entlastung (−30 %)
 *  - ACWR > 1.3 → Umfang deckeln; TSB < −20 → Intervalle raus, Extra-Ruhetag
 *  - Harte Läufe nie auf müde Beine (Quadrizeps/Waden ≥ 60 %): dann tauschen
 *    Intervalle und lockerer Lauf die Tage (Di ↔ Mi)
 *  - Tiefe Training Readiness → Hinweis, die harte Einheit zu tauschen
 */

import { addTage } from "@/lib/format";
import { TrainingsPaces } from "./paces";
import { MuskelId } from "./muscle";
import { WorkoutStruktur } from "@/lib/garmin/workout-types";
import type { BlockWoche } from "./block";
import { geplanteDauerS } from "./einheit";
import type { PlanTyp } from "./plan-typen";

export type { PlanTyp } from "./plan-typen";

export interface HrZonenInput {
  z2: { von: number; bis: number };
  z4: { von: number; bis: number };
  z5: { von: number; bis: number };
}

export interface PlanInput {
  /** Montag der zu planenden Woche (ISO) */
  wochenstart: string;
  /** Woche im 4-Wochen-Block: 1–3 Aufbau, 4 Entlastung */
  blockWoche: BlockWoche;
  /** Lauf-Minuten der Vorwoche Mo–Fr (tatsächlich absolviert, ohne freie Wochenend-Läufe) */
  vorwocheLaufMin: number;
  tsb: number | null;
  acwr: number | null;
  /** Rest-Erschöpfung heute, 0–100 pro Muskel */
  muscleState: Partial<Record<MuskelId, number>>;
  /** Meiste saubere Klimmzüge in einem Satz der letzten Wochen (Garmin-Kraftsätze) */
  klimmzugMax: number | null;
  readiness: number | null;
  paces: TrainingsPaces | null;
  zonen: HrZonenInput;
}

export interface PlanEinheit {
  datum: string;
  typ: PlanTyp;
  titel: string;
  beschreibung: string;
  struktur?: WorkoutStruktur;
  erwarteterTrimp?: number;
}

export interface Wochenplan {
  wochenstart: string;
  /** Blockwoche (wird als `phase` gespeichert) */
  phaseNr: number;
  einheiten: PlanEinheit[];
  hinweise: string[];
}

/** Untergrenze für den Vorwochen-Umfang (zwei Läufe à ~45 Min) */
export const MIN_BASIS_MIN = 90;
/** Spanne des lockeren Dauerlaufs */
export const Z2_MIN = 30;
export const Z2_MAX = 80;
/** Obergrenze des lockeren Laufs in Entlastungswochen */
export const Z2_MAX_ENTLASTUNG = 60;
/** Ab dieser Dauer wird der lockere Lauf als langer Lauf geplant */
export const LANGER_LAUF_AB = 70;

/* ------------------------------------------------------------------ */
/* Struktur-Bausteine                                                  */
/* ------------------------------------------------------------------ */

/** Auch von der laufenden Plan-Anpassung genutzt (abgeschwächte Einheiten) */
export function z2Lauf(min: number, zonen: HrZonenInput, name: string): WorkoutStruktur {
  return {
    name,
    sport: "laufen",
    schritte: [
      { art: "aufwaermen", dauerTyp: "zeit", dauerWert: 600, notiz: "Locker einlaufen" },
      {
        art: "intervall",
        dauerTyp: "zeit",
        dauerWert: Math.max(0, min - 15) * 60,
        ziel: { typ: "hr", vonBpm: zonen.z2.von, bisBpm: zonen.z2.bis },
        notiz: "Strikt Zone 2 — so locker, dass du dich unterhalten könntest",
      },
      { art: "auslaufen", dauerTyp: "zeit", dauerWert: 300 },
    ],
  };
}

function intervalle(
  anzahl: number,
  dauerS: number,
  pauseS: number,
  zonen: HrZonenInput,
  paces: TrainingsPaces | null,
  name: string
): WorkoutStruktur {
  return {
    name,
    sport: "laufen",
    schritte: [
      { art: "aufwaermen", dauerTyp: "zeit", dauerWert: 900, notiz: "Einlaufen + Steigerungen" },
      {
        art: "wiederholung",
        dauerTyp: "offen",
        wiederholungen: anzahl,
        schritte: [
          {
            art: "intervall",
            dauerTyp: "zeit",
            dauerWert: dauerS,
            ziel: paces
              ? { typ: "pace", vonSproKm: paces.intervall * 1.03, bisSproKm: paces.intervall * 0.97 }
              : { typ: "hr", vonBpm: zonen.z5.von, bisBpm: zonen.z5.bis },
            notiz: "Zone 5 / VO₂max",
          },
          { art: "erholung", dauerTyp: "zeit", dauerWert: pauseS, notiz: "Trab-Pause" },
        ],
      },
      { art: "auslaufen", dauerTyp: "zeit", dauerWert: 600 },
    ],
  };
}

function huegelIntervalle(anzahl: number, dauerS: number, name: string): WorkoutStruktur {
  return {
    name,
    sport: "laufen",
    schritte: [
      { art: "aufwaermen", dauerTyp: "zeit", dauerWert: 900 },
      {
        art: "wiederholung",
        dauerTyp: "offen",
        wiederholungen: anzahl,
        schritte: [
          {
            art: "intervall",
            dauerTyp: "zeit",
            dauerWert: dauerS,
            notiz: "Bergauf zügig, aufrechte Haltung, kurze Schritte",
          },
          { art: "erholung", dauerTyp: "zeit", dauerWert: 150, notiz: "Locker zurücktraben" },
        ],
      },
      { art: "auslaufen", dauerTyp: "zeit", dauerWert: 600 },
    ],
  };
}

/** 5 × 1 km im 5-km-Tempo — Distanz-Wiederholungen */
function tempoKilometer(zonen: HrZonenInput, paces: TrainingsPaces | null, name: string): WorkoutStruktur {
  return {
    name,
    sport: "laufen",
    schritte: [
      { art: "aufwaermen", dauerTyp: "zeit", dauerWert: 900, notiz: "Einlaufen + Steigerungen" },
      {
        art: "wiederholung",
        dauerTyp: "offen",
        wiederholungen: 5,
        schritte: [
          {
            art: "intervall",
            dauerTyp: "distanz",
            dauerWert: 1000,
            ziel: paces
              ? { typ: "pace", vonSproKm: paces.rennpace5k * 1.02, bisSproKm: paces.rennpace5k * 0.98 }
              : { typ: "hr", vonBpm: zonen.z4.von, bisBpm: zonen.z5.bis },
            notiz: "5-km-Tempo, gleichmässig",
          },
          { art: "erholung", dauerTyp: "zeit", dauerWert: 90, notiz: "Trab-Pause" },
        ],
      },
      { art: "auslaufen", dauerTyp: "zeit", dauerWert: 600 },
    ],
  };
}

function langerLauf(min: number, zonen: HrZonenInput): WorkoutStruktur {
  return {
    name: `Langer Lauf ${min} Min`,
    sport: "laufen",
    schritte: [
      {
        art: "intervall",
        dauerTyp: "zeit",
        dauerWert: min * 60,
        ziel: { typ: "hr", vonBpm: zonen.z2.von, bisBpm: zonen.z2.bis },
        notiz: "Gleichmässig Zone 2, Entkopplung < 5 % anpeilen",
      },
    ],
  };
}

/** Mo: bestehende Brust/Trizeps-Routine, Rumpf als Finisher */
function gymBrustTrizeps(): WorkoutStruktur {
  return {
    name: "Gym: Brust/Trizeps + Rumpf",
    sport: "kraft",
    uebungen: [
      { name: "Bankdrücken", saetze: 4, wdh: 8, notiz: "2 Wiederholungen Reserve" },
      { name: "Schulterdrücken", saetze: 3, wdh: 10 },
      { name: "Dips", saetze: 3, wdh: 10 },
      { name: "Trizepsdrücken am Kabel", saetze: 3, wdh: 12 },
      { name: "Plank", saetze: 3, dauerS: 60 },
      { name: "Seitstütz", saetze: 2, dauerS: 40, notiz: "pro Seite" },
    ],
  };
}

/** Do: Rücken/Bizeps mit Klimmzug-Fokus, Läufer-Kraft für die Beine, Rumpf */
function gymRueckenBeine(klimmzugMax: number | null): WorkoutStruktur {
  const arbeitsWdh = klimmzugMax != null ? Math.max(3, Math.round(klimmzugMax * 0.6)) : undefined;
  return {
    name: "Gym: Rücken/Bizeps + Beine",
    sport: "kraft",
    uebungen: [
      {
        name: "Klimmzüge Ristgriff",
        saetze: 5,
        wdh: arbeitsWdh,
        notiz: arbeitsWdh
          ? "2–3 Min Pause, sauber bis zum Kinn"
          : "2–3 Min Pause, jeweils 2–3 Wiederholungen vor dem Versagen aufhören",
      },
      { name: "Rudern am Kabel", saetze: 3, wdh: 10 },
      { name: "Bizeps-Curls", saetze: 3, wdh: 12 },
      { name: "Ausfallschritte", saetze: 3, wdh: 10, notiz: "pro Seite, kontrolliert absenken" },
      { name: "Rumänisches Kreuzheben", saetze: 3, wdh: 8 },
      { name: "Wadenheben", saetze: 3, wdh: 15, notiz: "langsam exzentrisch" },
      { name: "Rückenstrecker", saetze: 2, wdh: 15 },
    ],
  };
}

/** Kraft-Struktur mit reduzierten Sätzen (mind. 1 Satz pro Übung) */
function skaliereSaetze(struktur: WorkoutStruktur, faktor: number): WorkoutStruktur {
  if (!struktur.uebungen) return struktur;
  return {
    ...struktur,
    uebungen: struktur.uebungen.map((u) => ({ ...u, saetze: Math.max(1, Math.round(u.saetze * faktor)) })),
  };
}

const runde5 = (n: number) => Math.round(n / 5) * 5;

/* ------------------------------------------------------------------ */
/* Qualitätseinheit je Blockwoche                                      */
/* ------------------------------------------------------------------ */

function qualitaetsEinheit(datum: string, inp: PlanInput): PlanEinheit {
  switch (inp.blockWoche) {
    case 1:
      return {
        datum,
        typ: "intervalle",
        titel: "Intervalle 5×3 Min",
        beschreibung:
          "5 × 3 Min in Zone 5 mit 2:30 Min Trab-Pause. Hebt die maximale Sauerstoffaufnahme (VO₂max) — die harte Laufeinheit der Woche.",
        struktur: intervalle(5, 180, 150, inp.zonen, inp.paces, "Intervalle 5×3 Min"),
        erwarteterTrimp: 85,
      };
    case 2:
      return {
        datum,
        typ: "huegel_intervalle",
        titel: "Hügel-Intervalle 8×75 s",
        beschreibung:
          "8 × 75 s bergauf zügig, locker zurücktraben. Baut Laufkraft und eine ökonomische Technik auf — ohne harte Landungen.",
        struktur: huegelIntervalle(8, 75, "Hügel-Intervalle 8×75 s"),
        erwarteterTrimp: 85,
      };
    case 3:
      return {
        datum,
        typ: "intervalle",
        titel: "Tempo 5×1 km",
        beschreibung:
          "5 × 1 km im 5-km-Tempo mit 90 s Trab-Pause. Verschiebt die Schwelle nach oben und schärft das Tempogefühl.",
        struktur: tempoKilometer(inp.zonen, inp.paces, "Tempo 5×1 km"),
        erwarteterTrimp: 95,
      };
    case 4:
      return {
        datum,
        typ: "intervalle",
        titel: "Lockere Spitzen 4×60 s",
        beschreibung:
          "4 × 60 s zügig, 2 Min Trab-Pause. Hält die Beine schnell, ohne Ermüdung aufzubauen.",
        struktur: intervalle(4, 60, 120, inp.zonen, inp.paces, "Lockere Spitzen 4×60 s"),
        erwarteterTrimp: 45,
      };
  }
}

/* ------------------------------------------------------------------ */
/* Generator                                                           */
/* ------------------------------------------------------------------ */

export function generiereWochenplan(inp: PlanInput): Wochenplan {
  const hinweise: string[] = [];
  const einheiten: PlanEinheit[] = [];
  const tag = (i: number) => addTage(inp.wochenstart, i); // 0 = Mo
  const entlastung = inp.blockWoche === 4;

  /* ---- Umfangssteuerung (geplante Laufminuten) ---- */
  const basisMin = Math.max(MIN_BASIS_MIN, inp.vorwocheLaufMin || MIN_BASIS_MIN);
  let zielMin = basisMin * 1.1; // max +10 %
  if (entlastung) {
    zielMin = basisMin * 0.7;
    hinweise.push("Entlastungswoche: Umfang −30 % — die Anpassung passiert in der Erholung.");
  }
  if (inp.acwr != null && inp.acwr > 1.3) {
    zielMin = Math.min(zielMin, basisMin);
    hinweise.push(
      `ACWR ${inp.acwr.toFixed(2)} über 1.3 — Umfang diese Woche gedeckelt (Verletzungsprävention).`
    );
  }
  const extraRuhetag = inp.tsb != null && inp.tsb < -20;

  /* ---- Muskel-Gates ---- */
  const beineFrisch =
    (inp.muscleState.quadrizeps ?? 0) < 60 && (inp.muscleState.waden ?? 0) < 60;
  const harterTag = beineFrisch ? 1 : 2; // Di, bei müden Beinen Mi
  const lockererTag = harterTag === 1 ? 2 : 1;
  if (!beineFrisch && !extraRuhetag) {
    hinweise.push(
      "Quadrizeps/Waden noch ≥ 60 % erschöpft — Intervalle auf Mittwoch, der lockere Lauf kommt zuerst."
    );
  }

  /* ---- Mo: Gym ---- */
  const gymFaktor = entlastung ? 0.6 : 1;
  const brust = skaliereSaetze(gymBrustTrizeps(), gymFaktor);
  einheiten.push({
    datum: tag(0),
    typ: "kraft",
    titel: "Gym: Brust/Trizeps + Rumpf",
    beschreibung: entlastung
      ? "Bestehende Routine mit rund 40 % weniger Sätzen, Rumpf als Finisher. Nichts steigern."
      : "Bestehende Routine, Rumpf als Finisher. Beine bleiben frisch für die Intervalle am Dienstag.",
    struktur: brust,
    erwarteterTrimp: Math.round(35 * gymFaktor),
  });

  /* ---- Di/Mi: Intervalle + lockerer Lauf ---- */
  const qualitaet = qualitaetsEinheit(tag(harterTag), inp);
  const qualiMin = extraRuhetag
    ? 0
    : Math.round((geplanteDauerS(qualitaet.struktur, inp.paces?.rennpace5k ?? 330) ?? 3000) / 60);
  let z2Min = Math.min(Z2_MAX, Math.max(Z2_MIN, runde5(zielMin - qualiMin)));
  // Entlastung: auch der lockere Lauf bleibt kurz
  if (entlastung) z2Min = Math.min(z2Min, Z2_MAX_ENTLASTUNG);
  if (extraRuhetag) {
    z2Min = Math.min(z2Min, 40);
    hinweise.push(
      `TSB ${inp.tsb?.toFixed(0)} < −20: Intervalle gestrichen, dafür ein Extra-Ruhetag. Der lockere Lauf bleibt kurz.`
    );
    einheiten.push({
      datum: tag(harterTag),
      typ: "ruhe",
      titel: "Extra-Ruhetag",
      beschreibung: "Die Form ist tief im Minus (TSB < −20). Spazieren, Mobilität, früh schlafen.",
    });
  } else {
    einheiten.push(qualitaet);
  }

  if (z2Min >= LANGER_LAUF_AB && !extraRuhetag && !entlastung) {
    einheiten.push({
      datum: tag(lockererTag),
      typ: "langer_lauf",
      titel: `Langer Lauf ${z2Min} Min`,
      beschreibung: `Gleichmässig in Zone 2 (${inp.zonen.z2.von}–${inp.zonen.z2.bis} bpm). Vorher und unterwegs trinken — das ist die wichtigste Ausdauereinheit der Woche.`,
      struktur: langerLauf(z2Min, inp.zonen),
      erwarteterTrimp: Math.round(z2Min * 1.15),
    });
  } else {
    einheiten.push({
      datum: tag(lockererTag),
      typ: "lauf_z2",
      titel: `Z2-Lauf ${z2Min} Min`,
      beschreibung: `Lockerer Dauerlauf in Zone 2 (${inp.zonen.z2.von}–${inp.zonen.z2.bis} bpm). Baut die aerobe Grundlage auf — höchstens 25 % der Zeit über Zone 2.`,
      struktur: z2Lauf(z2Min, inp.zonen, `Z2-Lauf ${z2Min} Min`),
      erwarteterTrimp: Math.round(z2Min * 1.05),
    });
  }

  /* ---- Do: Gym ---- */
  const ruecken = skaliereSaetze(gymRueckenBeine(inp.klimmzugMax), gymFaktor);
  einheiten.push({
    datum: tag(3),
    typ: "kraft",
    titel: "Gym: Rücken/Bizeps + Beine",
    beschreibung: `Klimmzug-Fokus (${
      inp.klimmzugMax != null ? `zuletzt bis ${inp.klimmzugMax} Wiederholungen` : "noch kein Wert aus Garmin"
    }), dazu Läufer-Kraft für die Beine — danach folgen Ruhetag und freies Wochenende.${
      entlastung ? " Entlastung: weniger Sätze, nichts steigern." : ""
    }`,
    struktur: ruecken,
    erwarteterTrimp: Math.round(45 * gymFaktor),
  });

  /* ---- Fr: Ruhe ---- */
  einheiten.push({
    datum: tag(4),
    typ: "ruhe",
    titel: "Ruhetag",
    beschreibung: "Erholung: Mobilität, Spazieren und genug Schlaf. Das Wochenende ist frei.",
  });

  /* ---- Readiness ---- */
  if (inp.readiness != null && inp.readiness < 35) {
    hinweise.push(
      "Training Readiness ist tief: Tausche die Intervalle gegen einen lockeren Lauf, bis sich der Wert erholt."
    );
  }

  return {
    wochenstart: inp.wochenstart,
    phaseNr: inp.blockWoche,
    einheiten: einheiten.sort((a, b) => a.datum.localeCompare(b.datum)),
    hinweise,
  };
}

/* ------------------------------------------------------------------ */
/* Kennwerte aus Garmin-Kraftsätzen                                    */
/* ------------------------------------------------------------------ */

/**
 * Meiste Klimmzug-Wiederholungen in einem Satz ohne Zusatzgewicht — aus den
 * von Garmin erkannten Kraftsätzen (`strength_sets`). Unplausible Werte
 * (> 40) werden ignoriert. Ohne passenden Satz → null.
 */
export function klimmzugMaxAusSaetzen(
  saetze: { uebungName: string; wdh: number | null; gewichtKg: number | null }[]
): number | null {
  let max: number | null = null;
  for (const s of saetze) {
    const key = s.uebungName.toUpperCase();
    if (!key.includes("PULL_UP") && !key.includes("CHIN_UP")) continue;
    if ((s.gewichtKg ?? 0) > 0) continue; // mit Zusatzgewicht nicht vergleichbar
    if (s.wdh == null || s.wdh < 1 || s.wdh > 40) continue;
    if (max == null || s.wdh > max) max = s.wdh;
  }
  return max;
}
