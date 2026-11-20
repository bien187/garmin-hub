import { describe, expect, it } from "vitest";
import {
  generiereWochenplan,
  klimmzugMaxAusSaetzen,
  LANGER_LAUF_AB,
  PlanInput,
  Z2_MAX,
  Z2_MAX_ENTLASTUNG,
  Z2_MIN,
} from "../plan";
import { geplanteDauerS } from "../einheit";
import { istLaufTyp, minutenAusTitel } from "../plan-typen";

/** Montag, 23.11.2026 = erste Woche des Programms */
const basis: PlanInput = {
  wochenstart: "2026-11-23",
  blockWoche: 1,
  vorwocheLaufMin: 95,
  tsb: 0,
  acwr: 1.0,
  muscleState: {},
  klimmzugMax: 8,
  readiness: 70,
  paces: null,
  zonen: {
    z2: { von: 137, bis: 152 },
    z4: { von: 168, bis: 183 },
    z5: { von: 183, bis: 197 },
  },
};

const amTag = (plan: ReturnType<typeof generiereWochenplan>, i: number) =>
  plan.einheiten.filter((e) => e.datum === ["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29"][i]);

describe("generiereWochenplan — fester Wochenrhythmus", () => {
  const plan = generiereWochenplan(basis);

  it("Mo und Do Gym", () => {
    expect(amTag(plan, 0).map((e) => e.typ)).toEqual(["kraft"]);
    expect(amTag(plan, 3).map((e) => e.typ)).toEqual(["kraft"]);
  });

  it("Di Intervalle, Mi lockerer Lauf in Zone 2", () => {
    expect(amTag(plan, 1).map((e) => e.typ)).toEqual(["intervalle"]);
    expect(amTag(plan, 2).map((e) => e.typ)).toEqual(["lauf_z2"]);
  });

  it("Fr Ruhetag, Sa und So ohne Pflichteinheit", () => {
    expect(amTag(plan, 4).map((e) => e.typ)).toEqual(["ruhe"]);
    expect(amTag(plan, 5)).toEqual([]);
    expect(amTag(plan, 6)).toEqual([]);
  });

  it("genau zwei Läufe und zwei Gym-Einheiten pro Woche", () => {
    expect(plan.einheiten.filter((e) => istLaufTyp(e.typ))).toHaveLength(2);
    expect(plan.einheiten.filter((e) => e.typ === "kraft")).toHaveLength(2);
  });

  it("keine Altlasten aus dem früheren Programm", () => {
    const text = JSON.stringify(plan);
    expect(text).not.toMatch(/\bEP\b|EP-|Lastlauf|Probe|Taper|Grenadier|Note|Prüfung|Metronom/);
    for (const e of plan.einheiten) {
      expect(["kraft", "intervalle", "huegel_intervalle", "lauf_z2", "langer_lauf", "ruhe"]).toContain(e.typ);
    }
  });

  it("speichert die Blockwoche als Phase", () => {
    expect(plan.phaseNr).toBe(1);
  });
});

describe("Intervall-Schwerpunkt wechselt mit der Blockwoche", () => {
  const quali = (blockWoche: 1 | 2 | 3 | 4) =>
    generiereWochenplan({ ...basis, blockWoche }).einheiten.find((e) => e.datum === "2026-11-24")!;

  it("Woche 1: VO₂max 5×3 Min", () => {
    const e = quali(1);
    expect(e.typ).toBe("intervalle");
    expect(e.titel).toContain("5×3 Min");
  });
  it("Woche 2: Hügel-Intervalle", () => {
    expect(quali(2).typ).toBe("huegel_intervalle");
  });
  it("Woche 3: Tempo 5×1 km mit Distanz-Wiederholungen", () => {
    const e = quali(3);
    expect(e.titel).toContain("5×1 km");
    const wdh = e.struktur!.schritte!.find((s) => s.art === "wiederholung")!;
    expect(wdh.wiederholungen).toBe(5);
    expect(wdh.schritte![0]).toMatchObject({ dauerTyp: "distanz", dauerWert: 1000 });
  });
  it("Woche 4 (Entlastung): nur lockere Spitzen, Umfang −30 %, weniger Gym-Sätze", () => {
    const normal = generiereWochenplan(basis);
    const entlastung = generiereWochenplan({ ...basis, blockWoche: 4 });
    expect(quali(4).titel).toContain("4×60 s");
    expect(entlastung.hinweise.some((h) => h.includes("Entlastungswoche"))).toBe(true);
    const saetze = (p: typeof normal) =>
      p.einheiten
        .filter((e) => e.typ === "kraft")
        .flatMap((e) => e.struktur!.uebungen!)
        .reduce((s, u) => s + u.saetze, 0);
    expect(saetze(entlastung)).toBeLessThan(saetze(normal));
  });
});

