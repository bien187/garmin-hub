import { describe, expect, it } from "vitest";
import { erzwingeTaperGrenzen, generiereWochenplan, PlanEinheit, PlanInput } from "../plan";
import { minutenAusTitel, passtZurRegel } from "../taper";
import { planeVerfuegbarkeit } from "../verfuegbarkeit";

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

describe("Taper ab 05.11. und EP-Einträge", () => {
  // Woche 02.–08.11. wird (Montag in Phase 3, 3 Restwochen) als Probe-EP-Woche
  // generiert — der Taper muss das ab Donnerstag überstimmen.
  const woche = (wochenstart: string, phaseNr: 3 | 4, restwochen: number) =>
    generiereWochenplan({ ...basis, wochenstart, phaseNr, restwochen, wochenIndex: 16 });
  const w1 = woche("2026-11-02", 3, 3);
  const w2 = woche("2026-11-09", 4, 2);
  const w3 = woche("2026-11-16", 4, 1);
  const w4 = woche("2026-11-23", 4, 0);
  const abTaper = [...w1.einheiten, ...w2.einheiten, ...w3.einheiten].filter((e) => e.datum >= "2026-11-05");

  it("ohne Taper wäre am 07.11. eine Probe-EP — mit Taper nicht mehr", () => {
    const ohneTaper = generiereWochenplan({ ...basis, wochenstart: "2026-10-19", phaseNr: 3, restwochen: 5 });
    expect(ohneTaper.einheiten.some((e) => e.typ === "probe_ep")).toBe(true);
    expect(w1.einheiten.find((e) => e.datum === "2026-11-07" && e.typ === "intervalle")?.titel).toContain(
      "Letzte Intensität"
    );
  });

  it("keine Probe-EP, kein Lastlauf, kein langer Lauf ab 05.11.", () => {
    expect(abTaper.some((e) => ["probe_ep", "lastlauf", "langer_lauf"].includes(e.typ))).toBe(false);
  });

  it("Tage vor dem Taper bleiben unverändert", () => {
    const vorher = w1.einheiten.filter((e) => e.datum < "2026-11-05");
    expect(vorher.some((e) => e.titel === "EP-Tempo: 5×1 km")).toBe(true);
  });

  it("jede Einheit ab 05.11. passt zur Tagesregel", () => {
    for (const e of abTaper) expect(passtZurRegel(e).ok, `${e.datum} ${e.titel}`).toBe(true);
  });

  it("05.–08.11.: Läufe höchstens 45 Min, nur eine Intensität (Sa 07.11.)", () => {
    const laeufe = w1.einheiten.filter((e) => e.datum >= "2026-11-05" && e.struktur?.sport === "laufen");
    expect(laeufe.every((e) => (minutenAusTitel(e.titel) ?? 0) <= 45)).toBe(true);
    const hart = w1.einheiten.filter((e) => e.datum >= "2026-11-05" && e.typ === "intervalle");
    expect(hart.map((e) => e.datum)).toEqual(["2026-11-07"]);
  });

  it("09.11.: Ganzkörper mit Beinen, kein Lastlauf; 10.11.: max. 20 Min Z4", () => {
    const mo = w2.einheiten.filter((e) => e.datum === "2026-11-09");
    expect(mo.map((e) => e.typ)).toEqual(["kraft"]);
    expect(mo[0].titel).toContain("Beine");
    const di = w2.einheiten.filter((e) => e.datum === "2026-11-10");
    expect(di).toHaveLength(1);
    const z4S = (di[0].struktur!.schritte ?? [])
      .filter((s) => s.art === "wiederholung")
      .reduce((sum, s) => sum + (s.wiederholungen ?? 1) * (s.schritte?.find((x) => x.art === "intervall")?.dauerWert ?? 0), 0);
    expect(z4S).toBeLessThanOrEqual(20 * 60);
  });

  it("11.–15.11.: nur Z2 ≤ 30 Min, Rumpf am 12./13./14.11., keine Beinkraft", () => {
    const tage = w2.einheiten.filter((e) => e.datum >= "2026-11-11" && e.datum <= "2026-11-15");
    const laeufe = tage.filter((e) => e.struktur?.sport === "laufen");
    expect(laeufe.length).toBeGreaterThan(0);
    expect(laeufe.every((e) => e.typ === "lauf_z2" && (minutenAusTitel(e.titel) ?? 99) <= 30)).toBe(true);
    expect(tage.filter((e) => e.typ === "rumpf").map((e) => e.datum)).toEqual(["2026-11-12", "2026-11-13", "2026-11-14"]);
    expect(tage.some((e) => e.typ === "kraft")).toBe(false);
    expect(tage.some((e) => /schwer/i.test(e.titel))).toBe(false);
  });

  it("Woche 16.–22.11. enthält genau je einen EP-Eintrag am 18./19.11. und nichts sonst an diesen Tagen", () => {
    const ep = w3.einheiten.filter((e) => e.typ === "ep");
    expect(ep.map((e) => [e.datum, e.titel])).toEqual([
      ["2026-11-18", "EP – Tag 1"],
      ["2026-11-19", "EP – Tag 2"],
    ]);
    expect(w3.einheiten.filter((e) => e.datum === "2026-11-18" || e.datum === "2026-11-19")).toHaveLength(2);
    expect(ep.every((e) => e.struktur == null)).toBe(true);
  });

  it("16.11.: nur Liegestütze und Rumpf leicht, 17.11.: vollständige Erholung", () => {
    expect(w3.einheiten.filter((e) => e.datum === "2026-11-16").map((e) => e.typ)).toEqual(["liegestuetze", "rumpf"]);
    const di = w3.einheiten.filter((e) => e.datum === "2026-11-17");
    expect(di.map((e) => [e.typ, e.titel])).toEqual([["ruhe", "Vollständige Erholung"]]);
  });

  it("nach der EP: Regeneration bis 22.11., danach kein Plan", () => {
    expect(w3.einheiten.filter((e) => e.datum > "2026-11-19").every((e) => e.typ === "ruhe")).toBe(true);
    expect(w4.einheiten).toHaveLength(0);
    expect(w4.hinweise.some((h) => h.includes("Nach der EP"))).toBe(true);
  });

  describe("Liegestütz-/Rumpf-Fokus 13.–16.11.", () => {
    const am = (datum: string) => [...w2.einheiten, ...w3.einheiten].filter((e) => e.datum === datum);
    const vorgabe = (datum: string) => {
      const ls = am(datum).find((e) => e.typ === "liegestuetze")!;
      const rs = am(datum).find((e) => e.typ === "rumpf")!;
      const u = ls.struktur!.uebungen![0];
      const r = rs.struktur!.uebungen![0];
      return {
        liegestuetze: [u.saetze, u.wdh, ls.titel, ls.beschreibung, u.notiz],
        rumpf: [r.saetze, r.dauerS, rs.titel, rs.beschreibung, r.notiz, rs.struktur!.metronom],
      };
    };

    it("Fr 13.11.: Liegestütze 4×8 (90–120 s Pause), Rumpf seitlich 2×25 s pro Seite (90 s Pause)", () => {
      expect(am("2026-11-13").map((e) => e.typ)).toEqual(["liegestuetze", "rumpf"]);
      const v = vorgabe("2026-11-13");
      expect(v.liegestuetze.slice(0, 2)).toEqual([4, 8]);
      expect(v.liegestuetze[2]).toBe("EP-Liegestütze 4×8 · 90–120 s Pause");
      expect(v.liegestuetze[3]).toContain("4 Sätze à 8 Wiederholungen, 90–120 s Pause");
      expect(v.liegestuetze[3]).toContain("nicht bis zum Muskelversagen");
      expect(v.liegestuetze[4]).toContain("90–120 s Pause");
      expect(v.rumpf.slice(0, 2)).toEqual([2, 25]);
      expect(v.rumpf[2]).toBe("Rumpf seitlich 2×25 s pro Seite · 90 s Pause");
      expect(v.rumpf[3]).toContain("2 Sätze à 25 s pro Seite, 90 s Pause");
      expect(v.rumpf[5]).toBe(true);
    });

    it("Sa 14.11.: Liegestütze 5×6 und Rumpf 2×35 s (je 2 Min Pause), dazu Z2 25 Min flach", () => {
      expect(am("2026-11-14").map((e) => e.typ)).toEqual(["liegestuetze", "rumpf", "lauf_z2"]);
      const v = vorgabe("2026-11-14");
      expect(v.liegestuetze.slice(0, 2)).toEqual([5, 6]);
      expect(v.liegestuetze[3]).toContain("2 Min Pause");
      expect(v.liegestuetze[3]).toContain("nicht ans Limit");
      expect(v.rumpf.slice(0, 2)).toEqual([2, 35]);
      expect(v.rumpf[3]).toContain("2 Min Pause");
    });

    it("So 15.11.: Regeneration, keine Liegestütze und kein Rumpf", () => {
      const so = am("2026-11-15");
      expect(so.map((e) => e.typ)).toEqual(["ruhe"]);
      expect(so[0].beschreibung).toContain("Keine Liegestütze und keine seitliche Rumpfkraft");
    });

    it("Mo 16.11.: Liegestütze 3×5 (2 Min Pause), Rumpf 2×20 s (90 s Pause), danach keine Zusatzsätze", () => {
      const v = vorgabe("2026-11-16");
      expect(v.liegestuetze.slice(0, 2)).toEqual([3, 5]);
      expect(v.liegestuetze[3]).toContain("2 Min Pause");
      expect(v.liegestuetze[3]).toContain("keine zusätzlichen Sätze");
      expect(v.rumpf.slice(0, 2)).toEqual([2, 20]);
      expect(v.rumpf[3]).toContain("90 s Pause");
    });

    it("alle Fokus-Einheiten passen zur Tagesregel, keine ist ein Maximaltest", () => {
      const fokus = ["2026-11-13", "2026-11-14", "2026-11-16"].flatMap(am);
      expect(fokus.every((e) => passtZurRegel(e).ok)).toBe(true);
      expect(fokus.some((e) => /max/i.test(e.titel))).toBe(false);
    });

    it("Wochenhinweis zum Fokus in beiden betroffenen Wochen", () => {
      expect(w2.hinweise.some((h) => h.startsWith("Fokus Fr 13.–Mo 16.11."))).toBe(true);
      expect(w3.hinweise.some((h) => h.startsWith("Fokus Fr 13.–Mo 16.11."))).toBe(true);
      expect(w1.hinweise.some((h) => h.startsWith("Fokus"))).toBe(false);
    });
  });

  it("Taper-Wochen haben Taper-Hinweise statt Wochenskelett-Hinweisen", () => {
    expect(w2.hinweise.some((h) => h.startsWith("Taper ab"))).toBe(true);
    expect(w2.hinweise.some((h) => h.includes("Stolperkante"))).toBe(false);
    expect(w3.hinweise.some((h) => h.includes("EP am Mi 18.11."))).toBe(true);
  });

  it("verschobene Einheiten werden nach dem Verteilen erneut gekappt, EP-Tage nicht gesperrt", () => {
    // 10.11. gesperrt → Zieltempo-Lauf rutscht in die Z2-Tage und muss Z2 werden
    const verteilt = planeVerfuegbarkeit(w2, ["2026-11-10"], "2026-11-09");
    const fix = erzwingeTaperGrenzen(verteilt.einheiten, basis.zonen);
    for (const e of fix) expect(passtZurRegel(e).ok, `${e.datum} ${e.titel}`).toBe(true);
    const eineProTag = (es: PlanEinheit[]) => {
      const laeufe = es.filter((e) => e.struktur?.sport === "laufen");
      return new Set(laeufe.map((e) => e.datum)).size === laeufe.length;
    };
    expect(eineProTag(fix)).toBe(true);

    const epGesperrt = planeVerfuegbarkeit(w3, ["2026-11-18"], "2026-11-16");
    expect(epGesperrt.einheiten.filter((e) => e.datum === "2026-11-18").map((e) => e.typ)).toEqual(["ep"]);
  });

  it("erzwingeTaperGrenzen ist idempotent und lässt Tage vor dem Taper in Ruhe", () => {
    const einmal = erzwingeTaperGrenzen(w1.einheiten, basis.zonen);
    expect(erzwingeTaperGrenzen(einmal, basis.zonen)).toEqual(einmal);
    expect(einmal.filter((e) => e.datum < "2026-11-05")).toEqual(w1.einheiten.filter((e) => e.datum < "2026-11-05"));
  });
});
