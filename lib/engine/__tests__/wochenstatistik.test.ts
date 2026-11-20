import { describe, expect, it } from "vitest";
import { wochenFortschritt, wochenTage, wochenVerlauf, wochenwerte, type StatAktivitaet } from "../wochenstatistik";

const a = (datum: string, typ: string, dauerS: number, distanzM: number | null, avgHr: number | null): StatAktivitaet => ({
  datum,
  typ,
  dauerS,
  distanzM,
  avgHr,
});

const akts = [
  a("2026-11-30", "strength_training", 3600, null, 110),
  a("2026-12-01", "running", 3000, 10000, 160),
  a("2026-12-02", "trail_running", 1800, 5000, 150),
  a("2026-12-05", "cycling", 3600, 30000, null),
  a("2026-11-25", "running", 2400, 8000, 155), // Vorwoche
];

describe("wochenwerte", () => {
  const w = wochenwerte(akts, "2026-11-30", "2026-12-06");
  it("zählt Einheiten, Zeit und Laufdistanz", () => {
    expect(w.einheiten).toBe(4);
    expect(w.dauerS).toBe(12000);
    expect(w.laeufe).toBe(2);
    expect(w.laufKm).toBe(15);
    expect(w.laufDauerS).toBe(4800);
  });
  it("Pace aus Gesamtzeit/Gesamtdistanz der Läufe", () => {
    expect(w.laufPaceSKm).toBe(320); // 4800 s / 15 km
  });
  it("Puls zeitgewichtet, Einheiten ohne Puls ausgenommen", () => {
    expect(w.avgHr).toBe(Math.round((3600 * 110 + 3000 * 160 + 1800 * 150) / 8400));
  });
  it("ohne Lauf und ohne Puls → null statt 0", () => {
    const leer = wochenwerte([a("2026-12-05", "cycling", 3600, 30000, null)], "2026-11-30", "2026-12-06");
    expect(leer.laufPaceSKm).toBeNull();
    expect(leer.avgHr).toBeNull();
    expect(leer.laufKm).toBe(0);
  });
});

describe("wochenVerlauf", () => {
  it("liefert genau `anzahl` Wochen bis heute, älteste zuerst", () => {
    const v = wochenVerlauf(akts, "2026-12-03", 3);
    expect(v.map((w) => w.woche)).toEqual(["2026-11-16", "2026-11-23", "2026-11-30"]);
    expect(v[1].laufKm).toBe(8);
    expect(v[2].laufKm).toBe(15);
    expect(v[2].einheiten).toBe(3); // Velotour am Samstag liegt nach heute
    expect(v[0].laufPaceSKm).toBeNull();
  });
});

describe("wochenTage und wochenFortschritt", () => {
  const plan = [
    { datum: "2026-11-30", typ: "kraft", titel: "Gym", status: "absolviert" },
    { datum: "2026-12-01", typ: "intervalle", titel: "Intervalle", status: "absolviert" },
    { datum: "2026-12-02", typ: "lauf_z2", titel: "Z2-Lauf 40 Min", status: "geplant" },
    { datum: "2026-12-04", typ: "ruhe", titel: "Ruhetag", status: "geplant" },
  ];
  it("verbindet Plan und Aktivitäten pro Tag", () => {
    const t = wochenTage("2026-11-30", plan, akts);
    expect(t).toHaveLength(7);
    expect(t[1].geplant[0].typ).toBe("intervalle");
    expect(t[1].aktivitaeten).toHaveLength(1);
    expect(t[4]).toMatchObject({ geplant: [], ruhetag: true });
    expect(t[5]).toMatchObject({ ruhetag: false, aktivitaeten: [{ typ: "cycling", dauerS: 3600 }] });
  });
  it("zählt Ruhetage nicht als Trainingseinheit", () => {
    expect(wochenFortschritt(plan)).toEqual({ erledigt: 2, geplant: 3 });
  });
});
