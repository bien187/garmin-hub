import { describe, expect, it } from "vitest";
import { benchmarkWertAlsText, berechneNote, bewerteEp, notenFarbe, notenStufe, parseBenchmarkWert, wertFuerNote } from "../disziplinen";
import { aktuellerEpStand, berechneEpPrognose } from "../prognose";
import { aktuellePhase, berechnePhasen, epCountdown, restwochen } from "../phasen";
import { EP_DATUM, EP_TAG_2, TAPER_START } from "../konstanten";

/* Erwartungen 1:1 aus der offiziellen „Notentabelle Eignungsprüfung EP_AZ SK" */
const mmss = (m: number, s: number) => m * 60 + s;

describe("Notentabellen (berechneNote) nach offizieller Tabelle", () => {
  it("Marsch 5 km: jede Zeile an beiden Grenzen", () => {
    const zeilen: [number, number, number][] = [
      // [von s, bis s, Note]
      [mmss(30, 1), mmss(30, 30), 4.9],
      [mmss(30, 31), mmss(31, 0), 4.8],
      [mmss(31, 1), mmss(31, 30), 4.7],
      [mmss(31, 31), mmss(32, 0), 4.6],
      [mmss(32, 1), mmss(32, 30), 4.5],
      [mmss(32, 31), mmss(33, 0), 4.4],
      [mmss(33, 1), mmss(33, 30), 4.3],
      [mmss(33, 31), mmss(34, 0), 4.2],
      [mmss(34, 1), mmss(35, 0), 4.1],
      [mmss(35, 1), mmss(36, 0), 4.0],
      [mmss(36, 1), mmss(37, 0), 3.9],
      [mmss(37, 1), mmss(38, 0), 3.8],
      [mmss(38, 1), mmss(39, 0), 3.7],
      [mmss(39, 1), mmss(40, 0), 3.6],
    ];
    for (const [von, bis, note] of zeilen) {
      expect(berechneNote("lastlauf", von)).toBe(note);
      expect(berechneNote("lastlauf", bis)).toBe(note);
    }
    expect(berechneNote("lastlauf", mmss(30, 0))).toBe(5.0); // 30 Min und weniger
    expect(berechneNote("lastlauf", mmss(27, 45))).toBe(5.0);
    expect(berechneNote("lastlauf", mmss(40, 1))).toBe(1.0); // 40:01 und mehr
    expect(berechneNote("lastlauf", mmss(30, 0) + 0.4)).toBe(4.9); // Bruchteil über 30:00
  });

  it("Klimmzüge: 10 = 5.0 … 6 = 3.6, 5 und weniger = 1.0", () => {
    expect(berechneNote("klimmzuege", 12)).toBe(5.0);
    expect(berechneNote("klimmzuege", 10)).toBe(5.0);
    expect(berechneNote("klimmzuege", 9)).toBe(4.7);
    expect(berechneNote("klimmzuege", 8)).toBe(4.5);
    expect(berechneNote("klimmzuege", 7)).toBe(3.9);
    expect(berechneNote("klimmzuege", 6)).toBe(3.6);
    expect(berechneNote("klimmzuege", 5)).toBe(1.0);
    expect(berechneNote("klimmzuege", 0)).toBe(1.0);
    // Stolperkante: 8→7 verliert 0.6
    expect(berechneNote("klimmzuege", 8) - berechneNote("klimmzuege", 7)).toBeCloseTo(0.6, 6);
  });

  it("Liegestützen: 35 = 5.0, je Wiederholung 0.1, 21 = 3.6, 20 und weniger = 1.0", () => {
    expect(berechneNote("liegestuetze", 40)).toBe(5.0);
    for (let n = 21; n <= 35; n++) {
      expect(berechneNote("liegestuetze", n)).toBe(Math.round((5.0 - (35 - n) * 0.1) * 10) / 10);
    }
    expect(berechneNote("liegestuetze", 30)).toBe(4.5);
    expect(berechneNote("liegestuetze", 25)).toBe(4.0);
    expect(berechneNote("liegestuetze", 20)).toBe(1.0);
  });

  it("Rumpfkraft seitlich: jede Zeile an beiden Grenzen", () => {
    const zeilen: [number, number, number][] = [
      [115, 119, 4.9], [110, 114, 4.8], [105, 109, 4.7], [100, 104, 4.6], [95, 99, 4.5],
      [90, 94, 4.4], [85, 89, 4.3], [80, 84, 4.2], [75, 79, 4.1], [70, 74, 4.0],
      [64, 69, 3.9], [58, 63, 3.8], [52, 57, 3.7], [46, 51, 3.6],
    ];
    for (const [von, bis, note] of zeilen) {
      expect(berechneNote("rumpf_seitlich", von)).toBe(note);
      expect(berechneNote("rumpf_seitlich", bis)).toBe(note);
    }
    expect(berechneNote("rumpf_seitlich", 120)).toBe(5.0);
    expect(berechneNote("rumpf_seitlich", 45)).toBe(1.0);
    expect(berechneNote("rumpf_seitlich", 69.9)).toBe(3.9); // Bruchteil zählt nicht
  });

  it("Dorsale Rumpfkette: jede Zeile an beiden Grenzen", () => {
    const zeilen: [number, number, number][] = [
      [145, 149, 4.9], [140, 144, 4.8], [135, 139, 4.7], [130, 134, 4.6], [125, 129, 4.5],
      [120, 124, 4.4], [115, 119, 4.3], [110, 114, 4.2], [105, 109, 4.1], [100, 104, 4.0],
      [95, 99, 3.9], [90, 94, 3.8], [85, 89, 3.7], [72, 84, 3.6],
    ];
    for (const [von, bis, note] of zeilen) {
      expect(berechneNote("rumpf_dorsal", von)).toBe(note);
      expect(berechneNote("rumpf_dorsal", bis)).toBe(note);
    }
    expect(berechneNote("rumpf_dorsal", 150)).toBe(5.0);
    expect(berechneNote("rumpf_dorsal", 71)).toBe(1.0);
  });
});

