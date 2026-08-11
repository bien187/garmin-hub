import { describe, expect, it } from "vitest";
import {
  aktiveZonen,
  sportKeyFuerTyp,
  zonenAusGarmin,
  zonenAusProfil,
  zonenMitte,
  type GarminZonenDaten,
} from "../hr-zonen";

const PROFIL = { ruhepuls: 46, hfMax: 197 };

function garminDaten(
  overrides: Partial<GarminZonenDaten["sportarten"][number]>[] = []
): GarminZonenDaten {
  const basis = {
    sport: "DEFAULT",
    zone1Floor: 100,
    zone2Floor: 120,
    zone3Floor: 140,
    zone4Floor: 160,
    zone5Floor: 180,
    maxHeartRateUsed: 195,
    restingHrUsed: 46,
    lactateThresholdHeartRate: null,
  };
  return {
    aktualisiert: "2026-08-11T05:00:00Z",
    sportarten: overrides.length
      ? overrides.map((o) => ({ ...basis, ...o }))
      : [basis],
  };
}

describe("sportKeyFuerTyp", () => {
  it("ordnet Garmin-Typen den Zonen-Sportarten zu", () => {
    expect(sportKeyFuerTyp("running")).toBe("RUNNING");
    expect(sportKeyFuerTyp("trail_running")).toBe("RUNNING");
    // Wandern läuft bei Garmin über die Laufzonen
    expect(sportKeyFuerTyp("hiking")).toBe("RUNNING");
    expect(sportKeyFuerTyp("cycling")).toBe("CYCLING");
    expect(sportKeyFuerTyp("strength_training")).toBe("DEFAULT");
    expect(sportKeyFuerTyp(null)).toBe("DEFAULT");
  });
});

describe("zonenAusGarmin", () => {
  it("baut lückenlose Grenzen aus den Zonen-Böden", () => {
    const z = zonenAusGarmin(garminDaten())!;
    expect(z.quelle).toBe("garmin");
    expect(z.z1).toEqual({ von: 100, bis: 119 });
    expect(z.z2).toEqual({ von: 120, bis: 139 });
    expect(z.z5).toEqual({ von: 180, bis: 195 });
    // keine Überlappung: jede Obergrenze liegt direkt unter dem nächsten Boden
    expect(z.z2.von).toBe(z.z1.bis + 1);
    expect(z.z4.von).toBe(z.z3.bis + 1);
  });

  it("bevorzugt die sportspezifischen Zonen", () => {
    const daten = garminDaten([
      { sport: "DEFAULT" },
      {
        sport: "RUNNING",
        zone1Floor: 110,
        zone2Floor: 133,
        zone3Floor: 151,
        zone4Floor: 168,
        zone5Floor: 182,
        maxHeartRateUsed: 197,
      },
    ]);
    expect(zonenAusGarmin(daten, "RUNNING")!.z2).toEqual({ von: 133, bis: 150 });
    expect(zonenAusGarmin(daten, "DEFAULT")!.z2).toEqual({ von: 120, bis: 139 });
    // Sport ohne eigene Zonen fällt auf DEFAULT zurück — wie auf der Uhr
    expect(zonenAusGarmin(daten, "SWIMMING")!.sport).toBe("DEFAULT");
  });

  it("verwirft unbrauchbare Antworten", () => {
    expect(zonenAusGarmin(null)).toBeNull();
    expect(zonenAusGarmin({ aktualisiert: "x", sportarten: [] })).toBeNull();
    // nicht aufsteigend → unbrauchbar
    expect(zonenAusGarmin(garminDaten([{ zone3Floor: 110 }]))).toBeNull();
    expect(zonenAusGarmin(garminDaten([{ zone2Floor: null }]))).toBeNull();
  });

  it("hält die HFmax plausibel, wenn Garmin keine liefert", () => {
    const z = zonenAusGarmin(garminDaten([{ maxHeartRateUsed: null }]))!;
    expect(z.hfMax).toBeGreaterThan(z.z5.von);
    expect(z.z5.bis).toBe(z.hfMax);
  });
});

describe("aktiveZonen", () => {
  it("nimmt Garmin, sobald Zonen da sind", () => {
    expect(aktiveZonen(PROFIL, garminDaten(), "running").quelle).toBe("garmin");
  });

  it("fällt ohne Garmin-Zonen auf Karvonen zurück", () => {
    const z = aktiveZonen(PROFIL, null, "running");
    expect(z.quelle).toBe("karvonen");
    expect(z).toMatchObject(zonenAusProfil(PROFIL));
  });
});

describe("zonenMitte", () => {
  it("liefert den Referenzpuls einer Zone", () => {
    expect(zonenMitte({ von: 133, bis: 150 })).toBe(142);
  });
});
