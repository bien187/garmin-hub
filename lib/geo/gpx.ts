/** GeoJSON-LineString → GPX 1.1 (Fallback-Export für den manuellen Import) */

export function geojsonZuGpx(
  name: string,
  coordinates: [number, number, number?][]
): string {
  const punkte = coordinates
    .map(([lng, lat, ele]) => {
      const eleTag = ele != null ? `<ele>${ele.toFixed(1)}</ele>` : "";
      return `      <trkpt lat="${lat.toFixed(6)}" lon="${lng.toFixed(6)}">${eleTag}</trkpt>`;
    })
    .join("\n");
  const sicher = name.replace(/[<>&"]/g, "");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Garmin Hub" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${sicher}</name></metadata>
  <trk>
    <name>${sicher}</name>
    <trkseg>
${punkte}
    </trkseg>
  </trk>
</gpx>
`;
}