describe("wertFuerNote (Umkehrung)", () => {
  it("liefert die am wenigsten anspruchsvolle Grenze der Zielnote", () => {
    expect(wertFuerNote("rumpf_dorsal", 4.5)).toBe(125);
    expect(wertFuerNote("klimmzuege", 4.5)).toBe(8);
    expect(wertFuerNote("lastlauf", 4.5)).toBe(mmss(32, 30));
    expect(wertFuerNote("lastlauf", 4.0)).toBe(mmss(36, 0));
    expect(wertFuerNote("liegestuetze", 9)).toBe(35);
  });
  it("Rundreise Note → Wert → Note für alle Stufen", () => {
    for (const id of ["lastlauf", "klimmzuege", "liegestuetze", "rumpf_seitlich", "rumpf_dorsal"] as const) {
      for (const note of [5.0, 4.5, 4.0, 3.6]) {
        expect(berechneNote(id, wertFuerNote(id, note))).toBeGreaterThanOrEqual(note);
      }
    }
  });
});

describe("Notenstufen und Farben", () => {
  it("Benotung laut Tabelle", () => {
    expect(notenStufe(5.0)).toBe("sehr gut");
    expect(notenStufe(4.5)).toBe("sehr gut");
    expect(notenStufe(4.49)).toBe("gut");
    expect(notenStufe(4.0)).toBe("gut");
    expect(notenStufe(3.99)).toBe("genügend");
    expect(notenStufe(3.6)).toBe("genügend");
    expect(notenStufe(3.59)).toBe("ungenügend");
    expect(notenStufe(1.0)).toBe("ungenügend");
    expect(notenFarbe(3.7)).toBe("var(--status-orange)");
    expect(notenFarbe(null)).toBe("var(--muted-foreground)");
  });
});

describe("bewerteEp", () => {
  it("Schnitt mindestens genügend (≥ 3.60) = bestanden", () => {
    const erg = bewerteEp({ lastlauf: 3.6, klimmzuege: 3.6, liegestuetze: 3.6, rumpf_seitlich: 3.6, rumpf_dorsal: 3.6 });
    expect(erg.schnitt).toBeCloseTo(3.6, 6);
    expect(erg.bestanden).toBe(true);
  });

  it("Schnitt 3.58 = nicht bestanden", () => {
    const erg = bewerteEp({ lastlauf: 3.6, klimmzuege: 3.6, liegestuetze: 3.6, rumpf_seitlich: 3.6, rumpf_dorsal: 3.5 });
    expect(erg.schnitt).toBeCloseTo(3.58, 6);
    expect(erg.bestanden).toBe(false);
  });

  it("eine 1.0 ist kein formeller Ausschluss, wird aber gemeldet", () => {
    const erg = bewerteEp({ lastlauf: 5.0, klimmzuege: 5.0, liegestuetze: 5.0, rumpf_seitlich: 5.0, rumpf_dorsal: 1.0 });
    expect(erg.schnitt).toBeCloseTo(4.2, 6);
    expect(erg.bestanden).toBe(true);
    expect(erg.ausschluss).toEqual(["rumpf_dorsal"]);
  });

  it("unvollständig → bestanden = null", () => {
    expect(bewerteEp({ klimmzuege: 4.5 }).bestanden).toBeNull();
  });
});

