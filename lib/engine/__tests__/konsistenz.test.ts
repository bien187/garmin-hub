import { describe, expect, it } from "vitest";
import { berechneKonsistenz } from "../konsistenz";

// Do 05.11.2026 → laufende Woche ab Mo 02.11.
const HEUTE = "2026-11-05";

describe("berechneKonsistenz", () => {
  it("liefert 12 Wochen, älteste zuerst, letzte = laufende Woche", () => {
    const k = berechneKonsistenz([], HEUTE, 5.5);
    expect(k.wochen).toHaveLength(12);
    expect(k.wochen.at(-1)?.woche).toBe("2026-11-02");
    expect(k.wochen[0].woche).toBe("2026-08-17");
    expect(k.wochen.every((w) => w.stunden === 0)).toBe(true);
    expect(k.serie).toBe(0);
  });

  it("summiert Dauer je Woche und rundet auf 0.1 h", () => {
    const k = berechneKonsistenz(
      [
        { datum: "2026-11-02", dauerS: 1800 },
        { datum: "2026-11-04", dauerS: 720 },
        { datum: "2026-11-01", dauerS: 3600 }, // Sonntag → Vorwoche
      ],
      HEUTE,
      5.5
    );
    expect(k.wochen.at(-1)?.stunden).toBe(0.7);
    expect(k.wochen.at(-2)?.stunden).toBe(1);
  });

  it("zählt die Serie ab der Vorwoche, die angefangene Woche bricht sie nicht", () => {
    const k = berechneKonsistenz(
      [
        { datum: "2026-10-06", dauerS: 3600 }, // vor der Lücke
        { datum: "2026-10-19", dauerS: 3600 },
        { datum: "2026-10-27", dauerS: 3600 },
        { datum: "2026-10-30", dauerS: 3600 },
      ],
      HEUTE,
      5.5
    );
    // Wochen 19.10. und 26.10. → 2, Lücke ab 12.10.
    expect(k.serie).toBe(2);
  });

  it("laufende Woche zählt mit, sobald das Budget erreicht ist", () => {
    const k = berechneKonsistenz(
      [
        { datum: "2026-10-27", dauerS: 3600 },
        { datum: "2026-11-03", dauerS: 2 * 3600 },
      ],
      HEUTE,
      2
    );
    expect(k.serie).toBe(2);
  });

  it("Serie reicht über die sichtbaren 12 Wochen hinaus", () => {
    const einheiten = Array.from({ length: 20 }, (_, i) => ({
      datum: new Date(Date.UTC(2026, 10, 2 - 7 * (i + 1), 12)).toISOString().slice(0, 10),
      dauerS: 3600,
    }));
    expect(berechneKonsistenz(einheiten, HEUTE, null).serie).toBe(20);
  });

  it("ignoriert zukünftige Einträge", () => {
    const k = berechneKonsistenz([{ datum: "2026-11-06", dauerS: 3600 }], HEUTE, 5.5);
    expect(k.wochen.at(-1)?.stunden).toBe(0);
  });
});
