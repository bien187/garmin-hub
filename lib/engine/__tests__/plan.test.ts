import { describe, expect, it } from "vitest";
import { generiereWochenplan, PlanInput } from "../plan";

const basis: PlanInput = {
  wochenstart: "2026-07-20",
  phaseNr: 1,
  restwochen: 17,
  wochenIndex: 0,
  vorwocheLaufMin: 180,
  tsb: 0,
  acwr: 1.0,
  muscleState: {},
  benchmarks: { klimmzuege: 7, rumpfSeitlichS: 70, rumpfDorsalS: 90 },
  readiness: 70,
  paces: null,
  zonen: {
    z2: { von: 137, bis: 152 },
    z4: { von: 168, bis: 183 },
    z5: { von: 183, bis: 197 },
  },
  letztesLastKg: 0,
};

describe("generiereWochenplan", () => {
  it("Phase 1: Intervalle, langer Lauf, 3× Rumpf, Klimmzüge", () => {
    const plan = generiereWochenplan(basis);
    const typen = plan.einheiten.map((e) => e.typ);
    expect(typen).toContain("intervalle");
    expect(typen).toContain("langer_lauf");
    expect(typen.filter((t) => t === "rumpf")).toHaveLength(3);
    expect(typen).toContain("klimmzuege");
  });

  it("Phase 2: Lastlauf mit +2 kg Progression, Hügel-Intervalle", () => {
    const plan = generiereWochenplan({ ...basis, phaseNr: 2, letztesLastKg: 8, wochenIndex: 5 });
    const lastlauf = plan.einheiten.find((e) => e.typ === "lastlauf");
    expect(lastlauf).toBeDefined();
    expect(lastlauf!.titel).toContain("10 kg");
    expect(plan.einheiten.some((e) => e.typ === "huegel_intervalle")).toBe(true);
  });

  it("Lastlauf-Gewicht ist bei 20 kg gedeckelt", () => {
    const plan = generiereWochenplan({ ...basis, phaseNr: 2, letztesLastKg: 20, wochenIndex: 8 });
    expect(plan.einheiten.find((e) => e.typ === "lastlauf")!.titel).toContain("20 kg");
  });

  it("TSB < −20 → Extra-Ruhetag, Qualitätseinheit gestrichen", () => {
    const plan = generiereWochenplan({ ...basis, tsb: -25 });
    expect(plan.einheiten.some((e) => e.typ === "intervalle")).toBe(false);
    expect(plan.hinweise.some((h) => h.includes("Extra-Ruhetag"))).toBe(true);
  });

  it("ACWR > 1.3 → Hinweis auf Deckelung", () => {
    const plan = generiereWochenplan({ ...basis, acwr: 1.45 });
    expect(plan.hinweise.some((h) => h.includes("ACWR"))).toBe(true);
  });

  it("jede 4. Woche Entlastung", () => {
    const plan = generiereWochenplan({ ...basis, wochenIndex: 3 });
    expect(plan.hinweise.some((h) => h.includes("Entlastungswoche"))).toBe(true);
  });

  it("erschöpfte Beine verschieben die harte Einheit", () => {
    const plan = generiereWochenplan({
      ...basis,
      muscleState: { quadrizeps: 75, waden: 40 },
    });
    const intervalle = plan.einheiten.find((e) => e.typ === "intervalle");
    expect(intervalle!.datum).toBe("2026-07-22"); // Mi statt Di
  });

  it("GtG nur bei frischem Oberkörper", () => {
    const frisch = generiereWochenplan(basis);
    expect(frisch.einheiten.some((e) => e.typ === "gtg")).toBe(true);
    const muede = generiereWochenplan({
      ...basis,
      muscleState: { bizeps: 55 },
    });
    expect(muede.einheiten.some((e) => e.typ === "gtg")).toBe(false);
  });

  it("Phase 3: Probe-EP in den richtigen Wochen", () => {
    const probeWoche = generiereWochenplan({ ...basis, phaseNr: 3, restwochen: 5 });
    expect(probeWoche.einheiten.some((e) => e.typ === "probe_ep")).toBe(true);
    const normaleWoche = generiereWochenplan({ ...basis, phaseNr: 3, restwochen: 4 });
    expect(normaleWoche.einheiten.some((e) => e.typ === "probe_ep")).toBe(false);
  });

  it("Klimmzug-Stolperkante wird erwähnt (7-8 Wdh)", () => {
    const plan = generiereWochenplan(basis); // klimmzuege: 7
    expect(plan.hinweise.some((h) => h.includes("Stolperkante"))).toBe(true);
  });

  it("Rumpf-Zielzeiten interpolieren Richtung EP-Ziel", () => {
    const frueh = generiereWochenplan(basis); // 17 Restwochen
    const spaet = generiereWochenplan({ ...basis, restwochen: 2 });
    const zielVon = (p: typeof frueh) => {
      const r = p.einheiten.find((e) => e.typ === "rumpf")!;
      return parseInt(r.titel.match(/\((\d+)s/)![1], 10);
    };
    expect(zielVon(spaet)).toBeGreaterThan(zielVon(frueh));
  });
});
