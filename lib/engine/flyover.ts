/**
 * Flyover-Timewarp-Engine (pure, headless testbar — keine Rendering-Deps).
 *
 * Kernprinzip (Strava-Premium-Äquivalent): Die Wiedergabe ist eine LINEARE
 * Zeittransformation. Das Flyover dauert immer FLYOVER_DAUER_S Sekunden;
 * mit k = T_real / T_video gilt t_real(t_video) = t_video · k. Da k
 * konstant ist, bleiben alle relativen Geschwindigkeitsunterschiede der
 * Originalaktivität exakt erhalten — ein Sprint bleibt sichtbar schneller.
 *
 * Explizit verboten (häufigster Implementierungsfehler): Bogenlängen-
 * Parametrisierung (konstantes Tempo) und Index-basierte Animation.
 */

export const FLYOVER_DAUER_S = 30;

export interface FlyoverStreamsInput {
  zeitS: number[];
  lat: (number | null)[];
  lng: (number | null)[];
  ele: (number | null)[];
  hr: (number | null)[];
  distanzM: (number | null)[];
}

export interface TrackPunkt {
  tRel: number; // Sekunden seit Start (bereinigt)
  lat: number;
  lng: number;
  ele: number;
  distCum: number; // Meter
  speed: number; // geglättet, m/s
  bearing: number; // ENTWICKELTER Winkel (unwrapped, kann <0 / >360 sein)
  hr: number | null;
}

export interface ProcessedTrack {
  punkte: TrackPunkt[];
  totalDistance: number;
  totalDuration: number;
  /** Geschwindigkeits-Perzentile für die Kamera-Kopplung */
  speedP10: number;
  speedP90: number;
  istBergig: boolean;
  /** true, wenn Pausen komprimiert wurden (UI-Transparenz) */
  pausenKomprimiert: boolean;
}

export interface SampledState {
  lat: number;
  lng: number;
  ele: number;
  speed: number;
  distCum: number;
  bearing: number; // 0..360
  hr: number | null;
  tRel: number;
}

export interface VerarbeitungsOptionen {
  /** Ausreisserfilter: max. plausible Geschwindigkeit m/s (Lauf 12) */
  vMax?: number;
  /** Glättungsfenster für speed in Sekunden */
  glaettungS?: number;
  pausen?: "keep" | "compress";
  pauseThresholdS?: number;
  maxPunkte?: number;
}

const ERDRADIUS_M = 6371008.8;

