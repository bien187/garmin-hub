/**
 * Wöchentlicher Plan-Generator — reine, deterministische Funktion.
 *
 * (phase, restwochen, letzte28Tage, tsb, acwr, muscleState, epBenchmarks,
 *  readiness) → Wochenplan
 *
 * Kernregeln (§6.5 des Auftrags):
 *  - Phasenvorgaben sind das Skelett
 *  - Umfangssteigerung max. +10 %/Woche, jede 4. Woche Entlastung (−30 %)
 *  - Harte Läufe nie direkt nach Beintagen mit Quadrizeps/Waden ≥ 60 %
 *  - Klimmzug-Progression Richtung 9–10, GtG nur bei Oberkörper < 40 %
 *  - Rumpf 3×/Woche, Zielzeiten linear Richtung EP-Ziel interpoliert
 *  - ACWR > 1.3 → Umfang deckeln; TSB < −20 → Extra-Ruhetag
 *  - Ab 05.11. (Taper) gilt pro Tag `taperRegelFuerTag` (lib/engine/taper.ts):
 *    05.–08.11. wird der normale Plan abgeschwächt, ab 09.11. kommen die
 *    Einheiten direkt aus der Tagesregel; 18./19.11. sind fixe EP-Einträge.
 */

import { addTage } from "@/lib/format";
import { EP_DISZIPLINEN } from "@/lib/ep/disziplinen";
import { TrainingsPaces } from "./paces";
import { MuskelId } from "./muscle";
import { WorkoutStruktur } from "@/lib/garmin/workout-types";
import { EP_DATUM, EP_TAG_2, TAPER_START, istEpTag } from "@/lib/ep/konstanten";
import {
  LETZTE_INTENSITAET,
  LETZTE_BEINEINHEIT,
  LETZTER_ZIELTEMPO_LAUF,
  LETZTER_RUMPF_TAG,
  istLaufTyp,
  minutenAusTitel,
  passtZurRegel,
  taperRegelFuerTag,
  type TaperRegel,
} from "./taper";

export interface HrZonenInput {
  z2: { von: number; bis: number };
  z4: { von: number; bis: number };
  z5: { von: number; bis: number };
}

export interface PlanInput {
  /** Montag der zu planenden Woche (ISO) */
  wochenstart: string;
  phaseNr: 1 | 2 | 3 | 4;
  /** Wochen bis zur EP (aufgerundet) */
  restwochen: number;
  /** fortlaufender Wochenindex seit Trainingsstart (für Entlastungsrhythmus) */
  wochenIndex: number;
  /** Lauf-Minuten der Vorwoche (tatsächlich absolviert) */
  vorwocheLaufMin: number;
  tsb: number | null;
  acwr: number | null;
  /** Rest-Erschöpfung heute, 0–100 pro Muskel */
  muscleState: Partial<Record<MuskelId, number>>;
  /** aktuelle Benchmarks (letzte Werte) */
  benchmarks: {
    klimmzuege?: number;
    liegestuetze?: number;
    rumpfSeitlichS?: number;
    rumpfDorsalS?: number;
  };
  readiness: number | null;
  paces: TrainingsPaces | null;
  zonen: HrZonenInput;
  /** Phase 2: zuletzt verwendetes Lastlauf-Gewicht */
  letztesLastKg: number;
}

export type PlanTyp =
  | "lauf_z2"
  | "intervalle"
  | "huegel_intervalle"
  | "langer_lauf"
  | "lastlauf"
  | "kraft"
  | "klimmzuege"
  | "liegestuetze"
  | "rumpf"
  | "gtg"
  | "probe_ep"
  | "ruhe"
  /** fixer EP-Tag (18./19.11.), nie an Garmin, nie vom Generator überschrieben */
  | "ep";

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
  phaseNr: number;
  einheiten: PlanEinheit[];
  hinweise: string[];
}

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
        notiz: "Strikt Z2 — Ego zu Hause lassen",
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
            notiz: "Z5 / VO2max",
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
            notiz: "Bergauf hart, aufrechte Haltung, kurze Schritte",
          },
          { art: "erholung", dauerTyp: "zeit", dauerWert: 150, notiz: "Locker zurücktraben" },
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
        notiz: "Gleichmässig Z2, Entkopplung < 5 % anpeilen",
      },
    ],
  };
}

function lastlauf(kg: number, stiefel: boolean, distanzM: number): WorkoutStruktur {
  return {
    name: `Lastlauf ${kg} kg${stiefel ? " + Stiefel" : ""}`,
    sport: "laufen",
    schritte: [
      { art: "aufwaermen", dauerTyp: "zeit", dauerWert: 600, notiz: "Ohne Last mobilisieren, dann Last auf" },
      {
        art: "intervall",
        dauerTyp: "distanz",
        dauerWert: distanzM,
        notiz: `${kg} kg${stiefel ? ", Kampfstiefel" : ""} — kontrolliert, Schrittfrequenz hoch`,
      },
      { art: "auslaufen", dauerTyp: "zeit", dauerWert: 300, notiz: "Last ab, locker austraben" },
    ],
  };
}

