import { describe, expect, it } from "vitest";
import { minutenRaster, rasterReihe, stundenTicks } from "../schlaf-raster";

describe("Schlaf-Zeitraster", () => {
  it("Minutenraster über die ganze Bettzeit", () => {
    expect(minutenRaster(180)).toEqual([0, 60, 120, 180]);
  });
  it("2-Min-Reihe bleibt ein Segment, echte Lücke trennt", () => {
    const p: [number, number][] = [[0, 50], [120, 52], [240, 51], [1800, 48], [1920, 47]];
    const r = rasterReihe(p, 2000, 360);
    expect(r.segmente).toEqual(["s0", "s1"]);
    expect(r.zeilen).toHaveLength(34);
    expect(r.zeilen[2].s0).toBe(52);
    expect(r.zeilen[1].s0).toBeUndefined(); // kein erfundener Wert
    expect(r.zeilen[30].s1).toBe(48);
  });
  it("Punkte ausserhalb der Bettzeit (Bewegung ±1 h) werden abgeschnitten", () => {
    const r = rasterReihe([[-3600, 5], [60, 1], [99999, 3]], 600, 120);
    expect(r.zeilen.flatMap((z) => Object.values(z).slice(1))).toEqual([1]);
  });
  it("fehlende Reihe → leere Segmente, Raster bleibt gleich lang", () => {
    const r = rasterReihe(undefined, 600, 120);
    expect(r.segmente).toEqual([]);
    expect(r.zeilen).toHaveLength(11);
  });
  it("Stunden-Ticks auf volle Stunden", () => {
    const start = Date.UTC(2026, 10, 3, 21, 40, 17);
    const t = stundenTicks(start, 7 * 3600);
    expect(t[0]).toBe(19 * 60 + 43); // 22:00 UTC = 23:00 Zürich
    expect(t[1] - t[0]).toBe(3600);
  });
});