describe("berechneEpPrognose", () => {
  it("reagiert auf neue Benchmark-Einträge", () => {
    const alt = berechneEpPrognose(
      [{ datum: "2026-07-01", disziplin: "klimmzuege", wert: 6 }],
      "2026-07-16",
      "2026-11-14"
    );
    const neu = berechneEpPrognose(
      [
        { datum: "2026-07-01", disziplin: "klimmzuege", wert: 6 },
        { datum: "2026-07-15", disziplin: "klimmzuege", wert: 8 },
      ],
      "2026-07-16",
      "2026-11-14"
    );
    expect(neu.disziplinen.klimmzuege.aktuelleNote).toBeGreaterThan(
      alt.disziplinen.klimmzuege.aktuelleNote as number
    );
    expect(neu.disziplinen.klimmzuege.trendProWoche).toBeGreaterThan(0);
  });

  it("dämpft die Projektion auf ±20 %", () => {
    const prog = berechneEpPrognose(
      [
        { datum: "2026-07-01", disziplin: "liegestuetze", wert: 20 },
        { datum: "2026-07-15", disziplin: "liegestuetze", wert: 28 }, // steiler Trend
      ],
      "2026-07-16",
      "2026-11-14"
    );
    // Roh-Projektion wäre absurd hoch; gedämpft auf max 28×1.2 = 33.6
    expect(prog.disziplinen.liegestuetze.prognoseWert).toBeLessThanOrEqual(33.6);
  });

  it("klemmt auf das reglementarische Maximum", () => {
    const prog = berechneEpPrognose(
      [
        { datum: "2026-07-01", disziplin: "rumpf_seitlich", wert: 100 },
        { datum: "2026-07-15", disziplin: "rumpf_seitlich", wert: 118 },
      ],
      "2026-07-16",
      "2026-11-14"
    );
    expect(prog.disziplinen.rumpf_seitlich.prognoseWert).toBeLessThanOrEqual(120);
  });

  it("mischt Lastlauf-Modellwert ein", () => {
    const ohne = berechneEpPrognose([], "2026-07-16", "2026-11-14", 2000);
    expect(ohne.disziplinen.lastlauf.prognoseWert).toBe(2000);
    const mit = berechneEpPrognose(
      [{ datum: "2026-07-10", disziplin: "lastlauf", wert: 2200 }],
      "2026-07-16",
      "2026-11-14",
      2000
    );
    expect(mit.disziplinen.lastlauf.prognoseWert).toBeCloseTo(0.6 * 2200 + 0.4 * 2000, 1);
  });

  it("fehlende Disziplinen werden ausgewiesen", () => {
    const prog = berechneEpPrognose([], "2026-07-16", "2026-11-14");
    expect(prog.fehlendeDisziplinen).toHaveLength(5);
    expect(prog.schnitt).toBeNull();
  });
});

