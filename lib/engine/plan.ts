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
 */

import { addTage } from "@/lib/format";
import { EP_DISZIPLINEN } from "@/lib/ep/disziplinen";
import { TrainingsPaces } from "./paces";
import { MuskelId } from "./muscle";
import { WorkoutStruktur } from "@/lib/garmin/workout-types";

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

export interface PlanEinheit {
  datum: string;
  typ:
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
    | "ruhe";
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

function rumpfEinheit(seitZielS: number, dorsalZielS: number): WorkoutStruktur {
  return {
    name: "Rumpf im Sekundentakt",
    sport: "kraft",
    metronom: true,
    uebungen: [
      {
        name: "Seitliche Rumpfkraft (EP-Form)",
        saetze: 3,
        dauerS: seitZielS,
        notiz: "Metronom 60 bpm, pro Seite",
      },
      {
        name: "Dorsale Rumpfkette (EP-Form)",
        saetze: 3,
        dauerS: dorsalZielS,
        notiz: "Metronom 60 bpm",
      },
      { name: "Plank-Variationen", saetze: 2, dauerS: 60 },
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

  return {
    wochenstart: inp.wochenstart,
    phaseNr: inp.phaseNr,
    einheiten: einheiten.sort((a, b) => a.datum.localeCompare(b.datum)),
    hinweise,
  };
}
