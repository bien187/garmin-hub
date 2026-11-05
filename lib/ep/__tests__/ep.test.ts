import { describe, expect, it } from "vitest";
import { berechneNote, bewerteEp, wertFuerNote } from "../disziplinen";
import { berechneEpPrognose } from "../prognose";
import { aktuellePhase, berechnePhasen, epCountdown, restwochen } from "../phasen";
import { EP_DATUM, EP_TAG_2, TAPER_START } from "../konstanten";

describe("Notentabellen (berechneNote)", () => {
  it("Lastlauf: Stützpunkte exakt", () => {
    expect(berechneNote("lastlauf", 1800)).toBe(5.0); // 30:00
    expect(berechneNote("lastlauf", 1700)).toBe(5.0); // schneller als 30:00
    expect(berechneNote("lastlauf", 1980)).toBeCloseTo(4.6, 6); // 33:00
    expect(berechneNote("lastlauf", 2160)).toBeCloseTo(4.0, 6); // 36:00
    expect(berechneNote("lastlauf", 2500)).toBe(1.0); // > 40:00
  });

  it("Klimmzüge: exakte Tabelle inkl. Stolperkante", () => {
    expect(berechneNote("klimmzuege", 10)).toBe(5.0);
    expect(berechneNote("klimmzuege", 9)).toBeCloseTo(4.7, 6);
    expect(berechneNote("klimmzuege", 8)).toBeCloseTo(4.5, 6);
    expect(berechneNote("klimmzuege", 7)).toBeCloseTo(3.9, 6);
    expect(berechneNote("klimmzuege", 6)).toBeCloseTo(3.6, 6);
    expect(berechneNote("klimmzuege", 5)).toBe(1.0);
    expect(berechneNote("klimmzuege", 3)).toBe(1.0);
    expect(berechneNote("klimmzuege", 12)).toBe(5.0);
    // Stolperkante: 8→7 verliert 0.6, 9→8 nur 0.2
    expect(berechneNote("klimmzuege", 8) - berechneNote("klimmzuege", 7)).toBeCloseTo(0.6, 6);
  });

  it("Liegestütze", () => {
    expect(berechneNote("liegestuetze", 35)).toBe(5.0);
    expect(berechneNote("liegestuetze", 40)).toBe(5.0);
    expect(berechneNote("liegestuetze", 30)).toBeCloseTo(4.5, 6);
    expect(berechneNote("liegestuetze", 20)).toBeCloseTo(1.0, 6);
    expect(berechneNote("liegestuetze", 10)).toBe(1.0);
  });

  it("Rumpf seitlich/dorsal", () => {
    expect(berechneNote("rumpf_seitlich", 120)).toBe(5.0);
    expect(berechneNote("rumpf_seitlich", 72)).toBeCloseTo(4.0, 6);
    expect(berechneNote("rumpf_seitlich", 45)).toBeCloseTo(1.0, 6);
    expect(berechneNote("rumpf_dorsal", 150)).toBe(5.0);
    expect(berechneNote("rumpf_dorsal", 102)).toBeCloseTo(4.0, 6);
    expect(berechneNote("rumpf_dorsal", 71)).toBeCloseTo(1.0, 6);
  });

  it("interpoliert zwischen Stützpunkten monoton", () => {
    const n95 = berechneNote("rumpf_seitlich", 95);
    expect(n95).toBeGreaterThan(4.0);
    expect(n95).toBeLessThan(5.0);
  });
});

describe("wertFuerNote (Umkehrung)", () => {
  it("rundreise Note→Wert→Note", () => {
    const wert = wertFuerNote("rumpf_dorsal", 4.5);
    expect(berechneNote("rumpf_dorsal", wert)).toBeCloseTo(4.5, 4);
  });
});

describe("bewerteEp", () => {
  it("Schnitt ≥ 4.0 ohne 1.0 = bestanden", () => {
    const erg = bewerteEp({
      lastlauf: 4.6,
      klimmzuege: 4.5,
      liegestuetze: 4.5,
      rumpf_seitlich: 4.0,
      rumpf_dorsal: 4.0,
    });
    expect(erg.schnitt).toBeCloseTo(4.32, 2);
    expect(erg.bestanden).toBe(true);
  });

  it("eine 1.0 → nicht bestanden trotz gutem Schnitt", () => {
    const erg = bewerteEp({
      lastlauf: 5.0,
      klimmzuege: 5.0,
      liegestuetze: 5.0,
      rumpf_seitlich: 5.0,
      rumpf_dorsal: 1.0,
    });
    expect(erg.schnitt).toBeCloseTo(4.2, 2);
    expect(erg.bestanden).toBe(false);
    expect(erg.ausschluss).toContain("rumpf_dorsal");
  });

  it("unvollständig → bestanden = null", () => {
    const erg = bewerteEp({ klimmzuege: 4.5 });
    expect(erg.bestanden).toBeNull();
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
