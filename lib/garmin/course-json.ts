/**
 * Baut das JSON für POST /course-service/course (inoffiziell) aus einer
 * GeoJSON-LineString mit [lng, lat, ele]-Koordinaten.
 */

export interface CourseGeojson {
  type: "Feature";
  geometry: { type: "LineString"; coordinates: [number, number, number?][] };
  properties?: Record<string, unknown>;
}

export function baueGarminCourseJson(
  name: string,
  geojson: CourseGeojson,
  distanzM: number,
  hmAuf: number,
  hmAb: number
): object {
  const coords = geojson.geometry.coordinates;
  const geoPoints = coords.map(([lng, lat, ele]) => ({
    latitude: lat,
    longitude: lng,
    elevation: ele ?? null,
  }));
  return {
    courseName: name,
    description: "Erstellt mit Grenadier HQ",
    coordinateSystem: "WGS84",
    distanceMeter: Math.round(distanzM),
    elevationGainMeter: Math.round(hmAuf),
    elevationLossMeter: Math.round(hmAb),
    activityType: { typeId: 1, typeKey: "running" },
    sourceTypeId: 3,
    geoPoints,
  };
}
