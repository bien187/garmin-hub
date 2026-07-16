import { describe, expect, it } from "vitest";
import { acwrZone, berechneAcwr, berechneFitnessSerie, tsbZone } from "../fitness";

function tage(trimps: number[]) {
  return trimps.map((t, i) => ({
    datum: `2026-0${Math.floor(i / 28) + 1}-${String((i % 28) + 1).padStart(2, "0")}`,
    trimp: t,
  }));
}

describe("berechneFitnessSerie", () => {
  it("konvergiert bei konstanter Last gegen die Last", () => {
    const serie = berechneFitnessSerie(tage(new Array(300).fill(50)));
    const letzte = serie[serie.length - 1];
    expect(letzte.ctl).toBeGreaterThan(49);
    expect(letzte.ctl).toBeLessThanOrEqual(50);
    expect(letzte.atl).toBeGreaterThan(49.9);
    // Eingeschwungen: TSB nahe 0
    expect(Math.abs(letzte.tsb)).toBeLessThan(1);
  });

  it("ATL reagiert schneller als CTL", () => {
    const trimps = [...new Array(60).fill(30), ...new Array(7).fill(100)];
    const serie = berechneFitnessSerie(tage(trimps));
    const letzte = serie[serie.length - 1];
    expect(letzte.atl).toBeGreaterThan(letzte.ctl);
    expect(letzte.tsb).toBeLessThan(0);
  });

  it("TSB ist der Vortagsstand (Form vor der Einheit)", () => {
    const serie = berechneFitnessSerie(tage([100, 0, 0]));
    expect(serie[0].tsb).toBe(0); // vor der ersten Einheit
    expect(serie[1].tsb).toBeLessThan(0); // nach hartem Tag 1
  });
});

describe("berechneAcwr", () => {
  it("liefert null bei < 28 Tagen", () => {
    expect(berechneAcwr(new Array(27).fill(50))).toBeNull();
  });

  it("ist 1.0 bei konstanter Last", () => {
    expect(berechneAcwr(new Array(28).fill(50))).toBeCloseTo(1.0, 6);
  });

  it("erkennt akute Überlastung", () => {
    const trimps = [...new Array(21).fill(30), ...new Array(7).fill(90)];
    const acwr = berechneAcwr(trimps);
    expect(acwr).toBeGreaterThan(1.5);
  });
});

describe("Zonen-Interpretation", () => {
  it("tsbZone", () => {
    expect(tsbZone(15)).toBe("frisch");
    expect(tsbZone(0)).toBe("produktiv");
    expect(tsbZone(-15)).toBe("neutral");
    expect(tsbZone(-25)).toBe("warnung");
  });

  it("acwrZone", () => {
    expect(acwrZone(null)).toBeNull();
    expect(acwrZone(0.5)).toBe("unter");
    expect(acwrZone(1.0)).toBe("sweetspot");
    expect(acwrZone(1.4)).toBe("erhoeht");
    expect(acwrZone(1.6)).toBe("gefahr");
  });
});
