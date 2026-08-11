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
  /** Zoom-Zuschlag des Kameraprofils (Wanderungen fliegen näher dran) */
  zoomBonus?: number;
  /** Kachel-Template des aktiven Raster-Kartentyps (Satellit/Topo) */
  rasterTemplate?: string | null;
}

function fuelleTemplate(template: string, t: TileCoord): string {
  return template
    .replace("{z}", String(t.z))
    .replace("{x}", String(t.x))
    .replace("{y}", String(t.y));
}

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

  const urls: string[] = [];

  if (raster) {
    // Raster-Basemap (256-px-Tiles) liegt eine Stufe über den Vektorzooms.
    // Sie deckt das Bild, deshalb hat sie beim Budget Vorrang.
    for (const t of routenTiles(punkte, [13, 14, 15].map((z) => z + bonus), 1)) {
      urls.push(fuelleTemplate(raster, t));
    }
  } else {
    // Vektor-Basemap (512-px-Tiles): Flyover-Zooms 13.7–15.2 → z12–z14
    const template = await vectorTileTemplate();
    if (template) {
      for (const t of routenTiles(punkte, [12, 13, 14].map((z) => z + bonus), 1)) {
        urls.push(fuelleTemplate(template, t));
      }
    }
  }

  // Terrain-DEM (256-px-Tiles): z13–z15, die Quelle endet bei z15
  for (const t of routenTiles(punkte, [13, 14, 15].map((z) => Math.min(15, z + bonus)), 1)) {
    urls.push(fuelleTemplate(TERRARIUM_TILES, t));
  }

  // Sicherheitsdeckel gegen Riesen-Routen (niedrige Zooms zuerst behalten)
  const liste = urls.slice(0, 600);
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