export function haversineM(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r;
  const dLng = (lng2 - lng1) * r;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLng / 2) ** 2;
  return 2 * ERDRADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function bearingGrad(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const r = Math.PI / 180;
  const y = Math.sin((lng2 - lng1) * r) * Math.cos(lat2 * r);
  const x =
    Math.cos(lat1 * r) * Math.sin(lat2 * r) -
    Math.sin(lat1 * r) * Math.cos(lat2 * r) * Math.cos((lng2 - lng1) * r);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Kürzeste Winkeldifferenz in [-180, 180] */
export function wrapDelta(grad: number): number {
  return ((grad + 540) % 360) - 180;
}

/**
 * Preprocessing-Pipeline (Reihenfolge laut Spez): sortieren/deduplizieren,
 * Ausreisser filtern, Distanz, Speed-Glättung (NUR speed — nie die
 * Zeitstempel!), Bearing-Unwrapping, Pausenbehandlung, Ausdünnung.
 */
export function verarbeiteStreams(
  s: FlyoverStreamsInput,
  opt: VerarbeitungsOptionen = {}
): ProcessedTrack | null {
  const vMax = opt.vMax ?? 12;
  const glaettungS = opt.glaettungS ?? 5;
  const pausen = opt.pausen ?? "keep";
  const pauseThresholdS = opt.pauseThresholdS ?? 20;
  const maxPunkte = opt.maxPunkte ?? 5000;

  /* 1. Gültige Punkte einsammeln, nach t sortiert, Duplikate raus */
  interface Roh {
    t: number;
    lat: number;
    lng: number;
    ele: number | null;
    hr: number | null;
  }
  const roh: Roh[] = [];
  const n = s.zeitS.length;
  for (let i = 0; i < n; i++) {
    const lat = s.lat[i];
    const lng = s.lng[i];
    const t = s.zeitS[i];
    if (lat == null || lng == null || !isFinite(t)) continue;
    if (Math.abs(lat) < 0.01 && Math.abs(lng) < 0.01) continue;
    roh.push({ t, lat, lng, ele: s.ele[i], hr: s.hr[i] });
  }
  roh.sort((a, b) => a.t - b.t);
  // Zeitsprünge rückwärts / Duplikate entfernen
  const sortiert: Roh[] = [];
  for (const p of roh) {
    if (sortiert.length === 0 || p.t > sortiert[sortiert.length - 1].t) {
      sortiert.push(p);
    }
  }
  if (sortiert.length < 2) return null;

  /* 2. Ausreisserfilter über Segmentgeschwindigkeit */
  const gefiltert: Roh[] = [sortiert[0]];
  for (let i = 1; i < sortiert.length; i++) {
    const a = gefiltert[gefiltert.length - 1];
    const b = sortiert[i];
    const dt = b.t - a.t;
    if (dt <= 0) continue;
    const v = haversineM(a.lat, a.lng, b.lat, b.lng) / dt;
    if (v > vMax) continue;
    gefiltert.push(b);
  }
  if (gefiltert.length < 2) return null;

  /* 3.+5. Distanz (3D wo Höhe da) + Höhenauffüllung (letzter bekannter Wert) */
  const t0 = gefiltert[0].t;
  let letzteEle = gefiltert.find((p) => p.ele != null)?.ele ?? 0;
  const basis = gefiltert.map((p) => {
    letzteEle = p.ele ?? letzteEle;
    return { tRel: p.t - t0, lat: p.lat, lng: p.lng, ele: letzteEle, hr: p.hr };
  });
  const distCum: number[] = [0];
  for (let i = 1; i < basis.length; i++) {
    const a = basis[i - 1];
    const b = basis[i];
    const dH = haversineM(a.lat, a.lng, b.lat, b.lng);
    const dEle = b.ele - a.ele;
    distCum.push(distCum[i - 1] + Math.sqrt(dH * dH + dEle * dEle));
  }

  /* 4. Momentangeschwindigkeit + gleitendes Zeitfenster (nur speed!) */
  const rohSpeed: number[] = basis.map((p, i) => {
    if (i === 0) return 0;
    const dt = p.tRel - basis[i - 1].tRel;
    return dt > 0 ? (distCum[i] - distCum[i - 1]) / dt : 0;
  });
  if (rohSpeed.length > 1) rohSpeed[0] = rohSpeed[1];
  const speed: number[] = basis.map((p, i) => {
    let summe = 0;
    let anz = 0;
    for (let j = i; j >= 0 && p.tRel - basis[j].tRel <= glaettungS / 2; j--) {
      summe += rohSpeed[j];
      anz++;
    }
    for (
      let j = i + 1;
      j < basis.length && basis[j].tRel - p.tRel <= glaettungS / 2;
      j++
    ) {
      summe += rohSpeed[j];
      anz++;
    }
    return anz > 0 ? summe / anz : rohSpeed[i];
  });

  /* 6. Bearing: erst entwickeln (unwrap über 0/360), dann glätten */
  const segBearing: number[] = basis.map((p, i) => {
    const j = Math.min(i + 1, basis.length - 1);
    const a = basis[Math.min(i, j - 1 < 0 ? 0 : j - 1)];
    const b = basis[j];
    if (a === b) return 0;
    return bearingGrad(a.lat, a.lng, b.lat, b.lng);
  });
  const entwickelt: number[] = [segBearing[0]];
  for (let i = 1; i < segBearing.length; i++) {
    entwickelt.push(entwickelt[i - 1] + wrapDelta(segBearing[i] - entwickelt[i - 1]));
  }
  // leichte Glättung im entwickelten Raum
  const bearing = entwickelt.map((_, i) => {
    let summe = 0;
    let anz = 0;
    for (let j = Math.max(0, i - 2); j <= Math.min(entwickelt.length - 1, i + 2); j++) {
      summe += entwickelt[j];
      anz++;
    }
    return summe / anz;
  });

  let punkte: TrackPunkt[] = basis.map((p, i) => ({
    tRel: p.tRel,
    lat: p.lat,
    lng: p.lng,
    ele: p.ele,
    distCum: distCum[i],
    speed: speed[i],
    bearing: bearing[i],
    hr: p.hr,
  }));

  /* 7. Pausenbehandlung */
  let pausenKomprimiert = false;
  if (pausen === "compress") {
    const neu: TrackPunkt[] = [punkte[0]];
    let offset = 0;
    let i = 1;
    while (i < punkte.length) {
      if (punkte[i].speed < 0.5) {
        // Pausenblock [i, j)
        let j = i;
        while (j < punkte.length && punkte[j].speed < 0.5) j++;
        const blockStart = punkte[i - 1].tRel;
        const blockEnde = punkte[Math.min(j, punkte.length - 1)].tRel;
        const dauer = blockEnde - blockStart;
        if (dauer > pauseThresholdS) {
          pausenKomprimiert = true;
          const faktor = pauseThresholdS / dauer;
          for (let m = i; m < j; m++) {
            neu.push({
              ...punkte[m],
              tRel: blockStart + (punkte[m].tRel - blockStart) * faktor - offset,
            });
          }
          offset += dauer - pauseThresholdS;
          i = j;
          continue;
        }
      }
      neu.push({ ...punkte[i], tRel: punkte[i].tRel - offset });
      i++;
    }
    punkte = neu;
  }

  /* 8. Zeitproportionale Ausdünnung auf maxPunkte (Sprint-Grenzen behalten) */
  if (punkte.length > maxPunkte) {
    const dauer = punkte[punkte.length - 1].tRel;
    const behalten = new Set<number>([0, punkte.length - 1]);
    // starke Geschwindigkeitsänderungen zwingend behalten
    for (let i = 1; i < punkte.length - 1; i++) {
      if (Math.abs(punkte[i + 1].speed - punkte[i - 1].speed) > 1.2) behalten.add(i);
    }
    const schritt = dauer / (maxPunkte - behalten.size);
    let naechsteZeit = 0;
    for (let i = 0; i < punkte.length; i++) {
      if (punkte[i].tRel >= naechsteZeit) {
        behalten.add(i);
        naechsteZeit = punkte[i].tRel + schritt;
      }
    }
    punkte = punkte.filter((_, i) => behalten.has(i));
  }

  const totalDuration = punkte[punkte.length - 1].tRel;
  const totalDistance = punkte[punkte.length - 1].distCum;
  if (totalDuration <= 0 || totalDistance <= 0) return null;

  /* Perzentile + Bergigkeit */
  const speedsSortiert = punkte.map((p) => p.speed).sort((a, b) => a - b);
  const perz = (f: number) =>
    speedsSortiert[Math.min(speedsSortiert.length - 1, Math.floor(f * speedsSortiert.length))];
  let auf = 0;
  for (let i = 1; i < punkte.length; i++) {
    const d = punkte[i].ele - punkte[i - 1].ele;
    if (d > 0) auf += d;
  }

  return {
    punkte,
    totalDistance,
    totalDuration,
    speedP10: perz(0.1),
    speedP90: Math.max(perz(0.9), perz(0.1) + 0.1),
    istBergig: auf / Math.max(0.3, totalDistance / 1000) > 40,
    pausenKomprimiert,
  };
}

/** Globaler Zeitraffungsfaktor k = T_real / T_video (konstant!) */
export function berechneK(track: ProcessedTrack, videoDauerS = FLYOVER_DAUER_S): number {
  return track.totalDuration / videoDauerS;
}

/** Sphärische lineare Interpolation zwischen zwei Koordinaten */
function slerp(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
  f: number
): { lat: number; lng: number } {
  const r = Math.PI / 180;
  const p1 = [
    Math.cos(lat1 * r) * Math.cos(lng1 * r),
    Math.cos(lat1 * r) * Math.sin(lng1 * r),
    Math.sin(lat1 * r),
  ];
  const p2 = [
    Math.cos(lat2 * r) * Math.cos(lng2 * r),
    Math.cos(lat2 * r) * Math.sin(lng2 * r),
    Math.sin(lat2 * r),
  ];
  const dot = Math.min(1, Math.max(-1, p1[0] * p2[0] + p1[1] * p2[1] + p1[2] * p2[2]));
  const omega = Math.acos(dot);
  if (omega < 1e-9) return { lat: lat1, lng: lng1 };
  const so = Math.sin(omega);
  const a = Math.sin((1 - f) * omega) / so;
  const b = Math.sin(f * omega) / so;
  const v = [
    a * p1[0] + b * p2[0],
    a * p1[1] + b * p2[1],
    a * p1[2] + b * p2[2],
  ];
  return {
    lat: Math.atan2(v[2], Math.hypot(v[0], v[1])) / r,
    lng: Math.atan2(v[1], v[0]) / r,
  };
}

/** Cursor für O(1)-Zugriff bei monoton fortschreitender Zeit */
export class SampleCursor {
  idx = 0;
}

/**
 * Zustand zur Realzeit tRealSec — binäre Suche (bzw. O(1) mit Cursor),
 * slerp für Position, linear für ele/speed/dist/hr, Bearing im
 * entwickelten Winkelraum (Rückgabe mod 360).
 */
export function sampleAt(
  track: ProcessedTrack,
  tRealSec: number,
  cursor?: SampleCursor
): SampledState {
  const pts = track.punkte;
  const t = Math.min(Math.max(0, tRealSec), track.totalDuration);

  let i: number;
  if (cursor && pts[cursor.idx]?.tRel <= t && (pts[cursor.idx + 1]?.tRel ?? Infinity) > t) {
    i = cursor.idx;
  } else if (
    cursor &&
    pts[cursor.idx + 1]?.tRel <= t &&
    (pts[cursor.idx + 2]?.tRel ?? Infinity) > t
  ) {
    i = cursor.idx + 1;
  } else {
    let lo = 0;
    let hi = pts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (pts[mid].tRel <= t) lo = mid;
      else hi = mid - 1;
    }
    i = lo;
  }
  if (cursor) cursor.idx = i;

  const a = pts[i];
  const b = pts[Math.min(i + 1, pts.length - 1)];
  const spanne = b.tRel - a.tRel;
  const f = spanne > 0 ? (t - a.tRel) / spanne : 0;

  const pos = slerp(a.lat, a.lng, b.lat, b.lng, f);
  const lerp = (x: number, y: number) => x + (y - x) * f;
  const hrA = a.hr;
  const hrB = b.hr;

  return {
    lat: pos.lat,
    lng: pos.lng,
    ele: lerp(a.ele, b.ele),
    speed: lerp(a.speed, b.speed),
    distCum: lerp(a.distCum, b.distCum),
    bearing: ((lerp(a.bearing, b.bearing) % 360) + 360) % 360,
    hr: hrA != null && hrB != null ? lerp(hrA, hrB) : (hrA ?? hrB),
    tRel: t,
  };
}

