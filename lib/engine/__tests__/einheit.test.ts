import { describe, expect, it } from "vitest";
import { geplanteDauerS, geplanteDistanzM, intensitaet, kategorie, strukturZeilen, zielPace } from "../einheit";

const intervalle = {
  sport: "laufen",
  schritte: [
    { art: "aufwaermen", dauerTyp: "zeit", dauerWert: 900 },
    {
      art: "wiederholung",
      dauerTyp: "offen",
      wiederholungen: 5,
      schritte: [
        { art: "intervall", dauerTyp: "distanz", dauerWert: 1000, ziel: { typ: "pace", vonSproKm: 306, bisSproKm: 294 } },
        { art: "erholung", dauerTyp: "zeit", dauerWert: 90 },
      ],
    },
    { art: "auslaufen", dauerTyp: "zeit", dauerWert: 600 },
  ],
};

describe("geplanteDauerS", () => {
  it("summiert Zeit- und Distanzschritte inkl. Wiederholungen (Distanz mit Ziel-Pace)", () => {
    expect(geplanteDauerS(intervalle)).toBe(900 + 5 * (300 + 90) + 600);
  });
  it("Distanz ohne Pace-Ziel mit Standard-Pace", () => {
    expect(geplanteDauerS({ schritte: [{ art: "intervall", dauerTyp: "distanz", dauerWert: 2000 }] }, 300)).toBe(600);
  });
  it("Kraft-Struktur oder fehlende Struktur → null", () => {
    expect(geplanteDauerS({ sport: "kraft", uebungen: [{ name: "Klimmzüge", saetze: 5 }] })).toBeNull();
    expect(geplanteDauerS(null)).toBeNull();
  });
});

describe("zielPace und geplanteDistanzM", () => {
  it("findet die schnellste Pace-Vorgabe", () => {
    expect(zielPace(intervalle)).toEqual({ von: 306, bis: 294 });
    expect(zielPace({ schritte: [{ art: "intervall", dauerTyp: "zeit", dauerWert: 60 }] })).toBeNull();
  });
  it("summiert Distanzschritte", () => {
    expect(geplanteDistanzM(intervalle)).toBe(5000);
    expect(geplanteDistanzM({ schritte: [] })).toBeNull();
  });
});

describe("kategorie und intensitaet", () => {
  it("ordnet Typen zu, auch ältere", () => {
    expect(kategorie("kraft")).toBe("gym");
    expect(kategorie("huegel_intervalle")).toBe("intervalle");
    expect(kategorie("lauf_z2")).toBe("lauf");
    expect(kategorie("ruhe")).toBe("ruhe");
    expect(kategorie("gtg")).toBe("sonstiges");
  });
  it("Intensitätsstufen", () => {
    expect(intensitaet("intervalle")?.stufe).toBe(3);
    expect(intensitaet("lauf_z2")?.stufe).toBe(1);
    expect(intensitaet("ruhe")?.stufe).toBe(0);
    expect(intensitaet("unbekannt")).toBeNull();
  });
});

describe("strukturZeilen", () => {
  it("beschreibt Lauf-Schritte inkl. Wiederholungen und Zielen", () => {
    expect(strukturZeilen(intervalle as never)).toEqual([
      "Einlaufen 15 Min",
      "5 × (Belastung 1 km 5:06–4:54 /km · Pause 90 s)",
      "Auslaufen 10 Min",
    ]);
  });
  it("beschreibt Kraftübungen", () => {
    expect(
      strukturZeilen({ uebungen: [{ name: "Klimmzüge", saetze: 5, wdh: 6 }, { name: "Plank", saetze: 3, dauerS: 60, notiz: "ruhig atmen" }] })
    ).toEqual(["Klimmzüge · 5 × 6", "Plank · 3 × 60 s — ruhig atmen"]);
  });
  it("ohne Struktur leer", () => {
    expect(strukturZeilen(null)).toEqual([]);
  });
});
