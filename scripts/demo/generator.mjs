/**
 * Synthese FIKTIVER Trainingsdaten für die öffentliche Demo — reine,
 * deterministische Funktionen (fester Zufallsseed), kein DB-Zugriff.
 *
 * Die fiktive Person „Alex Muster" trainiert auf erfundenen Runden rund um
 * Bern (Geometrie aus routen.json, einmalig über BRouter auf öffentlichen
 * Wegen geroutet). Aus jeder geplanten Einheit des echten Plan-Generators
 * entsteht eine Aktivität im Format der Garmin-Bridge: Zusammenfassung,
 * Streams (Zeit, Position, Höhe, Puls, Pace, Kadenz, Distanz) und bei
 * Krafteinheiten die Sätze. Schlafnächte entstehen im Garmin-Rohformat,
 * damit der echte Schlaf-Parser sie aufbereitet.
 */
import { readFileSync } from "node:fs";

export const ROUTEN = JSON.parse(readFileSync(new URL("./routen.json", import.meta.url), "utf8"));

/* ------------------------------------------------------------ Zufall */

let seed = 20261105;
export function setzeSeed(s) {
  seed = s;
}
export const zufall = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
export const zw = (a, b) => a + (b - a) * zufall();
export const rund = (v, s = 0) => Math.round(v * 10 ** s) / 10 ** s;
const klemme = (v, a, b) => Math.max(a, Math.min(b, v));

/* -------------------------------------------------------------- Zeit */

