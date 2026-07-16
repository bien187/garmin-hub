import { describe, expect, it } from "vitest";
import { korrelationsInsights, pearson } from "../correlations";

describe("pearson", () => {
  it("perfekte positive Korrelation", () => {
    const erg = pearson([
      { x: 1, y: 2 },
      { x: 2, y: 4 },
      { x: 3, y: 6 },
    ]);
    expect(erg!.r).toBeCloseTo(1, 6);
  });

  it("perfekte negative Korrelation", () => {
    const erg = pearson([
      { x: 1, y: 6 },
      { x: 2, y: 4 },
      { x: 3, y: 2 },
    ]);
    expect(erg!.r).toBeCloseTo(-1, 6);
  });

  it("ignoriert null-Werte", () => {
    const erg = pearson([
      { x: 1, y: 2 },
      { x: null, y: 5 },
      { x: 2, y: 4 },
      { x: 3, y: null },
      { x: 3, y: 6 },
    ]);
    expect(erg!.n).toBe(3);
    expect(erg!.r).toBeCloseTo(1, 6);
  });

  it("null bei konstanter Reihe", () => {
    expect(
      pearson([
        { x: 1, y: 1 },
        { x: 2, y: 1 },
        { x: 3, y: 1 },
      ])
    ).toBeNull();
  });
});

describe("korrelationsInsights", () => {
  it("filtert |r| < 0.3 und n < 15", () => {
    // 20 Tage mit starker Schlaf→EF-Korrelation, Rest leer
    const tage = Array.from({ length: 20 }, (_, i) => ({
      datum: `2026-06-${String(i + 1).padStart(2, "0")}`,
      schlafDauerH: 6 + (i % 4),
      schlafScore: null,
      hrv: null,
      ruhepuls: null,
      ctl: null,
      efFolgetag: 1.0 + 0.05 * (i % 4) + (i % 2) * 0.001,
      trimp: null,
      wadenErschoepfung: null,
      hmTag: null,
    }));
    const karten = korrelationsInsights({ tage });
    expect(karten.length).toBeGreaterThan(0);
    expect(karten[0].id).toBe("schlaf_ef");
    expect(karten.every((k) => Math.abs(k.r) >= 0.3 && k.n >= 15)).toBe(true);
  });

  it("leer bei zu wenig Daten", () => {
    const karten = korrelationsInsights({
      tage: [
        {
          datum: "2026-06-01",
          schlafDauerH: 7,
          schlafScore: 80,
          hrv: 60,
          ruhepuls: 46,
          ctl: 40,
          efFolgetag: 1.1,
          trimp: 50,
          wadenErschoepfung: 20,
          hmTag: 100,
        },
      ],
    });
    expect(karten).toHaveLength(0);
  });
});