function rumpfEinheit(seitZielS: number, dorsalZielS: number, saetze = 3): WorkoutStruktur {
  return {
    name: "Rumpf im Sekundentakt",
    sport: "kraft",
    metronom: true,
    uebungen: [
      {
        name: "Seitliche Rumpfkraft (EP-Form)",
        saetze,
        dauerS: seitZielS,
        notiz: "Metronom 60 bpm, pro Seite",
      },
      {
        name: "Dorsale Rumpfkette (EP-Form)",
        saetze,
        dauerS: dorsalZielS,
        notiz: "Metronom 60 bpm",
      },
      { name: "Plank-Variationen", saetze: Math.max(1, saetze - 1), dauerS: 60 },
    ],
  };
}

function klimmzugSchwer(aktuelleMax: number): WorkoutStruktur {
  const arbeitsWdh = Math.max(3, Math.round(aktuelleMax * 0.6));
  return {
    name: "Klimmzüge schwer",
    sport: "kraft",
    uebungen: [
      { name: "Klimmzüge Ristgriff", saetze: 5, wdh: arbeitsWdh, notiz: "2–3 Min Pause, ggf. Zusatzgewicht" },
      { name: "Negativ-Klimmzüge", saetze: 3, wdh: 4, notiz: "5 s ablassen" },
      { name: "Hängen am Reck", saetze: 2, dauerS: 40, notiz: "Griffkraft" },
    ],
  };
}

function klimmzugVolumen(aktuelleMax: number): WorkoutStruktur {
  return {
    name: "Klimmzüge Volumen",
    sport: "kraft",
    uebungen: [
      {
        name: "Klimmzüge Ristgriff",
        saetze: 8,
        wdh: Math.max(2, Math.round(aktuelleMax * 0.4)),
        notiz: "Kurze Pausen (60–90 s), sauber bleiben",
      },
    ],
  };
}