describe("Umfangssteuerung", () => {
  const z2 = (inp: Partial<PlanInput>) =>
    generiereWochenplan({ ...basis, ...inp }).einheiten.find((e) => e.typ === "lauf_z2" || e.typ === "langer_lauf")!;

  it("lockerer Lauf aus dem Restumfang (+10 %) mit Zone-2-Ziel", () => {
    const e = z2({});
    const min = minutenAusTitel(e.titel)!;
    expect(min).toBeGreaterThanOrEqual(Z2_MIN);
    expect(min).toBeLessThanOrEqual(Z2_MAX);
    expect(min % 5).toBe(0);
    const kern = e.struktur!.schritte!.find((s) => s.art === "intervall")!;
    expect(kern.ziel).toEqual({ typ: "hr", vonBpm: 137, bisBpm: 152 });
  });

  it("geplante Laufminuten steigen höchstens um 10 % gegenüber der Vorwoche", () => {
    for (const vorwoche of [90, 120, 150, 180]) {
      const plan = generiereWochenplan({ ...basis, vorwocheLaufMin: vorwoche });
      const minuten = plan.einheiten
        .filter((e) => istLaufTyp(e.typ))
        .reduce((s, e) => s + (geplanteDauerS(e.struktur) ?? 0) / 60, 0);
      expect(minuten).toBeLessThanOrEqual(vorwoche * 1.1 + 5); // Rundung auf 5 Min
    }
  });

  it("viel Vorwochen-Umfang → langer Lauf am Mittwoch, gedeckelt", () => {
    const e = z2({ vorwocheLaufMin: 220 });
    expect(e.typ).toBe("langer_lauf");
    expect(minutenAusTitel(e.titel)).toBe(Z2_MAX);
    expect(Z2_MAX).toBeGreaterThanOrEqual(LANGER_LAUF_AB);
  });

  it("Entlastungswoche: lockerer Lauf höchstens 60 Min, kein langer Lauf — auch nach viel Umfang", () => {
    const e = z2({ blockWoche: 4, vorwocheLaufMin: 200 });
    expect(e.typ).toBe("lauf_z2");
    expect(minutenAusTitel(e.titel)).toBeLessThanOrEqual(Z2_MAX_ENTLASTUNG);
  });

  it("ACWR > 1.3 → Hinweis auf Deckelung", () => {
    const plan = generiereWochenplan({ ...basis, acwr: 1.45 });
    expect(plan.hinweise.some((h) => h.includes("ACWR"))).toBe(true);
  });

  it("TSB < −20 → Intervalle gestrichen, Extra-Ruhetag, kurzer lockerer Lauf", () => {
    const plan = generiereWochenplan({ ...basis, tsb: -25, vorwocheLaufMin: 200 });
    expect(plan.einheiten.some((e) => e.typ === "intervalle" || e.typ === "huegel_intervalle")).toBe(false);
    expect(amTag(plan, 1).map((e) => e.titel)).toEqual(["Extra-Ruhetag"]);
    expect(minutenAusTitel(z2({ tsb: -25, vorwocheLaufMin: 200 }).titel)).toBeLessThanOrEqual(40);
    expect(plan.hinweise.some((h) => h.includes("Extra-Ruhetag"))).toBe(true);
  });
});

describe("Muskel-Gates und Readiness", () => {
  it("müde Beine → Intervalle und lockerer Lauf tauschen die Tage", () => {
    const plan = generiereWochenplan({ ...basis, muscleState: { quadrizeps: 75 } });
    expect(amTag(plan, 1).map((e) => e.typ)).toEqual(["lauf_z2"]);
    expect(amTag(plan, 2).map((e) => e.typ)).toEqual(["intervalle"]);
    expect(plan.hinweise.some((h) => h.includes("Quadrizeps"))).toBe(true);
  });

  it("tiefe Readiness → Hinweis", () => {
    const plan = generiereWochenplan({ ...basis, readiness: 25 });
    expect(plan.hinweise.some((h) => h.includes("Readiness"))).toBe(true);
  });
});

describe("Klimmzüge aus Garmin-Kraftsätzen", () => {
  it("Arbeitswiederholungen ≈ 60 % des Maximums", () => {
    const plan = generiereWochenplan({ ...basis, klimmzugMax: 10 });
    const ue = amTag(plan, 3)[0].struktur!.uebungen!.find((u) => u.name.startsWith("Klimmzüge"))!;
    expect(ue.wdh).toBe(6);
  });

  it("ohne Messwert keine geratene Zahl, sondern eine Anleitung", () => {
    const plan = generiereWochenplan({ ...basis, klimmzugMax: null });
    const ue = amTag(plan, 3)[0].struktur!.uebungen!.find((u) => u.name.startsWith("Klimmzüge"))!;
    expect(ue.wdh).toBeUndefined();
    expect(ue.notiz).toMatch(/vor dem Versagen/);
  });

  it("klimmzugMaxAusSaetzen: nur Klimmzüge ohne Zusatzgewicht, plausible Werte", () => {
    expect(
      klimmzugMaxAusSaetzen([
        { uebungName: "PULL_UP", wdh: 7, gewichtKg: null },
        { uebungName: "PULL_UP", wdh: 9, gewichtKg: 0 },
        { uebungName: "WEIGHTED_PULL_UP", wdh: 12, gewichtKg: 10 },
        { uebungName: "CHIN_UP", wdh: 55, gewichtKg: null },
        { uebungName: "BENCH_PRESS", wdh: 15, gewichtKg: null },
      ])
    ).toBe(9);
    expect(klimmzugMaxAusSaetzen([])).toBeNull();
  });
});
