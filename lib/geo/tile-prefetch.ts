import { BASEMAP_STYLE, TERRARIUM_TILES } from "./map-style";

/**
 * Tile-Vorladen für den Flyover: Alle Basemap- und Terrain-Tiles entlang
 * der Route werden vor dem Start in den Browser-HTTP-Cache geholt, damit
 * die Kamera während des Flugs nie über ungeladene (schwarze) Flächen
 * fliegt. MapLibre bedient sich danach aus dem Cache.
 */

export interface TileCoord {
  z: number;
  x: number;
  y: number;
}

/** Web-Mercator-Tile-Koordinate für einen Punkt */
export function tileXY(lng: number, lat: number, z: number): TileCoord {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  return { z, x, y: Math.min(n - 1, Math.max(0, y)) };
}

/**
 * Deduplizierte Tile-Liste, die eine Punktfolge auf den gegebenen
 * Zoomstufen abdeckt — inkl. `ring` Nachbar-Tiles (die geneigte Kamera
 * sieht über den Routenkorridor hinaus).
 */
export function routenTiles(
  punkte: { lng: number; lat: number }[],
  zooms: number[],
  ring = 1
): TileCoord[] {
  const gesehen = new Set<string>();
  const out: TileCoord[] = [];
  for (const z of [...zooms].sort((a, b) => a - b)) {
    const n = 2 ** z;
    for (const p of punkte) {
      const t = tileXY(p.lng, p.lat, z);
      for (let dx = -ring; dx <= ring; dx++) {
        for (let dy = -ring; dy <= ring; dy++) {
          const x = (t.x + dx + n) % n;
          const y = t.y + dy;
          if (y < 0 || y >= n) continue;
          const key = `${z}/${x}/${y}`;
          if (gesehen.has(key)) continue;
          gesehen.add(key);
          out.push({ z, x, y });
        }
      }
    }
  }
  return out;
}

/** Route auf ~alle `schrittM` Meter ausdünnen (grobe Mercator-Näherung) */
export function verduennen(
  punkte: { lng: number; lat: number }[],
  schrittM = 150
): { lng: number; lat: number }[] {
  if (punkte.length <= 2) return punkte;
  const out = [punkte[0]];
  let letzter = punkte[0];
  for (const p of punkte) {
    const dx = (p.lng - letzter.lng) * 111_320 * Math.cos((p.lat * Math.PI) / 180);
    const dy = (p.lat - letzter.lat) * 110_540;
    if (Math.hypot(dx, dy) >= schrittM) {
      out.push(p);
      letzter = p;
    }
  }
  out.push(punkte[punkte.length - 1]);
  return out;
}

async function vectorTileTemplate(): Promise<string | null> {
  try {
    const style = await fetch(BASEMAP_STYLE, { cache: "force-cache" }).then((r) =>
      r.json()
    );
    for (const src of Object.values(
      (style.sources ?? {}) as Record<string, { type?: string; tiles?: string[]; url?: string }>
    )) {
      if (src.type !== "vector") continue;
      if (src.tiles?.[0]) return src.tiles[0];
      if (src.url) {
        const tilejson = await fetch(src.url, { cache: "force-cache" }).then((r) =>
          r.json()
        );
        return tilejson.tiles?.[0] ?? null;
      }
    }
  } catch {
    /* Prefetch ist Optimierung — Fehler nicht fatal */
  }
  return null;
}

export interface PrefetchOptionen {
  /** Zoom-Zuschlag des Kameraprofils (nur ohne `kameraZoom`, Altverhalten) */
  zoomBonus?: number;
  /**
   * Basis-Zoom der Verfolgerkamera. Damit landen genau die Kacheln im
   * Cache, die MapLibre im Flug anfragt — statt fester Stufen daneben.
   */
  kameraZoom?: number;
  /** Kachel-Template des aktiven Raster-Kartentyps (Satellit/Topo) */
  rasterTemplate?: string | null;
}

export interface PrefetchZooms {
  raster: number[];
  vektor: number[];
  dem: number[];
}

/**
 * Kachel-Zoomstufen, die MapLibre bei Kamera-Zoom `z` lädt:
 * - Raster mit 256-px-Kacheln: Stufe z+1 direkt unter der Kamera, z zum
 *   Horizont hin (geneigte Kamera, LOD).
 * - Vektor (512 px, OpenFreeMap endet bei z14): z−1 und z.
 * - Terrain-DEM (256 px, MapLibre lädt es eine Stufe gröber, Quelle endet
 *   bei z15): z−1 und z−2.
 */
export function prefetchZooms(kameraZoom: number): PrefetchZooms {
  const z = Math.round(kameraZoom);
  const band = (zs: number[], max: number) =>
    [...new Set(zs.map((x) => Math.max(0, Math.min(max, x))))];
  return {
    raster: band([z, z + 1], 19),
    vektor: band([z - 1, z], 14),
    dem: band([z - 2, z - 1], 15),
  };
}

function fuelleTemplate(template: string, t: TileCoord): string {
  return template
    .replace("{z}", String(t.z))
    .replace("{x}", String(t.x))
    .replace("{y}", String(t.y));
}

/** Kachel-Budget je Ebene — schützt vor Riesen-Routen (niedrige Zooms zuerst) */
const BUDGET_BILD = 420;
const BUDGET_DEM = 180;

/**
 * Lädt alle Route-Tiles in den HTTP-Cache. Liefert laufend Fortschritt
 * (0–100). Einzelne Fehlschläge werden ignoriert.
 */
export async function prefetchFlyoverTiles(
  route: { lng: number; lat: number }[],
  onProgress: (prozent: number) => void,
  opt: PrefetchOptionen = {}
): Promise<void> {
  const punkte = verduennen(route, 150);
  const bonus = Math.round(opt.zoomBonus ?? 0);
  const raster = opt.rasterTemplate ?? null;
  const zooms: PrefetchZooms =
    opt.kameraZoom != null
      ? prefetchZooms(opt.kameraZoom)
      : {
          raster: [13, 14, 15].map((z) => z + bonus),
          vektor: [12, 13, 14].map((z) => z + bonus),
          dem: [13, 14, 15].map((z) => Math.min(15, z + bonus)),
        };

  const bild: string[] = [];
  if (raster) {
    // Raster-Basemap deckt das Bild, die Vektorkarte darunter bleibt aus
    for (const t of routenTiles(punkte, zooms.raster, 1)) {
      bild.push(fuelleTemplate(raster, t));
    }
  } else {
    const template = await vectorTileTemplate();
    if (template) {
      for (const t of routenTiles(punkte, zooms.vektor, 1)) {
        bild.push(fuelleTemplate(template, t));
      }
    }
  }

  const dem = routenTiles(punkte, zooms.dem, 1).map((t) =>
    fuelleTemplate(TERRARIUM_TILES, t)
  );

  const liste = [...bild.slice(0, BUDGET_BILD), ...dem.slice(0, BUDGET_DEM)];
  if (liste.length === 0) {
    onProgress(100);
    return;
  }

  let fertig = 0;
  const parallel = 8;
  const naechste = liste.values();
  const arbeiter = Array.from({ length: parallel }, async () => {
    for (const url of naechste) {
      try {
        await fetch(url, { cache: "force-cache", mode: "cors" });
      } catch {
        /* einzelner Tile-Fehler egal */
      }
      fertig++;
      onProgress(Math.round((fertig / liste.length) * 100));
    }
  });
  await Promise.all(arbeiter);
  onProgress(100);
}