function liegestuetzTechnik(zielWdh: number): WorkoutStruktur {
  return {
    name: "EP-Liegestütze Technik",
    sport: "kraft",
    metronom: true,
    uebungen: [
      {
        name: "EP-Liegestütze (Start Bauchlage, Hände auf Rücken)",
        saetze: 4,
        wdh: Math.max(8, Math.round(zielWdh * 0.6)),
        notiz: "Exakte EP-Form, Handberührung oben abwechselnd",
      },
      { name: "Tempo-Liegestütze 20 s", saetze: 3, notiz: "Maximale saubere Frequenz" },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Generator                                                           */
/* ------------------------------------------------------------------ */

export function generiereWochenplan(inp: PlanInput): Wochenplan {
  const hinweise: string[] = [];
  const einheiten: PlanEinheit[] = [];
  const tag = (i: number) => addTage(inp.wochenstart, i); // 0 = Mo

  /* ---- Umfangssteuerung ---- */
  const basisMin = Math.max(150, inp.vorwocheLaufMin || 150);
  let zielMin = basisMin * 1.1; // max +10 %
  const istEntlastung = inp.wochenIndex > 0 && inp.wochenIndex % 4 === 3;
  if (istEntlastung) {
    zielMin = basisMin * 0.7;
    hinweise.push("Entlastungswoche: Umfang −30 % — Anpassung passiert in der Erholung.");
  }
  if (inp.acwr != null && inp.acwr > 1.3) {
    zielMin = Math.min(zielMin, basisMin);
    hinweise.push(
      `ACWR ${inp.acwr.toFixed(2)} über 1.3 — Umfang diese Woche gedeckelt (Verletzungsprävention).`
    );
  }
  const extraRuhetag = inp.tsb != null && inp.tsb < -20;
  if (extraRuhetag) {
    hinweise.push(`TSB ${inp.tsb?.toFixed(0)} < −20: Extra-Ruhetag eingeplant, eine Qualitätseinheit gestrichen.`);
  }

  /* ---- Muskel-Gates ---- */
  const beineFrisch =
    (inp.muscleState.quadrizeps ?? 0) < 60 && (inp.muscleState.waden ?? 0) < 60;
  const oberkoerperFrisch =
    Math.max(
      inp.muscleState.oberer_ruecken_lat ?? 0,
      inp.muscleState.bizeps ?? 0,
      inp.muscleState.brust ?? 0
    ) < 40;
  if (!beineFrisch) {
    hinweise.push(
      "Quadrizeps/Waden noch ≥ 60 % erschöpft — harte Laufeinheit auf Mittwoch verschoben."
    );
  }

  /* ---- Rumpf-Zielzeiten: linear Richtung EP-Ziel ---- */
  const interpoliere = (aktuell: number | undefined, ziel: number, start: number) => {
    const ist = aktuell ?? start;
    if (inp.restwochen <= 1) return ziel;
    const schritt = (ziel - ist) / inp.restwochen;
    return Math.round(Math.min(ziel, ist + Math.max(0, schritt)));
  };
  const seitZiel = interpoliere(
    inp.benchmarks.rumpfSeitlichS,
    EP_DISZIPLINEN.rumpf_seitlich.ziel.von,
    60
  );
  const dorsalZiel = interpoliere(
    inp.benchmarks.rumpfDorsalS,
    EP_DISZIPLINEN.rumpf_dorsal.ziel.von,
    80
  );
  const klimmzugMax = inp.benchmarks.klimmzuege ?? 6;
  const liegestuetzZiel = inp.benchmarks.liegestuetze ?? 20;

  /* ---- Laufverteilung ---- */
  // Langer Lauf: ~40 % des Wochenumfangs, Phase 1 max 80 Min
  const langMin = Math.min(inp.phaseNr === 1 ? 80 : 110, Math.round((zielMin * 0.4) / 5) * 5);
  const restMin = Math.max(30, zielMin - langMin - 35); // 35 ≈ Qualitätseinheit netto
  const z2EinheitMin = Math.round(restMin / 2 / 5) * 5;

  const harterTag = beineFrisch ? 1 : 2; // Di sonst Mi
  const trimpZ2 = (min: number) => Math.round(min * 1.05);

  /* ---- Wochenskelett nach Phase ---- */
  // Mo: Gym Brust/Trizeps (bestehende Routine)
  einheiten.push({
    datum: tag(0),
    typ: "kraft",
    titel: "Gym: Brust/Trizeps",
    beschreibung: "Bestehende Routine. EP-Liegestütz-Technik als Finisher.",
    struktur: liegestuetzTechnik(liegestuetzZiel),
    erwarteterTrimp: 35,
  });

  // Qualitätseinheit (Di oder Mi)
  const qualitaet: PlanEinheit = (() => {
    if (inp.phaseNr === 1) {
      return {
        datum: tag(harterTag),
        typ: "intervalle" as const,
        titel: "Intervalle Z5",
        beschreibung: "5 × 3 Min Z5, Trab-Pausen — einzige harte Laufeinheit der Woche.",
        struktur: intervalle(5, 180, 150, inp.zonen, inp.paces, "Intervalle 5×3 Min Z5"),
        erwarteterTrimp: 85,
      };
    }
    if (inp.phaseNr === 2) {
      return {
        datum: tag(harterTag),
        typ: "huegel_intervalle" as const,
        titel: "Hügel-Intervalle",
        beschreibung: "9 × 75 s bergauf hart, zurücktraben. Aufrecht bleiben.",
        struktur: huegelIntervalle(9, 75, "Hügel-Intervalle 9×75 s"),
        erwarteterTrimp: 90,
      };
    }
    if (inp.phaseNr === 3) {
      return {
        datum: tag(harterTag),
        typ: "intervalle" as const,
        titel: "EP-Tempo: 5×1 km",
        beschreibung: "5 × 1 km im 5-km-Zieltempo, 90 s Pause — Prüfungshärte.",
        struktur: intervalle(5, 0, 90, inp.zonen, inp.paces, "5×1 km EP-Tempo"),
        erwarteterTrimp: 95,
      };
    }
    return {
      datum: tag(harterTag),
      typ: "intervalle" as const,
      titel: "Taper: Kurze Spitzen",
      beschreibung: "4 × 60 s zügig — Frische halten, keine Ermüdung aufbauen.",
      struktur: intervalle(4, 60, 120, inp.zonen, inp.paces, "Taper-Intervalle 4×60 s"),
      erwarteterTrimp: 45,
    };
  })();
  // Phase-3-Spezialfall: Struktur mit Distanz statt Zeit für 1-km-Wiederholungen
  if (inp.phaseNr === 3 && qualitaet.struktur) {
    qualitaet.struktur = {
      name: "5×1 km EP-Tempo",
      sport: "laufen",
      schritte: [
        { art: "aufwaermen", dauerTyp: "zeit", dauerWert: 900 },
        {
          art: "wiederholung",
          dauerTyp: "offen",
          wiederholungen: 5,
          schritte: [
            {
              art: "intervall",
              dauerTyp: "distanz",
              dauerWert: 1000,
              ziel: inp.paces
                ? {
                    typ: "pace",
                    vonSproKm: inp.paces.rennpace5k * 1.02,
                    bisSproKm: inp.paces.rennpace5k * 0.98,
                  }
                : { typ: "hr", vonBpm: inp.zonen.z4.von, bisBpm: inp.zonen.z5.bis },
            },
            { art: "erholung", dauerTyp: "zeit", dauerWert: 90 },
          ],
        },
        { art: "auslaufen", dauerTyp: "zeit", dauerWert: 600 },
      ],
    };
  }
  if (!extraRuhetag || inp.phaseNr === 4) {
    einheiten.push(qualitaet);
  }

  // Z2-Lauf am jeweils anderen Tag (Di/Mi)
  const z2Tag = harterTag === 1 ? 2 : 1;
  einheiten.push({
    datum: tag(z2Tag),
    typ: "lauf_z2",
    titel: `Z2-Lauf ${z2EinheitMin} Min`,
    beschreibung: `Locker in Z2 (${inp.zonen.z2.von}–${inp.zonen.z2.bis} bpm). Max. 25 % über Z2 erlaubt.`,
    struktur: z2Lauf(z2EinheitMin, inp.zonen, `Z2-Lauf ${z2EinheitMin} Min`),
    erwarteterTrimp: trimpZ2(z2EinheitMin),
  });

  // Rumpf 3×/Woche: Di, Do, Sa (an Lauftagen angehängt oder solo)
  for (const [i, rumpfTag] of [1, 3, 5].entries()) {
    einheiten.push({
      datum: tag(rumpfTag),
      typ: "rumpf",
      titel: `Rumpf im Sekundentakt (${seitZiel}s/${dorsalZiel}s)`,
      beschreibung: `Seitlich ${seitZiel} s pro Seite, dorsal ${dorsalZiel} s — Metronom 60 bpm. Einheit ${i + 1}/3.`,
      struktur: rumpfEinheit(seitZiel, dorsalZiel),
      erwarteterTrimp: 20,
    });
  }

  // Do: Gym Rücken/Bizeps + Klimmzüge schwer
  einheiten.push({
    datum: tag(3),
    typ: "klimmzuege",
    titel: "Gym: Rücken/Bizeps + Klimmzüge schwer",
    beschreibung: `Klimmzug-Fokus: 5 Sätze schwer (aktuell max ${klimmzugMax}). ${
      inp.phaseNr >= 2 ? "Mit Zusatzgewicht arbeiten." : "Saubere Ristgriff-Form."
    }`,
    struktur: klimmzugSchwer(klimmzugMax),
    erwarteterTrimp: 40,
  });

  // Fr: Z2 kurz oder Ruhe
  if (!extraRuhetag && !istEntlastung && inp.phaseNr !== 4) {
    einheiten.push({
      datum: tag(4),
      typ: "lauf_z2",
      titel: `Z2-Lauf ${z2EinheitMin} Min`,
      beschreibung: "Regenerativ, strikt Z2.",
      struktur: z2Lauf(z2EinheitMin, inp.zonen, `Z2-Lauf ${z2EinheitMin} Min`),
      erwarteterTrimp: trimpZ2(z2EinheitMin),
    });
  } else {
    einheiten.push({
      datum: tag(4),
      typ: "ruhe",
      titel: "Ruhetag",
      beschreibung: extraRuhetag
        ? "Extra-Ruhetag (TSB < −20). Spazieren, Elektrolyte, früh schlafen."
        : "Ruhetag. Mobilität und Schlaf.",
    });
  }

  // Sa: Schlüsseleinheit (langer Lauf / Lastlauf / Probe-EP / Taper)
  if (inp.phaseNr === 1) {
    einheiten.push({
      datum: tag(5),
      typ: "langer_lauf",
      titel: `Langer Lauf ${langMin} Min`,
      beschreibung: "Z2, gleichmässig. Elektrolyte vorher und währenddessen (Krampf-Historie!).",
      struktur: langerLauf(langMin, inp.zonen),
      erwarteterTrimp: Math.round(langMin * 1.15),
    });
    hinweise.push("Elektrolyt-Reminder: Samstag langer Lauf — am Vorabend und morgens salzen/trinken.");
  } else if (inp.phaseNr === 2) {
    const naechstesKg = Math.min(20, Math.max(6, inp.letztesLastKg + 2));
    const mitStiefeln = inp.wochenIndex >= 9; // ab Woche 10
    einheiten.push({
      datum: tag(5),
      typ: "lastlauf",
      titel: `Lastlauf ${naechstesKg} kg${mitStiefeln ? " + Kampfstiefel" : ""}`,
      beschreibung: `Progression +2 kg/Woche bis 20 kg (aktuell ${naechstesKg} kg). ${
        mitStiefeln ? "In Kampfstiefeln. " : ""
      }Hinweis: Gewichtsweste ≠ Rucksack-Mechanik — spätestens Phase 3 mit echtem Rucksack.`,
      struktur: lastlauf(naechstesKg, mitStiefeln, 5000),
      erwarteterTrimp: 100,
    });
    hinweise.push("Elektrolyt-Reminder: Samstag Lastlauf — Krampfprophylaxe ernst nehmen.");
  } else if (inp.phaseNr === 3) {
    const istProbeEpWoche = inp.restwochen === 5 || inp.restwochen === 3;
    if (istProbeEpWoche) {
      einheiten.push({
        datum: tag(5),
        typ: "probe_ep",
        titel: "Probe-EP: Alle 5 Disziplinen",
        beschreibung:
          "Komplette EP in Prüfungsreihenfolge: Klimmzüge → Liegestütze → Rumpf seitlich → Rumpf dorsal → 5-km-Lastlauf (20 kg + Stiefel). Geführter Modus im Plan-Tab.",
        erwarteterTrimp: 140,
      });
    } else {
      einheiten.push({
        datum: tag(5),
        typ: "lastlauf",
        titel: "Lastlauf 20 kg + Stiefel, 5 km auf Zeit",
        beschreibung: "Prüfungssetup: 20-kg-Rucksack, Kampfstiefel. Zeit als Benchmark erfassen!",
        struktur: lastlauf(20, true, 5000),
        erwarteterTrimp: 120,
      });
    }
  } else {
    einheiten.push({
      datum: tag(5),
      typ: "lauf_z2",
      titel: "Taper: Z2 kurz",
      beschreibung: "30 Min locker. Beine frisch halten.",
      struktur: z2Lauf(30, inp.zonen, "Taper Z2 30 Min"),
      erwarteterTrimp: 32,
    });
  }

  // So: Ganzkörper (ausser Taper/Entlastung) + GtG-Hinweis
  if (inp.phaseNr !== 4 && !istEntlastung) {
    einheiten.push({
      datum: tag(6),
      typ: "kraft",
      titel: "Gym: Ganzkörper + Klimmzug-Volumen",
      beschreibung:
        inp.phaseNr === 2
          ? "Ganzkörper mit Beinfokus: Step-ups, Ausfallschritte, Wadenheben mit Weste."
          : "Ganzkörper. Exzentrische Bein-Konditionierung (langsames Absenken).",
      struktur: klimmzugVolumen(klimmzugMax),
      erwarteterTrimp: 45,
    });
  } else {
    einheiten.push({
      datum: tag(6),
      typ: "ruhe",
      titel: "Ruhetag",
      beschreibung: inp.phaseNr === 4 ? "Taper: Spazieren, Schlaf, Kohlenhydrate." : "Entlastung: komplett frei.",
    });
  }

  // Grease the Groove täglich, wenn Oberkörper frisch
  if (oberkoerperFrisch && inp.phaseNr !== 4) {
    einheiten.push({
      datum: tag(0),
      typ: "gtg",
      titel: "Grease the Groove (täglich)",
      beschreibung: `Über den Tag verteilt 4–6 × ${Math.max(
        2,
        Math.round(klimmzugMax * 0.5)
      )} Klimmzüge, nie bis zum Muskelversagen. Gilt für die ganze Woche.`,
    });
  } else if (!oberkoerperFrisch) {
    hinweise.push("Oberkörper ≥ 40 % erschöpft — Grease the Groove diese Woche pausieren.");
  }

  /* ---- Readiness-Hinweis ---- */
  if (inp.readiness != null && inp.readiness < 35) {
    hinweise.push(
      "Training Readiness ist tief: Tausche die harte Einheit gegen Z2, bis der Wert sich erholt."
    );
  }

  /* ---- Klimmzug-Stolperkante ---- */
  if (klimmzugMax === 7 || klimmzugMax === 8) {
    hinweise.push(
      "Klimmzüge: Du stehst an der Stolperkante (7→8 = Note 3.9→4.5). Jede saubere Wiederholung zählt doppelt."
    );
  }

  /* ---- Taper ab 05.11.: Tagesregeln gehen dem Wochenskelett vor ---- */
  const sonntag = tag(6);
  let ergebnis = einheiten;
  let ergebnisHinweise = hinweise;
  if (sonntag >= TAPER_START) {
    const taper = wendeTaperAn(einheiten, inp.wochenstart, {
      zonen: inp.zonen,
      paces: inp.paces,
      klimmzugMax,
      liegestuetzZiel,
      seitZiel,
      dorsalZiel,
    });
    ergebnis = taper.einheiten;
    // Reine Taper-Wochen: die Hinweise des Wochenskeletts (Umfang, Lastlauf,
    // Probe-EP …) gelten nicht mehr — nur Readiness und Taper-Hinweise.
    ergebnisHinweise =
      inp.wochenstart >= TAPER_START
        ? [...hinweise.filter((h) => h.startsWith("Training Readiness")), ...taper.hinweise]
        : [...hinweise, ...taper.hinweise];
  }

  return {
    wochenstart: inp.wochenstart,
    phaseNr: inp.phaseNr,
    einheiten: ergebnis.sort((a, b) => a.datum.localeCompare(b.datum)),
    hinweise: ergebnisHinweise,
  };
}

/* ------------------------------------------------------------------ */
/* Taper                                                               */
/* ------------------------------------------------------------------ */

export interface TaperKontext {
  zonen: HrZonenInput;
  paces: TrainingsPaces | null;
  klimmzugMax: number;
  liegestuetzZiel: number;
  seitZiel: number;
  dorsalZiel: number;
}

const runde5 = (n: number) => Math.round(n / 5) * 5;

function z2Einheit(datum: string, min: number, zonen: HrZonenInput, titel: string, beschreibung: string): PlanEinheit {
  return {
    datum,
    typ: "lauf_z2",
    titel,
    beschreibung,
    struktur: z2Lauf(min, zonen, titel),
    erwarteterTrimp: Math.round(min * 1.05),
  };
}

/** Kraft-Struktur mit reduzierten Sätzen (mind. 1 Satz pro Übung) */
function skaliereSaetze(struktur: WorkoutStruktur | undefined, faktor: number): WorkoutStruktur | undefined {
  if (!struktur?.uebungen) return struktur;
  return {
    ...struktur,
    uebungen: struktur.uebungen.map((u) => ({ ...u, saetze: Math.max(1, Math.round(u.saetze * faktor)) })),
  };
}

function epEintrag(datum: string): PlanEinheit {
  const tag1 = datum === EP_DATUM;
  return {
    datum,
    typ: "ep",
    titel: tag1 ? "EP – Tag 1" : "EP – Tag 2",
    beschreibung: tag1
      ? "Eignungsprüfung, Tag 1. Kein Training vor der Prüfung. Wird nicht an die Uhr gesendet."
      : "Eignungsprüfung, Tag 2. Kein zusätzliches Training. Wird nicht an die Uhr gesendet.",
  };
}

function letzteIntensitaet(datum: string, ctx: TaperKontext): PlanEinheit {
  return {
    datum,
    typ: "intervalle",
    titel: "Letzte Intensität: 5×2 Min Z5 (45 Min)",
    beschreibung:
      "Letzte Intensitätseinheit vor der EP: 5 × 2 Min zügig, 2 Min Trab-Pause. Kurz und knackig, danach nur noch Frische sammeln.",
    struktur: intervalle(5, 120, 120, ctx.zonen, ctx.paces, "Letzte Intensität 5×2 Min"),
    erwarteterTrimp: 60,
  };
}

/** 05.–08.11.: normale Einheit nach der Tagesregel abschwächen (oder streichen) */
function schwaecheAb(e: PlanEinheit, regel: TaperRegel, ctx: TaperKontext): PlanEinheit | null {
  const hinweis = regel.label.startsWith("Taper") ? ` ${regel.label}.` : ` Taper: ${regel.label}.`;
  let neu: PlanEinheit | null = e;
  switch (e.typ) {
    case "ep":
      return null;
    case "lastlauf":
    case "probe_ep":
    case "langer_lauf": {
      if (e.datum === LETZTE_INTENSITAET && regel.maxIntensitaet === "z5") {
        neu = letzteIntensitaet(e.datum, ctx);
      } else {
        const basis = e.typ === "langer_lauf" ? (minutenAusTitel(e.titel) ?? 60) : 50;
        const min = Math.min(regel.maxDauerMin, Math.max(20, runde5(basis * regel.umfangFaktor)));
        neu = z2Einheit(
          e.datum,
          min,
          ctx.zonen,
          `Z2-Lauf ${min} Min`,
          `Statt «${e.titel}»: locker in Z2.` + hinweis
        );
      }
      break;
    }
    case "intervalle":
    case "huegel_intervalle": {
      if (regel.maxIntensitaet === "z5") {
        neu =
          e.datum === LETZTE_INTENSITAET
            ? letzteIntensitaet(e.datum, ctx)
            : {
                datum: e.datum,
                typ: "intervalle",
                titel: "Taper: Kurze Spitzen 4×60 s",
                beschreibung: "4 × 60 s zügig, 2 Min Trab — Frische halten, keine Ermüdung aufbauen." + hinweis,
                struktur: intervalle(4, 60, 120, ctx.zonen, ctx.paces, "Taper-Intervalle 4×60 s"),
                erwarteterTrimp: 45,
              };
      } else {
        const min = Math.min(regel.maxDauerMin, 30);
        neu = z2Einheit(e.datum, min, ctx.zonen, `Z2-Lauf ${min} Min`, `Statt «${e.titel}»: locker in Z2.` + hinweis);
      }
      break;
    }
    case "lauf_z2": {
      const vorher = minutenAusTitel(e.titel) ?? 30;
      const min = Math.min(regel.maxDauerMin, Math.max(20, runde5(vorher * regel.umfangFaktor)));
      neu = z2Einheit(
        e.datum,
        min,
        ctx.zonen,
        `Z2-Lauf ${min} Min`,
        `Locker in Z2 (${ctx.zonen.z2.von}–${ctx.zonen.z2.bis} bpm).` + hinweis
      );
      break;
    }
    case "kraft":
    case "klimmzuege":
    case "liegestuetze":
    case "rumpf": {
      const beine =
        e.typ === "kraft" && /ganzkörper/i.test(e.titel)
          ? " Beine nur leicht — die letzte schwere Beineinheit folgt am Mo 09.11."
          : "";
      const struktur = skaliereSaetze(e.struktur, regel.umfangFaktor);
      const beschreibung =
        e.typ === "klimmzuege"
          ? `Klimmzüge: ${struktur?.uebungen?.[0]?.saetze ?? 3} Sätze statt 5 (aktuell max ${ctx.klimmzugMax}) — nichts steigern, Zusatzgewicht nicht erhöhen.${hinweis}`
          : `${e.beschreibung} Taper: Sätze ca. −40 %, nichts steigern.${beine}`;
      neu = {
        ...e,
        beschreibung,
        struktur,
        erwarteterTrimp:
          e.erwarteterTrimp != null ? Math.round(e.erwarteterTrimp * regel.umfangFaktor) : e.erwarteterTrimp,
      };
      break;
    }
    default:
      break;
  }
  return neu && passtZurRegel(neu, regel).ok ? neu : null;
}

/** Ab 09.11.: die Einheiten des Tages kommen direkt aus der Tagesregel */
function taperVorgabe(datum: string, regel: TaperRegel, ctx: TaperKontext): PlanEinheit[] | null {
  if (datum < LETZTE_BEINEINHEIT) return null; // 05.–08.11.: abschwächen statt ersetzen
  if (istEpTag(datum)) return [epEintrag(datum)];
  const z4 = ctx.zonen.z4;
  const klimmzugSub = Math.max(2, Math.round(ctx.klimmzugMax * 0.5));
  const liegeSub = Math.max(6, Math.round(ctx.liegestuetzZiel * 0.5));

  if (datum === LETZTE_BEINEINHEIT) {
    return [
      {
        datum,
        typ: "kraft",
        titel: "Gym: Ganzkörper mit Beinen (letzte Beineinheit)",
        beschreibung:
          "Letzte schwere Beineinheit vor der EP: moderat schwer, 2–3 Wiederholungen Reserve, kein Muskelversagen. Kein Lastlauf.",
        struktur: {
          name: "Ganzkörper mit Beinen",
          sport: "kraft",
          uebungen: [
            { name: "Kniebeugen", saetze: 3, wdh: 6, notiz: "Moderat schwer, 2–3 Wdh. Reserve" },
            { name: "Ausfallschritte", saetze: 3, wdh: 8, notiz: "Pro Seite" },
            { name: "Step-ups", saetze: 2, wdh: 10, notiz: "Pro Seite, ohne Weste" },
            { name: "Wadenheben", saetze: 3, wdh: 12 },
            { name: "Bankdrücken", saetze: 3, wdh: 6, notiz: "Brust/Trizeps-Routine verkürzt" },
            { name: "EP-Liegestütze Technik", saetze: 2, wdh: liegeSub, notiz: "Exakte EP-Form, submaximal" },
          ],
        },
        erwarteterTrimp: 40,
      },
    ];
  }
  if (datum === LETZTER_ZIELTEMPO_LAUF) {
    return [
      {
        datum,
        typ: "intervalle",
        titel: "Zieltempo-Lauf 38 Min (3×5 Min Z4)",
        beschreibung:
          "12 Min einlaufen mit Steigerungen, 3 × 5 Min im EP-Zieltempo (Z4) mit 2 Min Trab, 5 Min auslaufen. Insgesamt 15 Min Z4 — Renngefühl, keine Ermüdung.",
        struktur: {
          name: "Zieltempo 3×5 Min Z4",
          sport: "laufen",
          schritte: [
            { art: "aufwaermen", dauerTyp: "zeit", dauerWert: 720, notiz: "Locker einlaufen + 3 Steigerungen" },
            {
              art: "wiederholung",
              dauerTyp: "offen",
              wiederholungen: 3,
              schritte: [
                {
                  art: "intervall",
                  dauerTyp: "zeit",
                  dauerWert: 300,
                  ziel: ctx.paces
                    ? {
                        typ: "pace",
                        vonSproKm: ctx.paces.rennpace5k * 1.03,
                        bisSproKm: ctx.paces.rennpace5k * 0.99,
                      }
                    : { typ: "hr", vonBpm: z4.von, bisBpm: z4.bis },
                  notiz: "EP-Zieltempo, kontrolliert (Z4)",
                },
                { art: "erholung", dauerTyp: "zeit", dauerWert: 120, notiz: "Locker traben" },
              ],
            },
            { art: "auslaufen", dauerTyp: "zeit", dauerWert: 300 },
          ],
        },
        erwarteterTrimp: 45,
      },
    ];
  }
  if (datum < "2026-11-16") {
    const einheiten: PlanEinheit[] = [];
    const wt = (new Date(datum + "T12:00:00").getDay() + 6) % 7; // Mo=0
    if (datum === "2026-11-11" || datum === "2026-11-14") {
      const min = datum === "2026-11-11" ? 30 : 25;
      einheiten.push(
        z2Einheit(
          datum,
          min,
          ctx.zonen,
          `Z2-Lauf ${min} Min flach`,
          `Strikt Z2 (${ctx.zonen.z2.von}–${ctx.zonen.z2.bis} bpm), flache Strecke, kein Bergablauf.`
        )
      );
    }
    if (datum === "2026-11-11") {
      einheiten.push({
        datum,
        typ: "gtg",
        titel: "Grease the Groove submaximal (bis So 15.11.)",
        beschreibung: `Über den Tag 3–4 × ${klimmzugSub} Klimmzüge und ein paar EP-Liegestütze, weit weg vom Versagen. Keine neuen Übungen.`,
      });
    }
    if (datum === LETZTER_RUMPF_TAG) {
      einheiten.push(
        {
          datum,
          typ: "klimmzuege",
          titel: "Klimmzüge & Liegestütze submaximal",
          beschreibung: `Statt «Rücken/Bizeps + Klimmzüge schwer»: nur submaximal, kein Zusatzgewicht (aktuell max ${ctx.klimmzugMax}).`,
          struktur: {
            name: "Klimmzüge & Liegestütze submaximal",
            sport: "kraft",
            uebungen: [
              { name: "Klimmzüge Ristgriff", saetze: 3, wdh: klimmzugSub, notiz: "Sauber, weit weg vom Versagen" },
              { name: "EP-Liegestütze", saetze: 2, wdh: liegeSub, notiz: "Exakte EP-Form, submaximal" },
            ],
          },
          erwarteterTrimp: 20,
        },
        {
          datum,
          typ: "rumpf",
          titel: `Rumpf leicht (${Math.round(ctx.seitZiel * 0.7)}s/${Math.round(ctx.dorsalZiel * 0.7)}s)`,
          beschreibung: "Letzter, leichter Rumpftag vor der EP: 2 Sätze, ca. 70 % der Zielzeit, Metronom 60 bpm.",
          struktur: rumpfEinheit(Math.round(ctx.seitZiel * 0.7), Math.round(ctx.dorsalZiel * 0.7), 2),
          erwarteterTrimp: 12,
        }
      );
    }
    if (einheiten.length === 0) {
      einheiten.push({
        datum,
        typ: "ruhe",
        titel: wt === 6 ? "Ruhetag — Spazieren" : "Ruhetag — Mobilität",
        beschreibung: "Taper: Erholung ist jetzt Training. Schlaf, Elektrolyte, Kohlenhydrate.",
      });
    }
    return einheiten;
  }
  if (datum === "2026-11-16") {
    return [
      {
        datum,
        typ: "ruhe",
        titel: "Spazieren 20 Min + Mobilität",
        beschreibung: "20 Min locker spazieren, danach 10–15 Min Mobilität. Sonst nichts.",
      },
    ];
  }
  if (datum < EP_DATUM) {
    return [
      z2Einheit(
        datum,
        20,
        ctx.zonen,
        "Optional: Lockerer Lauf 20 Min",
        "Frei oder max. 20 Min ganz locker — nur, wenn die Beine danach fragen. Früh schlafen."
      ),
    ];
  }
  if (regel.erlaubt.includes("ruhe")) {
    return [
      {
        datum,
        typ: "ruhe",
        titel: "Regeneration: Spazieren",
        beschreibung: "Nach der EP: 20–30 Min spazieren, viel schlafen, gut essen.",
      },
    ];
  }
  return []; // nach der Regeneration: kein Plan, bis neue Ziele gesetzt sind
}

/**
 * Wendet die Taper-Tagesregeln auf einen generierten Wochenplan an.
 * 05.–08.11. werden die normalen Einheiten abgeschwächt, ab 09.11. kommen
 * sie aus der Tagesregel; am 18./19.11. steht genau ein EP-Eintrag.
 */
export function wendeTaperAn(
  einheiten: PlanEinheit[],
  wochenstart: string,
  ctx: TaperKontext
): { einheiten: PlanEinheit[]; hinweise: string[] } {
  const ergebnis: PlanEinheit[] = [];
  for (let i = 0; i < 7; i++) {
    const datum = addTage(wochenstart, i);
    const regel = taperRegelFuerTag(datum);
    const tagesEinheiten = einheiten.filter((e) => e.datum === datum);
    if (!regel) {
      ergebnis.push(...tagesEinheiten);
      continue;
    }
    const vorgabe = taperVorgabe(datum, regel, ctx);
    if (vorgabe) {
      ergebnis.push(...vorgabe);
      continue;
    }
    const tag: PlanEinheit[] = [];
    for (const e of tagesEinheiten) {
      const neu = schwaecheAb(e, regel, ctx);
      if (!neu) continue;
      // höchstens ein Lauf pro Tag, keine doppelten Typen
      if (tag.some((t) => t.typ === neu.typ || (istLaufTyp(t.typ) && istLaufTyp(neu.typ)))) continue;
      tag.push(neu);
    }
    ergebnis.push(...tag);
  }
  // Einheiten ausserhalb der Woche (sollte nicht vorkommen) unverändert lassen
  ergebnis.push(...einheiten.filter((e) => e.datum < wochenstart || e.datum > addTage(wochenstart, 6)));

  const hinweise: string[] = [];
  const ende = addTage(wochenstart, 6);
  if (ende >= TAPER_START && wochenstart <= EP_TAG_2) {
    hinweise.push(
      "Taper ab Do 05.11.: Jeder Tag folgt einer festen Regel (Begründung beim Tag). Keine Probe-EP, kein Lastlauf, keine neuen Übungen."
    );
  }
  if (wochenstart <= EP_TAG_2 && ende >= EP_DATUM) {
    hinweise.push(
      "EP am Mi 18.11. und Do 19.11.: Die EP-Tage sind fix, werden nicht überschrieben und nicht an die Uhr gesendet."
    );
  }
  if (wochenstart > EP_TAG_2) {
    hinweise.push("Nach der EP: kein Trainingsplan über die Regeneration hinaus, bis neue Ziele gesetzt sind.");
  }
  return { einheiten: ergebnis, hinweise };
}

/**
 * Harte Taper-Grenzen nach dem Verteilen auf verfügbare Tage durchsetzen
 * (idempotent, ohne erneutes Abschwächen): verbotene Typen fliegen raus,
 * zu lange/intensive Läufe werden zu Z2 gekappt, EP-Tage enthalten nur den
 * EP-Eintrag, höchstens ein Lauf pro Tag.
 */
export function erzwingeTaperGrenzen(einheiten: PlanEinheit[], zonen: HrZonenInput): PlanEinheit[] {
  const ergebnis: PlanEinheit[] = [];
  for (const e of [...einheiten].sort((a, b) => a.datum.localeCompare(b.datum))) {
    const regel = taperRegelFuerTag(e.datum);
    if (!regel) {
      ergebnis.push(e);
      continue;
    }
    let neu: PlanEinheit | null = e;
    if (!passtZurRegel(e, regel).ok) {
      neu = null;
      if (istLaufTyp(e.typ) && regel.erlaubt.includes("lauf_z2") && regel.maxDauerMin >= 20) {
        const min = Math.min(regel.maxDauerMin, minutenAusTitel(e.titel) ?? 30);
        neu = z2Einheit(e.datum, min, zonen, `Z2-Lauf ${min} Min`, `Statt «${e.titel}»: locker in Z2. Taper: ${regel.label}.`);
      }
    }
    if (!neu) continue;
    const kandidat = neu;
    if (
      istLaufTyp(kandidat.typ) &&
      ergebnis.some((v) => v.datum === kandidat.datum && istLaufTyp(v.typ))
    ) {
      continue;
    }
    ergebnis.push(kandidat);
  }
  return ergebnis;
}