/** Lokale Zürcher Zeit → UTC-Date (Sommerzeit bis 25.10.2026) */
export function zuerich(iso, stunde, minute = 0) {
  const offset = iso < "2026-10-25" ? 2 : 1;
  return new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10), stunde - offset, minute));
}
export function addTage(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/* --------------------------------------------------------- Geometrie */

function haversine(a, b) {
  const R = 6371000;
  const t = Math.PI / 180;
  const x =
    Math.sin(((b[1] - a[1]) * t) / 2) ** 2 +
    Math.cos(a[1] * t) * Math.cos(b[1] * t) * Math.sin(((b[0] - a[0]) * t) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** Route mit kumulierter Distanz und leicht geglätteter Höhe */
function vorbereiten(id) {
  const k = ROUTEN[id].koordinaten;
  const cum = [0];
  for (let i = 1; i < k.length; i++) cum.push(cum[i - 1] + haversine(k[i - 1], k[i]));
  const ele = k.map((_, i) => {
    let s = 0;
    let n = 0;
    for (let j = Math.max(0, i - 2); j <= Math.min(k.length - 1, i + 2); j++) {
      s += k[j][2];
      n++;
    }
    return s / n;
  });
  return { k, cum, ele, laenge: cum[cum.length - 1] };
}
const CACHE = new Map();
const route = (id) => {
  if (!CACHE.has(id)) CACHE.set(id, vorbereiten(id));
  return CACHE.get(id);
};
export const routenLaenge = (id) => route(id).laenge;

/** Position auf der (ggf. mehrfach umrundeten) Route bei Distanz d */
function positionBei(r, d) {
  const dd = ((d % r.laenge) + r.laenge) % r.laenge;
  let lo = 0;
  let hi = r.cum.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (r.cum[m] <= dd) lo = m;
    else hi = m;
  }
  const seg = r.cum[hi] - r.cum[lo] || 1;
  const f = (dd - r.cum[lo]) / seg;
  return {
    lng: r.k[lo][0] + (r.k[hi][0] - r.k[lo][0]) * f,
    lat: r.k[lo][1] + (r.k[hi][1] - r.k[lo][1]) * f,
    ele: r.ele[lo] + (r.ele[hi] - r.ele[lo]) * f,
  };
}

/** Google-Polyline (Präzision 5) */
export function encodePolyline(punkte) {
  let out = "";
  let pl = 0;
  let pg = 0;
  for (const [lat, lng] of punkte) {
    const il = Math.round(lat * 1e5);
    const ig = Math.round(lng * 1e5);
    for (let v of [il - pl, ig - pg]) {
      v = v < 0 ? ~(v << 1) : v << 1;
      while (v >= 0x20) {
        out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
        v >>= 5;
      }
      out += String.fromCharCode(v + 63);
    }
    pl = il;
    pg = ig;
  }
  return out;
}

/* -------------------------------------------------------- Aktivitäten */

let aktId = 9_200_000_000;

/**
 * Bewegungs-Simulation entlang einer Route.
 * phasen: [{ dauerS, paceSKm, hr }] — Zielwerte je Abschnitt (flach).
 * art: lauf | wandern | velo
 */
function simuliere({ routeId, phasen, art, startDistanz = 0, schrittS = 5, ruhepuls, hfMax }) {
  const r = route(routeId);
  const zeitS = [];
  const lat = [];
  const lng = [];
  const ele = [];
  const hr = [];
  const pace = [];
  const kad = [];
  const dist = [];
  let t = 0;
  let d = 0;
  let puls = ruhepuls + 25;
  let rauschen = 0;
  const gesamtS = phasen.reduce((s, p) => s + p.dauerS, 0);
  let hmAuf = 0;
  let hmAb = 0;
  let letzteEle = null;
  for (const p of phasen) {
    const ende = t + p.dauerS;
    while (t < ende) {
      const pos = positionBei(r, startDistanz + d);
      const vor = positionBei(r, startDistanz + d + 25);
      const steig = klemme((vor.ele - pos.ele) / 25, -0.25, 0.25);
      // Steigung: bergauf langsamer und höherer Puls, bergab leicht schneller
      const faktor =
        art === "velo"
          ? 1 + (steig > 0 ? steig * 9 : steig * 3.5)
          : art === "wandern"
            ? 1 + (steig > 0 ? steig * 6 : -steig * 1.5)
            : 1 + (steig > 0 ? steig * 3.2 : steig * 1.2);
      rauschen = rauschen * 0.9 + zw(-1, 1) * 0.1;
      const paceJetzt = p.paceSKm * klemme(faktor, 0.7, 3.2) * (1 + 0.025 * rauschen);
      const drift = 5 * (t / Math.max(gesamtS, 1));
      const zielHr = p.hr + steig * (art === "velo" ? 140 : 90) + drift;
      puls += (zielHr - puls) * (1 - Math.exp(-schrittS / 25)); // Herzfrequenz folgt verzögert
      const pulsWert = Math.round(klemme(puls + zw(-1.2, 1.2), ruhepuls + 10, hfMax - 2));
      zeitS.push(t);
      lat.push(rund(pos.lat, 6));
      lng.push(rund(pos.lng, 6));
      const e = rund(pos.ele + zw(-0.3, 0.3), 1);
      ele.push(e);
      if (letzteEle != null) {
        if (e > letzteEle) hmAuf += e - letzteEle;
        else hmAb += letzteEle - e;
      }
      letzteEle = e;
      hr.push(pulsWert);
      pace.push(rund(paceJetzt));
      kad.push(
        art === "velo"
          ? Math.round(zw(82, 92))
          : art === "wandern"
            ? Math.round(zw(98, 112))
            : Math.round(klemme(176 - (paceJetzt - 300) * 0.06 + zw(-2, 2), 158, 188))
      );
      dist.push(rund(d, 1));
      d += (schrittS / paceJetzt) * 1000;
      t += schrittS;
    }
  }
  return { zeitS, lat, lng, ele, hr, pace, kad, dist, dauerS: t, distanzM: d, hmAuf, hmAb };
}

/**
 * Lauf/Wanderung/Velotour als Aktivitätszeile + Streams.
 * `profil` = { ruhepuls, hfMax }, `fortschritt` 0..1 (Grundlage wächst).
 */
export function ausdauer({ datum, stunde, minute = 0, typ, name, routeId, phasen, art = "lauf", profil, fortschritt, startDistanz = /** @type {number | null} */ (null) }) {
  const id = ++aktId;
  const s = simuliere({ routeId, phasen, art, startDistanz: startDistanz ?? zw(0, routenLaenge(routeId)), ...profil });
  const avgHr = Math.round(s.hr.reduce((a, b) => a + b, 0) / s.hr.length);
  const maxHr = Math.max(...s.hr);
  const reserveAnteil = (avgHr - profil.ruhepuls) / (profil.hfMax - profil.ruhepuls);
  const aerob = klemme(1.2 + reserveAnteil * 2.2 + (s.dauerS / 3600) * 0.9, 1, 5);
  const harteAnteile = phasen.filter((p) => p.hr > profil.ruhepuls + 0.85 * (profil.hfMax - profil.ruhepuls)).length;
  const zeile = {
    id,
    typ,
    name,
    start_zeit: zuerich(datum, stunde, minute),
    dauer_s: s.dauerS,
    distanz_m: rund(s.distanzM, 1),
    hm_auf: Math.round(s.hmAuf * 0.85), // Garmin glättet stärker
    hm_ab: Math.round(s.hmAb * 0.85),
    avg_hr: avgHr,
    max_hr: maxHr,
    avg_pace: rund(s.dauerS / (s.distanzM / 1000), 1),
    kalorien: Math.round((s.dauerS / 60) * (art === "wandern" ? 6.5 : art === "velo" ? 9 : 11.5) * (0.85 + reserveAnteil * 0.4)),
    avg_kadenz: Math.round(s.kad.reduce((a, b) => a + b, 0) / s.kad.length),
    trainingseffekt_aerob: rund(aerob, 1),
    trainingseffekt_anaerob: rund(klemme(0.2 + harteAnteile * 0.45 + zw(0, 0.4), 0, 4.2), 1),
    vo2max_wert: art === "lauf" ? Math.round(49 + 4 * fortschritt + zw(-0.4, 0.4)) : null,
    geraet: "Forerunner 265",
    polyline: encodePolyline(s.lat.map((la, i) => [la, s.lng[i]]).filter((_, i) => i % 3 === 0)),
    raw: { demo: true },
  };
  const stream = {
    activity_id: id,
    zeit_s: s.zeitS,
    lat: s.lat,
    lng: s.lng,
    ele: s.ele,
    hr: s.hr,
    pace_s_km: s.pace,
    kadenz: s.kad,
    distanz_m: s.dist,
  };
  return { zeile, stream };
}

/** Krafteinheit mit Sätzen [GARMIN_KEY, saetze, wdh, kg] */
export function kraft({ datum, stunde = 18, name, uebungen, profil }) {
  const id = ++aktId;
  const saetzeGesamt = uebungen.reduce((s, u) => s + u[1], 0);
  const dauer = Math.round(600 + saetzeGesamt * zw(150, 190));
  const zeile = {
    id,
    typ: "strength_training",
    name,
    start_zeit: zuerich(datum, stunde, Math.round(zw(0, 30))),
    dauer_s: dauer,
    distanz_m: null,
    hm_auf: null,
    hm_ab: null,
    avg_hr: Math.round(profil.ruhepuls + zw(0.36, 0.46) * (profil.hfMax - profil.ruhepuls)),
    max_hr: Math.round(profil.ruhepuls + zw(0.72, 0.82) * (profil.hfMax - profil.ruhepuls)),
    avg_pace: null,
    kalorien: Math.round((dauer / 60) * zw(6.2, 7.4)),
    avg_kadenz: null,
    trainingseffekt_aerob: rund(zw(1.3, 2.1), 1),
    trainingseffekt_anaerob: rund(zw(1.6, 2.7), 1),
    vo2max_wert: null,
    geraet: "Forerunner 265",
    polyline: null,
    raw: { demo: true },
  };
  const saetze = [];
  uebungen.forEach(([key, s, wdh, kg], i) => {
    for (let k = 0; k < s; k++) {
      saetze.push({
        id: `${id}-${i}-${k}`,
        activity_id: id,
        uebung_name: key,
        saetze: 1,
        wdh: key.includes("PLANK") ? null : Math.max(1, wdh - (k === s - 1 && wdh > 4 ? 1 : 0)),
        gewicht_kg: kg || null,
        dauer_s: key.includes("PLANK") ? wdh : Math.round(zw(35, 60)),
        muskelgruppen: null,
      });
    }
  });
  return { zeile, saetze };
}

/* ------------------------------------------------- Gesundheit + Schlaf */

const isoMs = (ms) => new Date(ms).toISOString().slice(0, 19) + ".0";

/** Eine Nacht im Garmin-Rohformat (Aufwachdatum `datum`). `erholung` 0..1 */
export function schlafNacht(datum, erholung) {
  const vortag = addTage(datum, -1);
  const start = zuerich(vortag, 22, Math.round(zw(25, 75))).getTime();
  const dauer = zw(6.5, 8.0) * 3600_000 * (0.94 + 0.08 * erholung);
  const ende = start + dauer;
  const levels = [];
  let t = start + zw(6, 16) * 60_000;
  levels.push({ startGMT: isoMs(start), endGMT: isoMs(t), activityLevel: 1 });
  let zyklus = 0;
  while (t < ende - 5 * 60_000) {
    const tiefAnteil = Math.max(0.05, 0.32 - zyklus * 0.07) * (0.85 + 0.3 * erholung);
    const remAnteil = Math.min(0.32, 0.12 + zyklus * 0.05);
    const z = zw(85, 100) * 60_000;
    const folge = [
      [1, z * (1 - tiefAnteil - remAnteil) * 0.5],
      [0, z * tiefAnteil],
      [1, z * (1 - tiefAnteil - remAnteil) * 0.5],
      [2, z * remAnteil],
    ];
    if (zyklus > 0 && zufall() < 0.55) folge.unshift([3, zw(2, 8) * 60_000]);
    for (const [lvl, dd] of folge) {
      const e = Math.min(ende, t + dd);
      if (e - t > 60_000) levels.push({ startGMT: isoMs(t), endGMT: isoMs(e), activityLevel: lvl });
      t = e;
    }
    zyklus++;
  }
  const sek = { 0: 0, 1: 0, 2: 0, 3: 0 };
  for (const l of levels) sek[l.activityLevel] += (Date.parse(l.endGMT + "Z") - Date.parse(l.startGMT + "Z")) / 1000;
  const phaseBei = (ms) =>
    levels.find((l) => ms >= Date.parse(l.startGMT + "Z") && ms < Date.parse(l.endGMT + "Z"))?.activityLevel ?? 1;
  const reihe = (schritt, fn, von = start, bis = ende) => {
    const out = [];
    for (let ms = von; ms < bis; ms += schritt * 1000) out.push([ms, fn(ms, (ms - start) / dauer)]);
    return out;
  };
  const ruhepuls = Math.round(51 - 3 * erholung + zw(-1, 1));
  const hr = reihe(120, (ms, x) =>
    Math.round(ruhepuls + 9 - 9 * Math.sin(Math.PI * Math.min(1, x * 1.4)) + (phaseBei(ms) === 2 ? 4 : 0) + (phaseBei(ms) === 3 ? 9 : 0) + zw(-1.5, 1.5))
  );
  const spo2 = reihe(60, () => Math.round(zw(93, 98.4)));
  const atem = reihe(120, (ms) => rund({ 0: 13.6, 1: 12.9, 2: 11.8, 3: 13.4 }[phaseBei(ms)] + zw(-0.7, 0.7)));
  const stress = reihe(180, (ms, x) => Math.max(1, Math.round(24 - 18 * x + (phaseBei(ms) === 3 ? 16 : 0) + zw(-3, 3))));
  const bbStart = Math.round(zw(16, 30));
  const bbGewinn = zw(48, 58) + 14 * erholung;
  const bb = reihe(180, (_ms, x) => Math.min(100, Math.round(bbStart + x * bbGewinn)));
  const hrvBasis = 58 + 18 * erholung;
  const hrv = reihe(300, (_ms, x) => Math.round(hrvBasis + 22 * Math.min(1, x * 1.3) + zw(-8, 8)));
  const bewegung = reihe(60, (ms) => rund(phaseBei(ms) === 3 ? zw(2.5, 6) : zw(0, 1.3), 2), start - 3600_000, ende + 3600_000);
  const unruhe = levels
    .filter((l) => l.activityLevel === 3 || zufall() < 0.2)
    .map((l) => ({ value: 1 + Math.floor(zw(0, 3)), startGMT: Date.parse(l.startGMT + "Z") }));
  const schlafS = sek[0] + sek[1] + sek[2];
  const pct = (s) => Math.round((s / schlafS) * 100);
  const score = Math.round(klemme(52 + (schlafS / 3600 - 6) * 13 + pct(sek[0]) * 0.45 - sek[3] / 600, 40, 96));
  const avg = (r) => r.reduce((a, b) => a + b[1], 0) / r.length;
  const hrvMittel = Math.round(avg(hrv));
  const raw = {
    dailySleepDTO: {
      calendarDate: datum,
      sleepTimeSeconds: Math.round(schlafS),
      sleepStartTimestampGMT: start,
      sleepEndTimestampGMT: ende,
      deepSleepSeconds: Math.round(sek[0]),
      lightSleepSeconds: Math.round(sek[1]),
      remSleepSeconds: Math.round(sek[2]),
      awakeSleepSeconds: Math.round(sek[3]),
      awakeCount: levels.filter((l) => l.activityLevel === 3).length,
      averageSpO2Value: rund(avg(spo2)),
      lowestSpO2Value: Math.min(...spo2.map((p) => p[1])),
      averageRespirationValue: rund(avg(atem)),
      lowestRespirationValue: Math.min(...atem.map((p) => p[1])),
      highestRespirationValue: Math.max(...atem.map((p) => p[1])),
      avgHeartRate: Math.round(avg(hr)),
      avgSleepStress: Math.round(avg(stress)),
      sleepScores: {
        overall: { value: score, qualifierKey: score >= 80 ? "GOOD" : score >= 60 ? "FAIR" : "POOR" },
        deepPercentage: { value: pct(sek[0]), optimalStart: 16, optimalEnd: 33 },
        lightPercentage: { value: pct(sek[1]), optimalStart: 30, optimalEnd: 64 },
        remPercentage: { value: pct(sek[2]), optimalStart: 21, optimalEnd: 31 },
      },
    },
    sleepLevels: levels,
    sleepMovement: bewegung.map(([ms, v]) => ({ startGMT: isoMs(ms), endGMT: isoMs(ms + 60_000), activityLevel: v })),
    sleepRestlessMoments: unruhe,
    restlessMomentsCount: unruhe.reduce((a, u) => a + u.value, 0),
    sleepHeartRate: hr.map(([ms, v]) => ({ value: v, startGMT: ms })),
    wellnessEpochSPO2DataDTOList: spo2.map(([ms, v]) => ({ epochTimestamp: isoMs(ms), spo2Reading: v, epochDuration: 60, readingConfidence: 5 })),
    wellnessEpochRespirationDataDTOList: atem.map(([ms, v]) => ({ startTimeGMT: ms, respirationValue: v })),
    sleepStress: stress.map(([ms, v]) => ({ value: v, startGMT: ms })),
    sleepBodyBattery: bb.map(([ms, v]) => ({ value: v, startGMT: ms })),
    hrvData: hrv.map(([ms, v]) => ({ value: v, startGMT: ms })),
    avgOvernightHrv: hrvMittel,
    hrvStatus: "BALANCED",
    bodyBatteryChange: bb.at(-1)[1] - bb[0][1],
    restingHeartRate: ruhepuls,
  };
  return {
    zeile: {
      datum,
      schlaf_start: new Date(start),
      schlaf_ende: new Date(ende),
      garmin_score: score,
      schlaf_dauer_s: Math.round(schlafS),
      tief_s: Math.round(sek[0]),
      leicht_s: Math.round(sek[1]),
      rem_s: Math.round(sek[2]),
      wach_s: Math.round(sek[3]),
      raw,
      hrv_baseline: {
        baseline: { lowUpper: 62, balancedLow: 66, balancedUpper: 88 },
        lastNightAvg: hrvMittel,
        weeklyAvg: Math.round(70 + 10 * erholung),
        status: "BALANCED",
      },
    },
    hrvMittel,
    ruhepuls,
    score,
    schlafS,
    tiefS: sek[0],
    remS: sek[2],
    bbMax: bb.at(-1)[1],
  };
}
