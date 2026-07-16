/**
 * Google Encoded Polyline Algorithm (Präzision 5) — encode/decode
 * ohne externe Abhängigkeit.
 */

export function encodePolyline(punkte: [number, number][]): string {
  // punkte: [lat, lng]
  let out = "";
  let prevLat = 0;
  let prevLng = 0;
  for (const [lat, lng] of punkte) {
    const iLat = Math.round(lat * 1e5);
    const iLng = Math.round(lng * 1e5);
    out += encodeWert(iLat - prevLat) + encodeWert(iLng - prevLng);
    prevLat = iLat;
    prevLng = iLng;
  }
  return out;
}

function encodeWert(v: number): string {
  let value = v < 0 ? ~(v << 1) : v << 1;
  let out = "";
  while (value >= 0x20) {
    out += String.fromCharCode((0x20 | (value & 0x1f)) + 63);
    value >>= 5;
  }
  out += String.fromCharCode(value + 63);
  return out;
}

export function decodePolyline(encoded: string): [number, number][] {
  const punkte: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let b: number;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    punkte.push([lat / 1e5, lng / 1e5]);
  }
  return punkte;
}
