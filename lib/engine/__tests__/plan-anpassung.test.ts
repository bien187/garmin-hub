import { describe, expect, it } from "vitest";
import {
  berechneAnpassungen,
  istHarterLauf,
  type AnpassungsAktivitaet,
  type AnpassungsEinheit,
} from "../plan-anpassung";

const HEUTE = "2026-08-14"; // Freitag
const GESTERN = "2026-08-13"; // Donnerstag

function einheit(over: Partial<AnpassungsEinheit> = {}): AnpassungsEinheit {
  return {
    id: "e1",
    datum: HEUTE,
    typ: "intervalle",
    titel: "Intervalle 5×3 Min Z5",
    status: "geplant",
    erwarteterTrimp: 120,
    ...over,
  };
}

function aktivitaet(over: Partial<AnpassungsAktivitaet> = {}): AnpassungsAktivitaet {
  return {
    id: 1,
    datum: GESTERN,
    istLauf: true,
    istKraft: false,
    trimp: 90,
    eingeplant: false,
    ...over,
  };
}

const BASIS = {
  heute: HEUTE,
  einheiten: [einheit()],
  aktivitaeten: [] as AnpassungsAktivitaet[],
  tsb: 0,
  acwr: 1.0,
  muskeln: {},
};

describe("istHarterLauf", () => {
  it("trennt fordernde von lockeren Einheiten", () => {
    expect(istHarterLauf("intervalle")).toBe(true);
    expect(istHarterLauf("lastlauf")).toBe(true);
    expect(istHarterLauf("langer_lauf")).toBe(true);
    expect(istHarterLauf("lauf_z2")).toBe(false);
    expect(istHarterLauf("kraft")).toBe(false);
  });
});

describe("berechneAnpassungen", () => {
  it("greift nicht ein, wenn nichts Ungeplantes passiert ist", () => {
    expect(berechneAnpassungen(BASIS)).toEqual([]);
  });

  it("schwächt den Folgetag nach einem spontanen Lauf ab", () => {
    const a = berechneAnpassungen({
      ...BASIS,
      aktivitaeten: [aktivitaet()],
    });
    expect(a).toHaveLength(1);
    expect(a[0].neuerTyp).toBe("lauf_z2");
    expect(a[0].alterTyp).toBe("intervalle");
    expect(a[0].grund).toMatch(/ungeplant/i);
  });

  it("lässt geplante Einheiten des Vortags in Ruhe", () => {
    // derselbe Lauf, aber er war so vorgesehen → kein Eingriff
    expect(
      berechneAnpassungen({
        ...BASIS,
        aktivitaeten: [aktivitaet({ eingeplant: true })],
      })
    ).toEqual([]);
  });

  it("streicht einen lockeren Lauf nach einer harten Spontaneinheit ganz", () => {
    const a = berechneAnpassungen({
      ...BASIS,
      einheiten: [einheit({ typ: "lauf_z2", titel: "Z2-Lauf 50 Min" })],
      aktivitaeten: [aktivitaet({ trimp: 130 })],
    });
    expect(a).toHaveLength(1);
    expect(a[0].neuerTyp).toBe("ruhe");
  });

  it("übernimmt die Dauer in den abgeschwächten Titel", () => {
    const a = berechneAnpassungen({
      ...BASIS,
      einheiten: [einheit({ titel: "Langer Lauf 75 Min", typ: "langer_lauf" })],
      aktivitaeten: [aktivitaet()],
    });
    expect(a[0].neuerTitel).toContain("75");
  });

  it("schreibt Vergangenes nicht um", () => {
    expect(
      berechneAnpassungen({
        ...BASIS,
        einheiten: [einheit({ datum: "2026-08-12" })],
        aktivitaeten: [aktivitaet({ datum: "2026-08-11" })],
      })
    ).toEqual([]);
  });

  it("fasst absolvierte und verpasste Einheiten nicht an", () => {
    for (const status of ["absolviert", "verpasst"]) {
      expect(
        berechneAnpassungen({
          ...BASIS,
          einheiten: [einheit({ status })],
          aktivitaeten: [aktivitaet()],
        })
      ).toEqual([]);
    }
  });

  it("passt dieselbe Einheit kein zweites Mal an", () => {
    expect(
      berechneAnpassungen({
        ...BASIS,
        aktivitaeten: [aktivitaet()],
        bereitsAngepasst: ["e1"],
      })
    ).toEqual([]);
  });

  it("merkt sich, dass die Einheit schon auf der Uhr liegt", () => {
    const a = berechneAnpassungen({
      ...BASIS,
      einheiten: [einheit({ status: "gepusht" })],
      aktivitaeten: [aktivitaet()],
    });
    expect(a[0].bereitsGepusht).toBe(true);
  });

  it("streicht harte Einheiten bei tief negativer Form", () => {
    const a = berechneAnpassungen({ ...BASIS, tsb: -30 });
    expect(a).toHaveLength(1);
    expect(a[0].neuerTyp).toBe("ruhe");
    expect(a[0].grund).toMatch(/TSB/);
  });

  it("bremst bei ACWR in der roten Zone", () => {
    const a = berechneAnpassungen({ ...BASIS, acwr: 1.7 });
    expect(a[0].neuerTyp).toBe("lauf_z2");
    expect(a[0].grund).toMatch(/ACWR/);
  });

  it("verschont harte Einheiten mit müden Beinen erst ab 65 %", () => {
    expect(berechneAnpassungen({ ...BASIS, muskeln: { quadrizeps: 60 } })).toEqual([]);
    const a = berechneAnpassungen({ ...BASIS, muskeln: { quadrizeps: 80 } });
    expect(a[0].neuerTyp).toBe("lauf_z2");
  });

  it("baut die Woche nicht komplett ab (max. zwei Eingriffe)", () => {
    const a = berechneAnpassungen({
      ...BASIS,
      tsb: -40,
      einheiten: [
        einheit({ id: "a", datum: HEUTE }),
        einheit({ id: "b", datum: "2026-08-15" }),
        einheit({ id: "c", datum: "2026-08-16" }),
      ],
    });
    expect(a.length).toBeLessThanOrEqual(2);
  });
});

