import { describe, expect, it } from "vitest";
import {
  erschoepfungFarbe,
  lastenAusKraft,
  lastenAusLauf,
  lastenAusTemplate,
  mappeUebung,
  MUSKEL_TEMPLATES,
  restErschoepfung,
  stundenBisBelastbar,
} from "../muscle";

const H = 3_600_000;

describe("mappeUebung", () => {
  it("kennt Standard-Keys", () => {
    expect(mappeUebung("BENCH_PRESS").haupt).toContain("brust");
    expect(mappeUebung("PULL_UP").haupt).toContain("oberer_ruecken_lat");
    expect(mappeUebung("CALF_RAISE").haupt).toContain("waden");
  });

  it("fällt auf Substring-Heuristik zurück", () => {
    expect(mappeUebung("BARBELL_BACK_SQUAT").haupt).toContain("quadrizeps");
    expect(mappeUebung("SEATED_CABLE_ROW").haupt).toContain("oberer_ruecken_lat");
  });

  it("unbekannt → kleine Restlast", () => {
    const m = mappeUebung("VOELLIG_UNBEKANNT_XYZ");
    expect(m.haupt).toHaveLength(0);
    expect(m.neben.length).toBeGreaterThan(0);
  });
});

describe("lastenAusKraft", () => {
  it("Hauptmuskel 1.0, Nebenmuskel 0.4", () => {
    const lasten = lastenAusKraft(
      [{ uebungKey: "BENCH_PRESS", saetze: 5, wdh: 8, gewichtKg: 80 }],
      88
    );
    expect(lasten.brust).toBeGreaterThan(0);
    expect(lasten.trizeps).toBeCloseTo((lasten.brust as number) * 0.4, 5);
  });

  it("Körpergewichtsübungen bekommen effektive Last", () => {
    const lasten = lastenAusKraft(
      [{ uebungKey: "PULL_UP", saetze: 5, wdh: 6, gewichtKg: null }],
      88
    );
    expect(lasten.oberer_ruecken_lat).toBeGreaterThan(10);
  });
});

describe("lastenAusLauf", () => {
  it("flacher Lauf: Waden am stärksten", () => {
    const l = lastenAusLauf({ trimp: 80, hmAuf: 10, hmAb: 10, distanzM: 10000, istLastlauf: false });
    expect(l.waden).toBeGreaterThan(l.quadrizeps as number);
  });

  it("bergab verschiebt Richtung Quadrizeps (exzentrisch)", () => {
    const flach = lastenAusLauf({ trimp: 80, hmAuf: 0, hmAb: 0, distanzM: 10000, istLastlauf: false });
    const bergab = lastenAusLauf({ trimp: 80, hmAuf: 0, hmAb: 500, distanzM: 10000, istLastlauf: false });
    expect(bergab.quadrizeps as number).toBeGreaterThan(flach.quadrizeps as number);
  });

  it("Lastlauf belastet zusätzlich Trapez/Rumpf", () => {
    const normal = lastenAusLauf({ trimp: 80, hmAuf: 0, hmAb: 0, distanzM: 5000, istLastlauf: false });
    const last = lastenAusLauf({ trimp: 80, hmAuf: 0, hmAb: 0, distanzM: 5000, istLastlauf: true });
    expect(normal.nacken_trapez ?? 0).toBe(0);
    expect(last.nacken_trapez as number).toBeGreaterThan(0);
    expect(last.seitlicher_rumpf as number).toBeGreaterThan(0);
  });
});

describe("restErschoepfung", () => {
  it("baut exponentiell mit τ ab", () => {
    const jetzt = Date.now();
    const ereignisse = [{ zeitpunktMs: jetzt - 30 * H, lasten: { waden: 60 } }];
    const rest = restErschoepfung(ereignisse, jetzt);
    // Waden τ=30h → nach 30h genau 60/e
    expect(rest.waden).toBeCloseTo(60 / Math.E, 1);
  });

  it("sehr hohe Einzellast verlängert τ (×1.3)", () => {
    const jetzt = Date.now();
    const normal = restErschoepfung(
      [{ zeitpunktMs: jetzt - 48 * H, lasten: { quadrizeps: 60 } }],
      jetzt
    );
    const hoch = restErschoepfung(
      [{ zeitpunktMs: jetzt - 48 * H, lasten: { quadrizeps: 90 } }],
      jetzt
    );
    // 90er-Last hat τ 62.4h statt 48h → relativ weniger abgebaut
    expect(hoch.quadrizeps / 90).toBeGreaterThan(normal.quadrizeps / 60);
  });

  it("summiert mehrere Einheiten und klemmt auf 100", () => {
    const jetzt = Date.now();
    const rest = restErschoepfung(
      [
        { zeitpunktMs: jetzt - 1 * H, lasten: { waden: 80 } },
        { zeitpunktMs: jetzt - 2 * H, lasten: { waden: 80 } },
      ],
      jetzt
    );
    expect(rest.waden).toBe(100);
  });

  it("ignoriert zukünftige Ereignisse", () => {
    const jetzt = Date.now();
    const rest = restErschoepfung([{ zeitpunktMs: jetzt + 10 * H, lasten: { waden: 80 } }], jetzt);
    expect(rest.waden).toBe(0);
  });
});

describe("stundenBisBelastbar", () => {
  it("0 wenn bereits unter Ziel", () => {
    expect(stundenBisBelastbar(15, "waden")).toBe(0);
  });

  it("τ·ln(aktuell/ziel)", () => {
    expect(stundenBisBelastbar(40, "waden")).toBeCloseTo(30 * Math.log(2), 3);
  });
});

describe("lastenAusTemplate", () => {
  it("Push-Template belastet Brust am stärksten", () => {
    const l = lastenAusTemplate("oberkoerper_push", 60);
    expect(l.brust).toBeGreaterThan(l.trizeps ?? 0);
    expect(l.brust).toBeGreaterThan(0);
    expect(l.oberer_ruecken_lat ?? 0).toBe(0);
  });

  it("Beine-Template trifft Quadrizeps/Gesäss, nicht die Brust", () => {
    const l = lastenAusTemplate("beine", 60);
    expect(l.quadrizeps).toBeGreaterThan(0);
    expect(l.gesaess).toBeGreaterThan(0);
    expect(l.brust ?? 0).toBe(0);
  });

  it("skaliert mit Intensität (geklemmt) und deckelt bei 110", () => {
    const leicht = lastenAusTemplate("core", 20);
    const hart = lastenAusTemplate("core", 200);
    expect((hart.bauch ?? 0)).toBeGreaterThan(leicht.bauch ?? 0);
    for (const v of Object.values(hart)) expect(v).toBeLessThanOrEqual(110);
  });

  it("unbekanntes Template → leer", () => {
    expect(lastenAusTemplate("gibtsnicht", 60)).toEqual({});
  });

  it("alle Templates liefern mindestens eine Muskelgruppe", () => {
    for (const t of MUSKEL_TEMPLATES) {
      expect(Object.keys(lastenAusTemplate(t.id, 60)).length).toBeGreaterThan(0);
    }
  });
});

describe("erschoepfungFarbe", () => {
  it("liefert HSL-Verlauf grün → rot", () => {
    expect(erschoepfungFarbe(0)).toMatch(/^hsl\(145/);
    expect(erschoepfungFarbe(100)).toMatch(/^hsl\(12/);
  });
});
