import { describe, expect, it } from "vitest";
import { routenTiles, tileXY, verduennen } from "../tile-prefetch";

describe("tileXY", () => {
  it("bekannte Referenz: Lenzburg auf z14", () => {
    // Lenzburg ≈ 8.1787 E, 47.3855 N
    const t = tileXY(8.1787, 47.3855, 14);
    expect(t.z).toBe(14);
    expect(t.x).toBe(8564); // floor((8.1787+180)/360 * 16384)
    expect(t.y).toBe(5736);
  });

  it("Weltecken bleiben im gültigen Bereich", () => {
    expect(tileXY(-180, 85.05, 3).x).toBe(0);
    expect(tileXY(179.99, -85.05, 3).y).toBeLessThanOrEqual(7);
  });
});

describe("routenTiles", () => {
  it("dedupliziert und liefert Nachbarring", () => {
    const punkt = [{ lng: 8.1787, lat: 47.3855 }];
    const tiles = routenTiles(punkt, [14], 1);
    // 1 Tile + 8er-Ring = 9, keine Duplikate
    expect(tiles).toHaveLength(9);
    const keys = new Set(tiles.map((t) => `${t.z}/${t.x}/${t.y}`));
    expect(keys.size).toBe(9);
  });

  it("nahe Punkte erzeugen keine zusätzlichen Tiles", () => {
    const punkte = [
      { lng: 8.1787, lat: 47.3855 },
      { lng: 8.1788, lat: 47.3856 },
    ];
    expect(routenTiles(punkte, [14], 0)).toHaveLength(1);
  });

  it("mehrere Zoomstufen werden kombiniert", () => {
    const punkt = [{ lng: 8.1787, lat: 47.3855 }];
    const tiles = routenTiles(punkt, [13, 14], 0);
    expect(tiles.map((t) => t.z)).toEqual([13, 14]);
  });
});

describe("verduennen", () => {
  it("reduziert dichte Punktfolgen, behält Start und Ende", () => {
    const punkte = Array.from({ length: 500 }, (_, i) => ({
      lng: 8.17 + i * 0.00001, // ~0.75 m Abstand
      lat: 47.38,
    }));
    const duenn = verduennen(punkte, 150);
    expect(duenn.length).toBeLessThan(10);
    expect(duenn[0]).toEqual(punkte[0]);
    expect(duenn[duenn.length - 1]).toEqual(punkte[punkte.length - 1]);
  });
});
