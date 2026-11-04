import { describe, expect, it } from "vitest";
import { laufIntensitaet, passtZurRegel, taperRegelFuerTag } from "../taper";
import { standardSyncToGarmin } from "@/lib/server/plan-sync";

describe("taperRegelFuerTag", () => {
  it("vor dem Taper (04.11.) gibt es keine Regel", () => {
    expect(taperRegelFuerTag("2026-11-04")).toBeNull();
    expect(taperRegelFuerTag("2026-10-01")).toBeNull();
  });

  it("05.11.: Umfang −40 %, keine Probe-EP, kein Lastlauf, max. 45 Min", () => {
    const r = taperRegelFuerTag("2026-11-05")!;
    expect(r.umfangFaktor).toBe(0.6);
    expect(r.maxDauerMin).toBe(45);
    expect(r.erlaubt).not.toContain("probe_ep");
    expect(r.erlaubt).not.toContain("lastlauf");
    expect(r.erlaubt).not.toContain("langer_lauf");
    expect(r.begruendung.length).toBeGreaterThan(20);
  });

  it("07.11. ist die letzte Intensität, 08.11. nur noch Z2", () => {
    expect(taperRegelFuerTag("2026-11-07")!.maxIntensitaet).toBe("z5");
    expect(taperRegelFuerTag("2026-11-08")!.maxIntensitaet).toBe("z2");
    expect(taperRegelFuerTag("2026-11-08")!.erlaubt).not.toContain("intervalle");
  });

  it("09.11.: letzte schwere Beineinheit (Kraft), kein Lauf, kein Lastlauf", () => {
    const r = taperRegelFuerTag("2026-11-09")!;
    expect(r.erlaubt).toContain("kraft");
    expect(r.erlaubt).not.toContain("lastlauf");
    expect(r.maxDauerMin).toBe(0);
    expect(r.keineBeinkraft).toBe(false);
    // ab dem 10.11. keine Beinkraft mehr
    expect(taperRegelFuerTag("2026-11-10")!.keineBeinkraft).toBe(true);
  });

  it("10.11.: max. Z4, 11.–15.11.: nur Z2 ≤ 30 Min, Rumpf nur am 12.11.", () => {
    expect(taperRegelFuerTag("2026-11-10")!.maxIntensitaet).toBe("z4");
    for (const d of ["2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"]) {
      const r = taperRegelFuerTag(d)!;
      expect(r.maxIntensitaet).toBe("z2");
      expect(r.maxDauerMin).toBe(30);
      expect(r.nurSubmaximal).toBe(true);
      expect(r.erlaubt).not.toContain("kraft");
      expect(r.erlaubt.includes("rumpf")).toBe(d === "2026-11-12");
    }
  });

  it("17.11.: frei oder max. 20 Min locker", () => {
    const r = taperRegelFuerTag("2026-11-17")!;
    expect(r.maxIntensitaet).toBe("locker");
    expect(r.maxDauerMin).toBe(20);
    expect(r.erlaubt).toEqual(["lauf_z2", "ruhe"]);
  });

  it("18.11. und 19.11.: nur der EP-Eintrag", () => {
    const t1 = taperRegelFuerTag("2026-11-18")!;
    expect(t1.erlaubt).toEqual(["ep"]);
    expect(t1.maxIntensitaet).toBe("keine");
    expect(t1.label).toBe("EP – Tag 1");
    expect(taperRegelFuerTag("2026-11-19")!.erlaubt).toEqual(["ep"]);
  });

  it("nach der EP: Regeneration bis 22.11., danach kein Plan", () => {
    expect(taperRegelFuerTag("2026-11-21")!.erlaubt).toEqual(["ruhe"]);
    expect(taperRegelFuerTag("2026-11-23")!.erlaubt).toEqual([]);
  });
});

describe("passtZurRegel", () => {
  it("Probe-EP am 07.11. verstösst gegen den Taper", () => {
    const p = passtZurRegel({ datum: "2026-11-07", typ: "probe_ep", titel: "Probe-EP: Alle 5 Disziplinen" });
    expect(p.ok).toBe(false);
    expect(p.grund).toContain("Probe-EP");
  });
  it("Rumpf und Z2 30 Min passen in Taper-Woche 1", () => {
    expect(passtZurRegel({ datum: "2026-11-05", typ: "rumpf", titel: "Rumpf im Sekundentakt (78s/120s)" }).ok).toBe(true);
    expect(passtZurRegel({ datum: "2026-11-06", typ: "lauf_z2", titel: "Z2-Lauf 30 Min" }).ok).toBe(true);
  });
  it("Z2 35 Min am 11.11. ist zu lang, Klimmzüge schwer am 12.11. zu hart", () => {
    expect(passtZurRegel({ datum: "2026-11-11", typ: "lauf_z2", titel: "Z2-Lauf 35 Min" }).ok).toBe(false);
    expect(
      passtZurRegel({ datum: "2026-11-12", typ: "klimmzuege", titel: "Gym: Rücken/Bizeps + Klimmzüge schwer" }).ok
    ).toBe(false);
  });
  it("Z5-Spitzen am 10.11. zu intensiv, Zieltempo-Lauf Z4 passt", () => {
    expect(passtZurRegel({ datum: "2026-11-10", typ: "intervalle", titel: "Taper: Kurze Spitzen" }).ok).toBe(false);
    expect(
      passtZurRegel({ datum: "2026-11-10", typ: "intervalle", titel: "Zieltempo-Lauf 38 Min (3×5 Min Z4)" }).ok
    ).toBe(true);
    expect(laufIntensitaet({ typ: "intervalle", titel: "Zieltempo-Lauf (Z4)" })).toBe("z4");
  });
  it("am EP-Tag passt nur der EP-Eintrag", () => {
    expect(passtZurRegel({ datum: "2026-11-18", typ: "lauf_z2", titel: "Z2-Lauf 35 Min" }).ok).toBe(false);
    expect(passtZurRegel({ datum: "2026-11-18", typ: "ep", titel: "EP – Tag 1" }).ok).toBe(true);
  });
  it("vor dem Taper passt alles", () => {
    expect(passtZurRegel({ datum: "2026-11-01", typ: "probe_ep", titel: "Probe-EP" }).ok).toBe(true);
  });
});

describe("standardSyncToGarmin", () => {
  it("EP-Einträge gehen nie an die Uhr", () => {
    expect(standardSyncToGarmin("ep")).toBe(false);
    expect(standardSyncToGarmin("lauf_z2")).toBe(true);
    expect(standardSyncToGarmin("kraft")).toBe(false);
  });
});
