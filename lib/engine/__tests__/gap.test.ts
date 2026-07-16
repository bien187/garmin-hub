import { describe, expect, it } from "vitest";
import { gapAusStreams, gapFaktor, minettiKosten } from "../gap";

describe("minettiKosten", () => {
  it("liefert 3.6 J/kg/m in der Ebene", () => {
    expect(minettiKosten(0)).toBeCloseTo(3.6, 6);
  });

  it("Polynomwert bei +10 % Steigung", () => {
    const i = 0.1;
    const erwartet =
      155.4 * i ** 5 - 30.4 * i ** 4 - 43.3 * i ** 3 + 46.3 * i ** 2 + 19.5 * i + 3.6;
    expect(minettiKosten(0.1)).toBeCloseTo(erwartet, 6);
    expect(minettiKosten(0.1)).toBeGreaterThan(minettiKosten(0));
  });

  it("leichtes Gefälle ist billiger als flach", () => {
    expect(minettiKosten(-0.05)).toBeLessThan(minettiKosten(0));
  });
});

describe("gapAusStreams", () => {
  it("GAP == Ist-Pace auf flacher Strecke", () => {
    const n = 100;
    const zeit = Array.from({ length: n }, (_, i) => i * 10);
    const dist = Array.from({ length: n }, (_, i) => i * 30); // 3 m/s
    const ele = new Array(n).fill(400);
    const erg = gapAusStreams(zeit, dist, ele);
    expect(erg).not.toBeNull();
    expect(erg!.gapPaceSKm).toBeCloseTo(erg!.istPaceSKm as number, 1);
  });

  it("bergauf: GAP-Pace schneller als Ist-Pace", () => {
    const n = 100;
    const zeit = Array.from({ length: n }, (_, i) => i * 10);
    const dist = Array.from({ length: n }, (_, i) => i * 25);
    const ele = Array.from({ length: n }, (_, i) => 400 + i * 2); // 8 % Steigung
    const erg = gapAusStreams(zeit, dist, ele);
    expect(erg).not.toBeNull();
    // Flachäquivalente Distanz > Ist-Distanz → GAP-Pace < Ist-Pace
    expect(erg!.gapPaceSKm as number).toBeLessThan(erg!.istPaceSKm as number);
  });

  it("null bei zu wenig Daten", () => {
    expect(gapAusStreams([0, 10], [0, 30], [400, 400])).toBeNull();
  });
});
