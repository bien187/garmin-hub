/**
 * Gemeinsame Zeitachse der Schlaf-Detailcharts: ein Minutenraster über die
 * Bettzeit (0 … Ende, Sekunden seit Schlafstart). Alle Charts bekommen gleich
 * viele Zeilen in gleicher Reihenfolge, damit der synchronisierte Hover
 * (Recharts syncId) überall dieselbe Uhrzeit zeigt.
 *
 * Echte Lücken (länger als `maxLueckeS`) werden nicht überbrückt: die Reihe
 * zerfällt in Segmente s0, s1, … — jedes Segment wird als eigene Linie mit
 * connectNulls gezeichnet. So entstehen weder erfundene Werte noch
 * Punktwolken bei 2-/3-/5-Minuten-Auflösung.
 */

export interface RasterZeile {
  t: number; // Sekunden seit Schlafstart (Vielfaches von 60)
  [segment: string]: number | null;
}

export function minutenRaster(endeS: number): number[] {
  const n = Math.max(1, Math.floor(endeS / 60));
  return Array.from({ length: n + 1 }, (_, i) => i * 60);
}

/**
 * Ordnet die Punkte dem Minutenraster zu (nächste Minute, nur innerhalb
 * 0 … endeS) und teilt sie bei Lücken > maxLueckeS in Segmente.
 */
export function rasterReihe(
  punkte: [number, number][] | undefined,
  endeS: number,
  maxLueckeS: number
): { zeilen: RasterZeile[]; segmente: string[] } {
  const raster = minutenRaster(endeS);
  const zeilen: RasterZeile[] = raster.map((t) => ({ t }));
  if (!punkte || punkte.length === 0) return { zeilen, segmente: [] };
  const innen = punkte.filter(([t]) => t >= 0 && t <= endeS).sort((a, b) => a[0] - b[0]);
  let seg = -1;
  let letzteT = -Infinity;
  for (const [t, v] of innen) {
    if (t - letzteT > maxLueckeS) seg++;
    letzteT = t;
    const i = Math.min(zeilen.length - 1, Math.round(t / 60));
    zeilen[i][`s${seg}`] = v;
  }
  return { zeilen, segmente: Array.from({ length: seg + 1 }, (_, i) => `s${i}`) };
}

/** Volle Stunden (Europe/Zurich) zwischen Start und Ende als Sekunden-Offsets */
export function stundenTicks(startMs: number, endeS: number): number[] {
  const out: number[] = [];
  const ersteVolle = Math.ceil(startMs / 3_600_000) * 3_600_000; // Zürich hat volle Stunden-Offsets
  for (let ms = ersteVolle; (ms - startMs) / 1000 <= endeS; ms += 3_600_000) out.push(Math.round((ms - startMs) / 1000));
  return out;
}