/**
 * Graph-Aufbereitung: Reihen gleichmässig über die ZEITachse auf
 * sampleCount Stützstellen bringen, mit Min-Max-Decimation (Extrema wie
 * Sprint-/HF-Spitzen bleiben erhalten).
 */
export interface GraphDaten {
  /** X in Realsekunden, aufsteigend */
  zeit: number[];
  ele: number[];
  speed: number[];
  hr: (number | null)[];
  eleMin: number;
  eleMax: number;
  speedMax: number;
  hrMin: number;
  hrMax: number;
  hatHr: boolean;
}

export function baueGraphDaten(track: ProcessedTrack, sampleCount = 400): GraphDaten {
  const buckets = Math.max(10, Math.floor(sampleCount / 2));
  const dauer = track.totalDuration;
  const zeit: number[] = [];
  const ele: number[] = [];
  const speed: number[] = [];
  const hr: (number | null)[] = [];
  const cursor = new SampleCursor();

  for (let bIdx = 0; bIdx < buckets; bIdx++) {
    const tA = (dauer * bIdx) / buckets;
    const tB = (dauer * (bIdx + 1)) / buckets;
    // Bucket dicht abtasten, Min+Max übernehmen (Min-Max-Decimation)
    let minS = Infinity;
    let maxS = -Infinity;
    let minE = Infinity;
    let maxE = -Infinity;
    let hrWert: number | null = null;
    const schritte = 6;
    for (let s = 0; s <= schritte; s++) {
      const st = sampleAt(track, tA + ((tB - tA) * s) / schritte, cursor);
      minS = Math.min(minS, st.speed);
      maxS = Math.max(maxS, st.speed);
      minE = Math.min(minE, st.ele);
      maxE = Math.max(maxE, st.ele);
      if (st.hr != null) hrWert = st.hr;
    }
    // zwei Stützstellen pro Bucket: erst Min, dann Max (Reihenfolge nach Zeit egal für Optik)
    zeit.push(tA, (tA + tB) / 2);
    speed.push(minS, maxS);
    ele.push(minE, maxE);
    hr.push(hrWert, hrWert);
  }

  const hrWerte = hr.filter((h): h is number => h != null);
  const speedSort = [...speed].sort((a, b) => a - b);
  return {
    zeit,
    ele,
    speed,
    hr,
    eleMin: Math.min(...ele),
    eleMax: Math.max(...ele),
    speedMax: speedSort[Math.floor(speedSort.length * 0.98)] || 1,
    hrMin: hrWerte.length ? Math.min(...hrWerte) - 5 : 0,
    hrMax: hrWerte.length ? Math.max(...hrWerte) + 5 : 1,
    hatHr: hrWerte.length >= 5,
  };
}
