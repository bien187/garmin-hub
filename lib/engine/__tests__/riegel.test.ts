import { describe, expect, it } from "vitest";
import { bestEffort, fuenfKmPrognose, riegelPrognose } from "../riegel";

describe("riegelPrognose", () => {
  it("T2 = T1 × (D2/D1)^1.06", () => {
    // 10 km in 59:20 (Bens 5:56/km) → 5 km
    const t5 = riegelPrognose(3560, 10000, 5000);
    expect(t5).toBeCloseTo(3560 * Math.pow(0.5, 1.06), 3);
    expect(t5).toBeLessThan(3560 / 2); // kürzere Distanz → schnellere Pace
  });

  it("Identität bei gleicher Distanz", () => {
    expect(riegelPrognose(1500, 5000, 5000)).toBeCloseTo(1500, 6);
  });
});

describe("bestEffort", () => {
  it("findet das schnellste Fenster", () => {
    // 4 km: km 1-2 in 4:00/km, Rest 6:00/km
    const zeit: number[] = [];
    const dist: number[] = [];
    let t = 0;
    let d = 0;
    for (let i = 0; i < 400; i++) {
      const paceSproM = d >= 1000 && d < 2000 ? 0.24 : 0.36;
      d += 10;
      t += 10 * paceSproM;
      zeit.push(t);
      dist.push(d);
    }
    const erg = bestEffort(zeit, dist, 1000);
    expect(erg).not.toBeNull();
    expect(erg!.zeitS).toBeGreaterThan(235);
    expect(erg!.zeitS).toBeLessThan(245);
  });

  it("null, wenn Aktivität kürzer als Zieldistanz", () => {
    expect(bestEffort([0, 100], [0, 800], 1000)).toBeNull();
  });
});

describe("fuenfKmPrognose", () => {
  it("nimmt die beste Projektion", () => {
    const erg = fuenfKmPrognose([
      { distanzM: 1000, zeitS: 300, paceSKm: 300 }, // 5:00/km → projiziert langsamer auf 5k
      { distanzM: 10000, zeitS: 3560, paceSKm: 356 },
    ]);
    expect(erg).not.toBeNull();
    const von1k = riegelPrognose(300, 1000, 5000);
    const von10k = riegelPrognose(3560, 10000, 5000);
    expect(erg).toBeCloseTo(Math.min(von1k, von10k), 3);
  });

  it("ignoriert zu kurze Efforts", () => {
    expect(fuenfKmPrognose([{ distanzM: 400, zeitS: 60, paceSKm: 150 }])).toBeNull();
  });
});
