import type { Map as MapLibreMap } from "maplibre-gl";

/** Gemeinsame MapLibre-Basis: OpenFreeMap Liberty + AWS Terrarium-DEM */

export const BASEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

export const TERRARIUM_TILES =
  "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";

export const TERRAIN_EXAGGERATION = 1.4;

/* ------------------------------------------------------------------ */
/* Kartentypen                                                         */
/* ------------------------------------------------------------------ */

export type KartenTyp = "karte" | "satellit" | "topo";

export interface RasterBasemap {
  id: Exclude<KartenTyp, "karte">;
  label: string;
  tiles: string[];
  attribution: string;
  maxzoom: number;
  /** Bild bringt eigene Schattierung mit → Hillshade stört nur */
  ohneHillshade: boolean;
}

/**
 * Zusatz-Basemaps als Raster-Kacheln, beide ohne API-Key.
 * Swisstopo deckt nur die Schweiz ab; ausserhalb bleiben die Kacheln leer
 * und die Vektorkarte darunter scheint durch — als Fallback gewollt.
 */
export const RASTER_BASEMAPS: RasterBasemap[] = [
  {
    id: "satellit",
    label: "Satellit",
    tiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    ],
    attribution: "Esri · Maxar · Earthstar Geographics",
    maxzoom: 19,
    ohneHillshade: true,
  },
  {
    id: "topo",
    label: "Topo CH",
    tiles: [
      "https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg",
    ],
    attribution: "© swisstopo",
    maxzoom: 18,
    ohneHillshade: true,
  },
];

export const KARTEN_TYPEN: { id: KartenTyp; label: string }[] = [
  { id: "karte", label: "Karte" },
  ...RASTER_BASEMAPS.map((b) => ({ id: b.id as KartenTyp, label: b.label })),
];

const basemapLayerId = (id: string) => `ghq-basemap-${id}`;

/**
 * Legt die Raster-Basemaps als unsichtbare Layer an — unterhalb der
 * Beschriftungen der Vektorkarte, damit Orts- und Strassennamen auch über
 * dem Satellitenbild lesbar bleiben. Danach kostet ein Kartenwechsel nur
 * noch das Umschalten der Sichtbarkeit; Terrain, Route und Läuferpunkt
 * bleiben unangetastet (ein `setStyle` würde sie alle verwerfen).
 */
export function fuegeRasterBasemapsHinzu(map: MapLibreMap) {
  const ersteBeschriftung = map
    .getStyle()
    .layers?.find((l) => l.type === "symbol")?.id;

  for (const b of RASTER_BASEMAPS) {
    const id = basemapLayerId(b.id);
    if (!map.getSource(id)) {
      map.addSource(id, {
        type: "raster",
        tiles: b.tiles,
        tileSize: 256,
        maxzoom: b.maxzoom,
        attribution: b.attribution,
      });
    }
    if (!map.getLayer(id)) {
      map.addLayer(
        {
          id,
          type: "raster",
          source: id,
          layout: { visibility: "none" },
          paint: { "raster-fade-duration": 200 },
        },
        ersteBeschriftung
      );
    }
  }
}

export function setzeKartenTyp(map: MapLibreMap, typ: KartenTyp) {
  for (const b of RASTER_BASEMAPS) {
    const id = basemapLayerId(b.id);
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, "visibility", b.id === typ ? "visible" : "none");
    }
  }
  const aktiv = RASTER_BASEMAPS.find((b) => b.id === typ);
  if (map.getLayer("ghq-hillshade")) {
    map.setLayoutProperty(
      "ghq-hillshade",
      "visibility",
      aktiv?.ohneHillshade ? "none" : "visible"
    );
  }
}

/** Kachel-Template des aktiven Kartentyps (für das Vorladen) */
export function rasterTemplate(typ: KartenTyp): string | null {
  return RASTER_BASEMAPS.find((b) => b.id === typ)?.tiles[0] ?? null;
}

/** Fügt Terrain-, Hillshade- und Sky-Setup zu einer geladenen Map hinzu */
export function aktiviere3D(map: MapLibreMap) {
  if (!map.getSource("terrain-dem")) {
    map.addSource("terrain-dem", {
      type: "raster-dem",
      encoding: "terrarium",
      tiles: [TERRARIUM_TILES],
      tileSize: 256,
      maxzoom: 15,
    });
  }
  if (!map.getSource("hillshade-dem")) {
    map.addSource("hillshade-dem", {
      type: "raster-dem",
      encoding: "terrarium",
      tiles: [TERRARIUM_TILES],
      tileSize: 256,
      maxzoom: 15,
    });
  }
  if (!map.getLayer("ghq-hillshade")) {
    map.addLayer({
      id: "ghq-hillshade",
      type: "hillshade",
      source: "hillshade-dem",
      paint: { "hillshade-exaggeration": 0.35 },
    });
  }
  map.setTerrain({ source: "terrain-dem", exaggeration: TERRAIN_EXAGGERATION });
  try {
    // Heller Tag-Himmel passend zur hellen Liberty-Basemap. Dunkle Werte
    // liessen bei geneigter Kamera Himmel und Fern-Nebel schwarz wirken —
    // in Bergrouten versank die halbe Szene darin.
    map.setSky({
      "sky-color": "#7fb4e0",
      "horizon-color": "#eaf2f7",
      "fog-color": "#e8eef2",
      "sky-horizon-blend": 0.5,
      "horizon-fog-blend": 0.5,
    });
  } catch {
    // Ältere maplibre-Versionen ohne setSky — rein kosmetisch
  }
}

export function deaktiviere3D(map: MapLibreMap) {
  map.setTerrain(null);
  if (map.getLayer("ghq-hillshade")) map.removeLayer("ghq-hillshade");
}
