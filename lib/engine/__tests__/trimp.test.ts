import { describe, expect, it } from "vitest";
import { banisterTrimp, sessionRpeTrimp, trimpFuerEinheit } from "../trimp";

describe("banisterTrimp", () => {
  it("berechnet die Banister-Formel korrekt", () => {
    // 60 min, HRr = 0.5 → 60 × 0.5 × 0.64 × e^0.96
    const erwartet = 60 * 0.5 * 0.64 * Math.exp(1.92 * 0.5);
    expect(banisterTrimp(3600, 121.5, 46, 197)).toBeCloseTo(erwartet, 5);
  });

  it("steigt überproportional mit der Intensität", () => {
    const locker = banisterTrimp(3600, 140, 46, 197);
    const hart = banisterTrimp(3600, 180, 46, 197);
    expect(hart).toBeGreaterThan(locker * 1.8);
  });

  it("liefert 0 bei unbrauchbaren Eingaben", () => {
    expect(banisterTrimp(0, 150, 46, 197)).toBe(0);
    expect(banisterTrimp(3600, 40, 46, 197)).toBe(0); // HR unter Ruhepuls
    expect(banisterTrimp(3600, 150, 197, 46)).toBe(0); // max <= ruhe
  });

  it("klemmt HRr auf maximal 1", () => {
    const beiMax = banisterTrimp(3600, 197, 46, 197);
    const ueberMax = banisterTrimp(3600, 250, 46, 197);
    expect(ueberMax).toBeCloseTo(beiMax, 6);
  });
});

describe("sessionRpeTrimp", () => {
  it("skaliert mit Dauer und Volumen", () => {
    const klein = sessionRpeTrimp(3600, 2000);
    const gross = sessionRpeTrimp(3600, 8000);
    expect(gross).toBeGreaterThan(klein);
    expect(gross).toBeCloseTo(60 * 0.8, 5);
  });
});

describe("trimpFuerEinheit", () => {
  it("nutzt Banister für Läufe mit HR", () => {
    const t = trimpFuerEinheit({
      dauerS: 3600,
      avgHr: 150,
      istKraft: false,
      hrRuhe: 46,
      hrMax: 197,
    });
    expect(t).toBeCloseTo(banisterTrimp(3600, 150, 46, 197), 6);
  });

  it("nutzt RPE-Fallback für Kraft ohne HR", () => {
    const t = trimpFuerEinheit({
      dauerS: 3600,
      avgHr: null,
      istKraft: true,
      volumenKg: 8000,
      hrRuhe: 46,
      hrMax: 197,
    });
    expect(t).toBeCloseTo(48, 3);
  });
});