describe("Phasen & Countdown", () => {
  it("16. Juli 2026 liegt in Phase 1", () => {
    expect(aktuellePhase("2026-07-16").nr).toBe(1);
  });
  it("Mitte August in Phase 2, Oktober in Phase 3, EP-Woche im Taper", () => {
    expect(aktuellePhase("2026-08-15").nr).toBe(2);
    expect(aktuellePhase("2026-10-10").nr).toBe(3);
    expect(aktuellePhase("2026-11-10").nr).toBe(4);
  });
  it("Phasengrenze: Spezifisch bis 04.11., Taper ab 05.11. bis EP Tag 2", () => {
    expect(aktuellePhase("2026-11-04").nr).toBe(3);
    expect(aktuellePhase("2026-11-05").nr).toBe(4);
    const phasen = berechnePhasen();
    expect(phasen[2].bis).toBe("2026-11-04");
    expect(phasen[3].von).toBe(TAPER_START);
    expect(phasen[3].bis).toBe(EP_TAG_2);
    expect(aktuellePhase(EP_DATUM).nr).toBe(4);
    expect(aktuellePhase(EP_TAG_2).nr).toBe(4);
  });
  it("nach der EP stürzt nichts ab: Phase 4 bleibt, Countdown meldet vorbei", () => {
    expect(aktuellePhase("2026-12-15").nr).toBe(4);
    expect(epCountdown("2026-11-20").vorbei).toBe(true);
  });
  it("Countdown rechnet Wochen+Tage bis Tag 1 der EP", () => {
    const c = epCountdown("2026-07-16");
    expect(c.gesamtTage).toBe(125);
    expect(c.wochen).toBe(17);
    expect(c.tage).toBe(6);
  });
  it("Countdown 04.11. → 18.11. = 14 Tage = 2 Wochen 0 Tage", () => {
    const c = epCountdown("2026-11-04");
    expect(c).toEqual({ wochen: 2, tage: 0, gesamtTage: 14, vorbei: false, epTag: null });
    expect(epCountdown(EP_DATUM)).toEqual({ wochen: 0, tage: 0, gesamtTage: 0, vorbei: false, epTag: 1 });
  });
  it("am EP-Tag 2 läuft die EP noch: nicht vorbei, epTag 2", () => {
    expect(epCountdown(EP_TAG_2)).toEqual({ wochen: 0, tage: 0, gesamtTage: 0, vorbei: false, epTag: 2 });
  });
  it("EP-Konstanten sind fix", () => {
    expect(EP_DATUM).toBe("2026-11-18");
    expect(EP_TAG_2).toBe("2026-11-19");
    expect(TAPER_START).toBe("2026-11-05");
    expect(restwochen("2026-11-04")).toBe(2);
  });
});

describe("Benchmark-Eingabe", () => {
  it("liest Lastlauf als mm:ss oder Minuten, andere Disziplinen als Zahl", () => {
    expect(parseBenchmarkWert("lastlauf", "33:13")).toBe(1993);
    expect(parseBenchmarkWert("lastlauf", "30:47")).toBe(1847);
    expect(parseBenchmarkWert("lastlauf", "31,5")).toBe(1890);
    expect(parseBenchmarkWert("lastlauf", "33:75")).toBeNull();
    expect(parseBenchmarkWert("klimmzuege", "9")).toBe(9);
    expect(parseBenchmarkWert("rumpf_seitlich", "0")).toBeNull();
    expect(parseBenchmarkWert("liegestuetze", "abc")).toBeNull();
  });
  it("zeigt Lastlauf-Werte als mm:ss", () => {
    expect(benchmarkWertAlsText({ disziplin: "lastlauf", wert: 1993 })).toBe("33:13");
    expect(benchmarkWertAlsText({ disziplin: "klimmzuege", wert: 8 })).toBe("8");
  });
});

describe("aktuellerEpStand (Notenanzeige ohne Prognose)", () => {
  it("nimmt je Disziplin den zuletzt erfassten Wert, ohne Trend und ohne Altersgrenze", () => {
    const stand = aktuellerEpStand([
      { datum: "2026-08-13", disziplin: "rumpf_seitlich", wert: 70 },
      { datum: "2026-08-13", disziplin: "klimmzuege", wert: 6 },
      { datum: "2026-08-23", disziplin: "klimmzuege", wert: 7 },
      { datum: "2026-09-24", disziplin: "klimmzuege", wert: 8 },
      { datum: "2026-10-01", disziplin: "rumpf_dorsal", wert: 125 },
    ]);
    expect(stand.disziplinen.klimmzuege.prognoseWert).toBe(8);
    expect(stand.disziplinen.klimmzuege.prognoseNote).toBe(4.5);
    expect(stand.disziplinen.klimmzuege.datumLetzte).toBe("2026-09-24");
    expect(stand.disziplinen.klimmzuege.trendProWoche).toBeNull();
    expect(stand.disziplinen.rumpf_seitlich.prognoseNote).toBe(4.0); // auch nach > 90 Tagen
    expect(stand.disziplinen.lastlauf.prognoseWert).toBeNull(); // kein Eintrag → keine Prognose
    expect(stand.fehlendeDisziplinen).toEqual(["lastlauf", "liegestuetze"]);
    expect(stand.schnitt).toBeCloseTo((4.5 + 4.0 + 4.5) / 3, 6);
    expect(stand.bestanden).toBeNull(); // erst mit allen fünf
  });
  it("leer → keine Noten", () => {
    const stand = aktuellerEpStand([]);
    expect(stand.schnitt).toBeNull();
    expect(stand.fehlendeDisziplinen).toHaveLength(5);
  });
});
