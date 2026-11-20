import { describe, expect, it } from "vitest";
import {
  bereitschaft,
  bodyBatteryStufe,
  hrvStufe,
  readinessStufe,
  stressStufe,
  trend,
  type TagesGesundheit,
} from "../gesundheit";

const tag = (datum: string, x: Partial<TagesGesundheit> = {}): TagesGesundheit => ({
  datum,
  readiness: null,
  bodyBatteryMax: null,
  bodyBatteryMin: null,
  ruhepuls: null,
  hrv: null,
  hrvStatus: null,
  stress: null,
  schlafScore: null,
  ...x,
});

describe("Einstufungen nach Garmin-Bereichen", () => {
  it("Training Readiness", () => {
    expect([96, 80, 60, 30, 10].map((v) => readinessStufe(v)?.label)).toEqual([
      "Optimal",
      "Hoch",
      "Moderat",
      "Niedrig",
      "Sehr niedrig",
    ]);
    expect(readinessStufe(null)).toBeNull();
  });
  it("Body Battery und Stress", () => {
    expect([90, 60, 40, 10].map((v) => bodyBatteryStufe(v)?.label)).toEqual(["Hoch", "Mittel", "Niedrig", "Sehr niedrig"]);
    expect([20, 40, 60, 80].map((v) => stressStufe(v)?.label)).toEqual(["Ruhe", "Niedrig", "Mittel", "Hoch"]);
  });
  it("HRV-Status", () => {
    expect(hrvStufe("BALANCED")?.label).toBe("Ausgeglichen");
    expect(hrvStufe("unbalanced")?.ton).toBe("mittel");
    expect(hrvStufe("NEW_STATUS")).toEqual({ label: "new_status", ton: "neutral" });
    expect(hrvStufe(null)).toBeNull();
  });
});

describe("trend", () => {
  const verlauf = [
    tag("2026-12-01", { ruhepuls: 50 }),
    tag("2026-12-04", { ruhepuls: 48 }),
    tag("2026-12-06", { ruhepuls: 49 }),
    tag("2026-12-07", { ruhepuls: 47 }),
    tag("2026-12-08", { ruhepuls: 52 }),
  ];
  it("heute gegen das Mittel der sieben Vortage", () => {
    // Vortage 50, 48, 49, 47 → Ø 48.5 (angezeigt 49); Differenz aus dem exakten Mittel: 3.5 → 4
    expect(trend(verlauf, "2026-12-08", "ruhepuls")).toEqual({ wert: 52, mittel7: 49, diff: 4 });
  });
  it("ohne heutigen Wert oder mit zu wenigen Vortagen → null", () => {
    expect(trend(verlauf, "2026-12-09", "ruhepuls").wert).toBeNull();
    expect(trend(verlauf.slice(-2), "2026-12-08", "ruhepuls")).toEqual({ wert: 52, mittel7: null, diff: null });
  });
});

describe("bereitschaft", () => {
  it("grün, gelb, rot und ohne Daten", () => {
    expect(bereitschaft({ readiness: 80, bodyBatteryMax: 85, hrvStatus: "BALANCED", schlafScore: 82 }).ampel).toBe("gruen");
    expect(bereitschaft({ readiness: 50, bodyBatteryMax: 60, hrvStatus: "BALANCED", schlafScore: 80 }).ampel).toBe("gelb");
    expect(bereitschaft({ readiness: 20, bodyBatteryMax: 30, hrvStatus: null, schlafScore: null }).ampel).toBe("rot");
    expect(bereitschaft({ readiness: null, bodyBatteryMax: null, hrvStatus: null, schlafScore: null })).toMatchObject({ ampel: null });
  });
});