describe("Taper und EP", () => {
  it("EP-Einträge werden nie angepasst — auch nicht bei tiefem TSB", () => {
    const r = berechneAnpassungen({
      ...BASIS,
      heute: "2026-11-18",
      tsb: -40,
      acwr: 1.8,
      einheiten: [einheit({ id: "ep1", datum: "2026-11-18", typ: "ep", titel: "EP – Tag 1" })],
      aktivitaeten: [aktivitaet({ datum: "2026-11-17", trimp: 150 })],
    });
    expect(r).toEqual([]);
  });

  it("im Taper wird nie über die Tagesregel hinaus ersetzt (Zieltempo 10.11. → Z2 ≤ 40 Min)", () => {
    const r = berechneAnpassungen({
      ...BASIS,
      heute: "2026-11-10",
      einheiten: [
        einheit({ id: "t1", datum: "2026-11-10", titel: "Zieltempo-Lauf 38 Min (3×5 Min Z4)" }),
      ],
      aktivitaeten: [aktivitaet({ datum: "2026-11-09", trimp: 120 })],
    });
    expect(r).toHaveLength(1);
    expect(r[0].neuerTyp).toBe("lauf_z2");
    const min = parseInt(r[0].neuerTitel.match(/(\d+) Min/)![1], 10);
    expect(min).toBeLessThanOrEqual(40);
  });

  it("an Tagen ohne erlaubten Lauf wird statt eines Laufs ein Ruhetag daraus", () => {
    const r = berechneAnpassungen({
      ...BASIS,
      heute: "2026-11-16",
      einheiten: [einheit({ id: "x", datum: "2026-11-16", titel: "Intervalle 5×3 Min Z5" })],
      aktivitaeten: [aktivitaet({ datum: "2026-11-15", trimp: 120 })],
    });
    expect(r[0].neuerTyp).toBe("ruhe");
  });
});
