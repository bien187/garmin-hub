import type { Map as MapLibreMap } from "maplibre-gl";

/** Gemeinsame MapLibre-Basis: OpenFreeMap Liberty + AWS Terrarium-DEM */

export const BASEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

export const TERRARIUM_TILES =
  "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";

export const TERRAIN_EXAGGERATION = 1.4;

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
    map.setSky({
      "sky-color": "#0b1420",
      "horizon-color": "#20344a",
      "fog-color": "#141e2b",
      "sky-horizon-blend": 0.6,
      "horizon-fog-blend": 0.7,
    });
  } catch {
    // Ältere maplibre-Versionen ohne setSky — rein kosmetisch
  }
}

export function deaktiviere3D(map: MapLibreMap) {
  map.setTerrain(null);
  if (map.getLayer("ghq-hillshade")) map.removeLayer("ghq-hillshade");
}
