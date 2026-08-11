import { describe, expect, it } from "vitest";
import {
  fasseZusammen,
  gewichteterMedian,
  medianPaceBeiHr,
} from "../pace-bei-hr";

interface Abschnitt {
  dauerS: number;
  /** Geschwindigkeit in m/s */
  v: number;
  hr: number;
  /** Steigung als Anteil (0.05 = 5 %) */
  steigung?: number;
}

/** Synthetische Streams im Sekundentakt */
function streams(abschnitte: Abschnitt[]) {
  const zeitS: number[] = [];
  const distanzM: number[] = [];
  const hr: (number | null)[] = [];
  const ele: number[] = [];
  let t = 0;
  let d = 0;
  let e = 400;
  for (const a of abschnitte) {
    for (let i = 0; i < a.dauerS; i++) {
      zeitS.push(t);
      distanzM.push(d);
      hr.push(a.hr);
      ele.push(e);
      t += 1;
      d += a.v;
      e += a.v * (a.steigung ?? 0);
    }
  }
  return { zeitS, distanzM, hr, ele };
}

describe("gewichteterMedian", () => {
  it("gewichtet nach Zeit statt nach Anzahl", () => {
    // Der langsame Wert kommt zweimal vor, der schnelle hält aber länger an
    expect(
      gewichteterMedian([
        { wert: 400, gewicht: 10 },
        { wert: 400, gewicht: 10 },
        { wert: 300, gewicht: 600 },
      ])
    ).toBe(300);
  });

  it("liefert null ohne Werte", () => {
    expect(gewichteterMedian([])).toBeNull();
  });
});

describe("medianPaceBeiHr", () => {
  it("findet die Pace im Pulsfenster", () => {
    const s = streams([{ dauerS: 1200, v: 3, hr: 148 }]);
    const e = medianPaceBeiHr(s, { refHr: 148 })!;
    expect(e).not.toBeNull();
    expect(e.paceSKm).toBeCloseTo(1000 / 3, 0);
    expect(e.sekunden).toBeGreaterThan(1100);
  });

  it("ignoriert alles ausserhalb des Pulsfensters", () => {
    const s = streams([
      { dauerS: 900, v: 3, hr: 148 }, // im Fenster
      { dauerS: 900, v: 4.5, hr: 175 }, // zu hoher Puls
      { dauerS: 900, v: 2.0, hr: 110 }, // zu tiefer Puls
    ]);
    const e = medianPaceBeiHr(s, { refHr: 148 })!;
    expect(e.paceSKm).toBeCloseTo(1000 / 3, 0);
    // nur der mittlere Block zählt (Glättungsränder abgezogen)
    expect(e.sekunden).toBeLessThan(950);
  });

  it("rechnet Steigungen heraus: bergauf zählt schneller als flach", () => {
    const flach = medianPaceBeiHr(streams([{ dauerS: 1200, v: 2.5, hr: 148 }]), {
      refHr: 148,
    })!;
    const bergauf = medianPaceBeiHr(
      streams([{ dauerS: 1200, v: 2.5, hr: 148, steigung: 0.05 }]),
      { refHr: 148 }
    )!;
    expect(flach.paceSKm).toBeCloseTo(400, 0);
    expect(bergauf.paceSKm).toBeLessThan(flach.paceSKm - 50);
  });

  it("verweigert das Ergebnis bei zu wenig Zeit im Fenster", () => {
    const s = streams([
      { dauerS: 120, v: 3, hr: 148 },
      { dauerS: 900, v: 4.5, hr: 180 },
    ]);
    expect(medianPaceBeiHr(s, { refHr: 148 })).toBeNull();
  });

  it("überspringt Pausen und Gehen", () => {
    const s = streams([
      { dauerS: 900, v: 3, hr: 148 },
      { dauerS: 600, v: 0.4, hr: 148 }, // Stehen mit Restpuls
    ]);
    const e = medianPaceBeiHr(s, { refHr: 148 })!;
    expect(e.paceSKm).toBeCloseTo(1000 / 3, 0);
  });

  it("braucht verwertbare Streams", () => {
    expect(
      medianPaceBeiHr({ zeitS: [0, 1], distanzM: [0, 3], hr: [140, 140] }, { refHr: 148 })
    ).toBeNull();
  });
});

describe("fasseZusammen", () => {
  it("gewichtet Einzelläufe nach ihrer Zeit im Fenster", () => {
    const z = fasseZusammen([
      { paceSKm: 300, sekunden: 1800 },
      { paceSKm: 420, sekunden: 300 },
    ])!;
    expect(z.paceSKm).toBe(300);
    expect(z.sekunden).toBe(2100);
  });

  it("liefert null, wenn nichts verwertbar ist", () => {
    expect(fasseZusammen([])).toBeNull();
  });
});
