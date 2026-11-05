/**
 * Erzeugt FIKTIVE Demo-Daten für die README-Screenshots in einer lokalen,
 * leeren Datenbank (nie in Supabase/Produktion).
 *
 * Alles ist synthetisch und deterministisch (fester Zufallsseed): Läufe auf
 * erfundenen Runden um die Aare in Bern, Krafttrainings, Gesundheitswerte,
 * Schlafnächte im Garmin-Rohformat (damit der echte Parser sie aufbereitet),
 * EP-Benchmarks und eine gespeicherte Route. Keine echten Garmin-Daten.
 *
 * Aufruf:
 *   DEMO_DATABASE_URL=postgres://postgres:demo@127.0.0.1:55432/ghq_demo \
 *     node scripts/readme/demo-daten.mjs
 *
 * Danach die App mit DATABASE_URL=$DEMO_DATABASE_URL starten; der erste
 * Dashboard-Aufruf berechnet Fitness, Muskelstatus und Schlafaufbereitung.
 */
import postgres from "postgres";
import { randomUUID } from "node:crypto";

const URL_ = process.env.DEMO_DATABASE_URL;
if (!URL_) throw new Error("DEMO_DATABASE_URL fehlt");
const host = new URL(URL_).hostname;
if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
  throw new Error(`Abbruch: Demo-Daten nur in eine lokale Datenbank schreiben (Host ${host})`);
}
const sql = postgres(URL_, { max: 1 });

/* ------------------------------------------------------------ Hilfen */

let seed = 20261105;
const zufall = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const zw = (a, b) => a + (b - a) * zufall();
const rund = (v, s = 0) => Math.round(v * 10 ** s) / 10 ** s;

const HEUTE = process.env.DEMO_HEUTE ?? new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Zurich" }).format(new Date());
const START = "2026-06-27";
const addTage = (iso, n) => {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const wochentag = (iso) => new Date(iso + "T12:00:00Z").getUTCDay(); // 0 = So
const tage = [];
for (let d = START; d <= HEUTE; d = addTage(d, 1)) tage.push(d);
/** Lokale Zürcher Zeit → UTC-Date (Sommerzeit bis 25.10.2026) */
const zuerich = (iso, stunde, minute = 0) => {
  const offset = iso < "2026-10-25" ? 2 : 1;
  return new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10), stunde - offset, minute));
};

function encodePolyline(punkte) {
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

/* ------------------------------------------------- Routen (fiktiv, Bern) */

const ZENTRUM = [46.9468, 7.4515]; // Aare-Schlaufe, frei erfunden
/** Geschlossene, leicht verwinkelte Runde mit Höhenprofil */
function runde(distanzM, variante, hoehe) {
  const umfang = distanzM;
  const r = umfang / (2 * Math.PI);
  const n = 400;
  const pkt = [];
  for (let i = 0; i <= n; i++) {
    const w = (i / n) * 2 * Math.PI;
    const wobble = 1 + 0.18 * Math.sin(3 * w + variante) + 0.08 * Math.sin(7 * w + 2 * variante);
    const dx = r * wobble * Math.cos(w);
    const dy = r * wobble * 0.75 * Math.sin(w);
    const lat = ZENTRUM[0] + dy / 111_320;
    const lng = ZENTRUM[1] + dx / (111_320 * Math.cos((ZENTRUM[0] * Math.PI) / 180));
    const ele = 520 + hoehe * (0.5 + 0.5 * Math.sin(w + variante)) + 6 * Math.sin(5 * w);
    pkt.push([lat, lng, ele]);
  }
  return pkt;
}
const distanz = (a, b) => {
  const R = 6371000;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};

/* ------------------------------------------------------ Aktivitäten */

let aktId = 9_100_000_000;
const aktivitaeten = [];
const streams = [];
const saetze = [];
const woche = (iso) => Math.floor((Date.parse(iso) - Date.parse(START)) / (7 * 86400_000));

function lauf(datum, { art, km, hm, name, stunde = 7, lastKg = 0 }) {
  const id = ++aktId;
  const fortschritt = woche(datum) / 19; // Grundlage wächst: gleiche HF, schneller
  const basisPace = 395 - 25 * fortschritt + lastKg * 0.9; // s/km
  const route = runde(km * 1000, zw(0, 6), hm);
  const gesamtDist = route.slice(1).reduce((s, p, i) => s + distanz(route[i], p), 0);
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
  let hmAuf = 0;
  let hmAb = 0;
  for (let i = 0; i < route.length; i++) {
    if (i > 0) {
      const seg = distanz(route[i - 1], route[i]) * ((km * 1000) / gesamtDist);
      const steig = (route[i][2] - route[i - 1][2]) / Math.max(seg, 1);
      const intervall = art === "intervalle" && Math.floor((d / 1000) * 2) % 2 === 1;
      const p = basisPace * (1 + steig * 3) * (intervall ? 0.82 : 1) * (1 + 0.012 * Math.sin(i / 9) + 0.004 * Math.sin(i / 2.3));
      t += (seg / 1000) * p;
      d += seg;
      const dh = route[i][2] - route[i - 1][2];
      if (dh > 0) hmAuf += dh;
      else hmAb -= dh;
      pace.push(rund(p));
    } else pace.push(null);
    zeitS.push(rund(t));
    lat.push(rund(route[i][0], 6));
    lng.push(rund(route[i][1], 6));
    ele.push(rund(route[i][2], 1));
    const ziel = art === "intervalle" ? 158 : art === "lastlauf" ? 154 : 143;
    const anstieg = Math.min(1, t / 240);
    const drift = 4 * (i / route.length); // leichte Herzfrequenz-Drift
    hr.push(Math.round(105 + (ziel - 105) * anstieg + drift + 2.5 * Math.sin(i / 17) + zw(-1, 1)));
    kad.push(Math.round(zw(164, 172)));
    dist.push(rund(d, 1));
  }
  const avgHr = Math.round(hr.reduce((a, b) => a + b, 0) / hr.length);
  aktivitaeten.push({
    id,
    typ: "running",
    name,
    start_zeit: zuerich(datum, stunde, Math.round(zw(0, 40))),
    dauer_s: rund(t),
    distanz_m: rund(d, 1),
    hm_auf: rund(hmAuf),
    hm_ab: rund(hmAb),
    avg_hr: avgHr,
    max_hr: Math.max(...hr),
    avg_pace: rund(t / (d / 1000), 1),
    kalorien: Math.round(km * 72),
    avg_kadenz: 168,
    trainingseffekt_aerob: rund(zw(2.6, 3.8), 1),
    trainingseffekt_anaerob: rund(art === "intervalle" ? zw(2, 3.2) : zw(0.3, 1.2), 1),
    vo2max_wert: Math.round(50 + 3 * fortschritt),
    geraet: "Forerunner 265",
    polyline: encodePolyline(route.map(([a, b]) => [a, b])),
    raw: { demo: true },
  });
  streams.push({ activity_id: id, zeit_s: zeitS, lat, lng, ele, hr, pace_s_km: pace, kadenz: kad, distanz_m: dist });
}

function kraft(datum, name, uebungen) {
  const id = ++aktId;
  aktivitaeten.push({
    id,
    typ: "strength_training",
    name,
    start_zeit: zuerich(datum, 18, Math.round(zw(0, 30))),
    dauer_s: Math.round(zw(3300, 4200)),
    distanz_m: null,
    hm_auf: null,
    hm_ab: null,
    avg_hr: Math.round(zw(108, 122)),
    max_hr: Math.round(zw(150, 165)),
    avg_pace: null,
    kalorien: Math.round(zw(380, 520)),
    avg_kadenz: null,
    trainingseffekt_aerob: rund(zw(1.5, 2.3), 1),
    trainingseffekt_anaerob: rund(zw(1.8, 2.8), 1),
    vo2max_wert: null,
    geraet: "Forerunner 265",
    polyline: null,
    raw: { demo: true },
  });
  uebungen.forEach(([key, s, wdh, kg], i) => {
    for (let k = 0; k < s; k++) {
      saetze.push({ id: `${id}-${i}-${k}`, activity_id: id, uebung_name: key, saetze: 1, wdh, gewicht_kg: kg, dauer_s: 45, muskelgruppen: null });
    }
  });
}

for (const datum of tage) {
  if (datum >= "2026-11-05" && datum !== HEUTE) continue;
  const wt = wochentag(datum);
  const w = woche(datum);
  const lastKg = Math.min(20, 6 + 2 * Math.max(0, w - 5));
  if (wt === 1) kraft(datum, "Gym: Brust/Trizeps", [["BENCH_PRESS", 4, 8, 70 + w], ["DIP", 3, 10, 0], ["TRICEPS_EXTENSION", 3, 12, 25], ["PUSH_UP", 3, 20, 0]]);
  if (wt === 2) lauf(datum, { art: "intervalle", km: 7 + (w % 3), hm: 25, name: "Intervalle 6×800 m" });
  if (wt === 3 && datum < "2026-11-05") lauf(datum, { art: "z2", km: 8 + (w % 4), hm: 40, name: "Lockerer Lauf Aare" });
  if (wt === 4) kraft(datum, "Gym: Rücken/Bizeps", [["PULL_UP", 5, 7 + Math.floor(w / 8), 0], ["ROW", 4, 10, 60], ["LAT_PULLDOWN", 3, 10, 55], ["CURL", 3, 12, 14]]);
  if (wt === 6) {
    if (w >= 6 && w % 2 === 0) lauf(datum, { art: "lastlauf", km: 5, hm: 60, name: `Lastlauf ${lastKg} kg`, stunde: 9, lastKg });
    else lauf(datum, { art: "lang", km: 13 + (w % 5), hm: 160, name: "Langer Lauf Gurten", stunde: 9 });
  }
  if (wt === 0) kraft(datum, "Gym: Ganzkörper", [["SQUAT", 4, 8, 80 + w], ["ROMANIAN_DEADLIFT", 3, 10, 70], ["LUNGE", 3, 12, 20], ["PULL_UP", 4, 6, 0], ["PLANK", 3, 1, 0]]);
}

/* ------------------------------------------- Gesundheit und Schlaf */

const gesundheit = [];
const naechte = [];
const iso = (ms) => new Date(ms).toISOString().slice(0, 19) + ".0";

function schlafNacht(datum) {
  // Bettzeit ca. 22:30–23:30 lokal am Vortag, 7–8 h
  const vortag = addTage(datum, -1);
  const start = zuerich(vortag, 22, Math.round(zw(20, 80))).getTime();
  const dauer = zw(6.6, 8.1) * 3600_000;
  const ende = start + dauer;
  // Phasenfolge in ~90-Min-Zyklen (Code: 0 Tief, 1 Leicht, 2 REM, 3 Wach)
  const levels = [];
  let t = start;
  let zyklus = 0;
  while (t < ende - 5 * 60_000) {
    const tiefAnteil = Math.max(0.05, 0.32 - zyklus * 0.07);
    const remAnteil = Math.min(0.32, 0.12 + zyklus * 0.05);
    const z = zw(85, 100) * 60_000;
    const folge = [
      [1, z * (1 - tiefAnteil - remAnteil) * 0.5],
      [0, z * tiefAnteil],
      [1, z * (1 - tiefAnteil - remAnteil) * 0.5],
      [2, z * remAnteil],
    ];
    if (zyklus > 0 && zufall() < 0.6) folge.unshift([3, zw(2, 9) * 60_000]);
    for (const [lvl, dd] of folge) {
      const e = Math.min(ende, t + dd);
      if (e - t > 60_000) levels.push({ startGMT: iso(t), endGMT: iso(e), activityLevel: lvl });
      t = e;
    }
    zyklus++;
  }
  const sek = { 0: 0, 1: 0, 2: 0, 3: 0 };
  for (const l of levels) sek[l.activityLevel] += (Date.parse(l.endGMT + "Z") - Date.parse(l.startGMT + "Z")) / 1000;
  const phaseBei = (ms) => levels.find((l) => ms >= Date.parse(l.startGMT + "Z") && ms < Date.parse(l.endGMT + "Z"))?.activityLevel ?? 1;
  const reihe = (schritt, fn, von = start, bis = ende) => {
    const out = [];
    for (let ms = von; ms < bis; ms += schritt * 1000) out.push([ms, fn(ms, (ms - start) / dauer)]);
    return out;
  };
  const hr = reihe(120, (ms, x) => Math.round(58 - 10 * Math.sin(Math.PI * Math.min(1, x * 1.4)) + (phaseBei(ms) === 2 ? 4 : 0) + (phaseBei(ms) === 3 ? 9 : 0) + zw(-1.5, 1.5)));
  const spo2 = reihe(60, () => Math.round(zw(93, 98.4)));
  const atem = reihe(120, (ms) => rund({ 0: 13.8, 1: 12.9, 2: 11.6, 3: 13.3 }[phaseBei(ms)] + zw(-0.8, 0.8)));
  const stress = reihe(180, (ms, x) => Math.max(1, Math.round(26 - 20 * x + (phaseBei(ms) === 3 ? 18 : 0) + zw(-3, 3))));
  const bbStart = Math.round(zw(18, 32));
  const bb = reihe(180, (_ms, x) => Math.min(100, Math.round(bbStart + x * zw(58, 64))));
  const hrv = reihe(300, (_ms, x) => Math.round(62 + 30 * Math.min(1, x * 1.3) + zw(-9, 9)));
  const bewegung = reihe(60, (ms) => rund(phaseBei(ms) === 3 ? zw(2.5, 6) : zw(0, 1.4), 2), start - 3600_000, ende + 3600_000);
  const unruhe = levels.filter((l) => l.activityLevel === 3 || zufall() < 0.25).map((l) => ({ value: 1 + Math.floor(zw(0, 3)), startGMT: Date.parse(l.startGMT + "Z") }));
  const schlafS = sek[0] + sek[1] + sek[2];
  const pct = (s) => Math.round((s / schlafS) * 100);
  const score = Math.round(Math.min(95, 55 + (schlafS / 3600 - 6) * 14 + pct(sek[0]) * 0.4));
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
      awakeCount: 0,
      averageSpO2Value: rund(avg(spo2)),
      lowestSpO2Value: Math.min(...spo2.map((p) => p[1])),
      averageRespirationValue: rund(avg(atem)),
      lowestRespirationValue: Math.min(...atem.map((p) => p[1])),
      highestRespirationValue: Math.max(...atem.map((p) => p[1])),
      avgHeartRate: Math.round(avg(hr)),
      avgSleepStress: Math.round(avg(stress)),
      sleepScores: {
        overall: { value: score, qualifierKey: score >= 80 ? "GOOD" : "FAIR" },
        deepPercentage: { value: pct(sek[0]), optimalStart: 16, optimalEnd: 33 },
        lightPercentage: { value: pct(sek[1]), optimalStart: 30, optimalEnd: 64 },
        remPercentage: { value: pct(sek[2]), optimalStart: 21, optimalEnd: 31 },
      },
    },
    sleepLevels: levels,
    sleepMovement: bewegung.map(([ms, v]) => ({ startGMT: iso(ms), endGMT: iso(ms + 60_000), activityLevel: v })),
    sleepRestlessMoments: unruhe,
    restlessMomentsCount: unruhe.reduce((a, u) => a + u.value, 0),
    sleepHeartRate: hr.map(([ms, v]) => ({ value: v, startGMT: ms })),
    wellnessEpochSPO2DataDTOList: spo2.map(([ms, v]) => ({ epochTimestamp: iso(ms), spo2Reading: v, epochDuration: 60, readingConfidence: 5 })),
    wellnessEpochRespirationDataDTOList: atem.map(([ms, v]) => ({ startTimeGMT: ms, respirationValue: v })),
    sleepStress: stress.map(([ms, v]) => ({ value: v, startGMT: ms })),
    sleepBodyBattery: bb.map(([ms, v]) => ({ value: v, startGMT: ms })),
    hrvData: hrv.map(([ms, v]) => ({ value: v, startGMT: ms })),
    avgOvernightHrv: hrvMittel,
    hrvStatus: "BALANCED",
    bodyBatteryChange: bb.at(-1)[1] - bb[0][1],
    restingHeartRate: Math.round(zw(45, 49)),
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
      hrv_baseline: { baseline: { lowUpper: 68, balancedLow: 72, balancedUpper: 94 }, lastNightAvg: hrvMittel, weeklyAvg: 82, status: "BALANCED" },
    },
    hrvMittel,
    ruhepuls: raw.restingHeartRate,
    score,
    schlafS,
    tiefS: sek[0],
    remS: sek[2],
    bbMax: bb.at(-1)[1],
  };
}

for (const datum of tage) {
  const mitSchlaf = datum >= addTage(HEUTE, -60);
  const n = mitSchlaf ? schlafNacht(datum) : null;
  if (n) naechte.push(n.zeile);
  gesundheit.push({
    datum,
    ruhepuls: n?.ruhepuls ?? Math.round(zw(45, 50)),
    hrv_letzte_nacht: n?.hrvMittel ?? Math.round(zw(72, 90)),
    hrv_status: "BALANCED",
    schlaf_dauer_s: n ? Math.round(n.schlafS) : Math.round(zw(6.6, 8) * 3600),
    schlaf_score: n?.score ?? Math.round(zw(70, 88)),
    tiefschlaf_s: n ? Math.round(n.tiefS) : null,
    rem_s: n ? Math.round(n.remS) : null,
    stress_avg: Math.round(zw(22, 34)),
    body_battery_min: Math.round(zw(12, 25)),
    body_battery_max: n?.bbMax ?? Math.round(zw(75, 95)),
    schritte: Math.round(zw(7000, 15000)),
    training_readiness: Math.round(zw(55, 85)),
    raw: { demo: true },
  });
}

/* ------------------------------------------------ Benchmarks, Route */

const benchmarks = [];
const bench = (datum, disziplin, wert, notiz) => benchmarks.push({ id: randomUUID(), datum, disziplin, wert, notiz });
[["2026-07-04", 1980, 6, 22, 66, 108], ["2026-08-08", 1915, 7, 25, 72, 116], ["2026-09-12", 1870, 8, 28, 80, 124], ["2026-10-17", 1835, 9, 31, 88, 132]].forEach(
  ([d, lastlauf, kz, ls, rs, rd]) => {
    bench(d, "lastlauf", lastlauf, "Demo");
    bench(d, "klimmzuege", kz, "Demo");
    bench(d, "liegestuetze", ls, "Demo");
    bench(d, "rumpf_seitlich", rs, "Demo");
    bench(d, "rumpf_dorsal", rd, "Demo");
  }
);

const routePkt = runde(6800, 1.3, 90);
const routeDist = routePkt.slice(1).reduce((s, p, i) => s + distanz(routePkt[i], p), 0);
const course = {
  id: randomUUID(),
  name: "Aare-Runde (Demo)",
  geojson: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: routePkt.map(([a, b, e]) => [rund(b, 6), rund(a, 6), rund(e, 1)]) } },
  distanz_m: rund(routeDist),
  hm_auf: 95,
  hm_ab: 95,
};

/* ----------------------------------------------------------- Schreiben */

const leer = await sql`select count(*)::int n from activities`;
if (leer[0].n > 0 && !process.env.DEMO_ERSETZEN) {
  throw new Error("Datenbank ist nicht leer. Mit DEMO_ERSETZEN=1 werden die Demo-Tabellen geleert.");
}
await sql.begin(async (tx) => {
  for (const t of ["activities", "activity_streams", "strength_sets", "daily_health", "computed_daily", "muscle_state", "planned_workouts", "courses", "ep_benchmarks", "app_settings", "sync_state", "sleep_nights", "sleep_epochen", "sleep_zeitreihen"]) {
    await tx.unsafe(`delete from ${t}`);
  }
  const chunk = async (tabelle, zeilen) => {
    for (let i = 0; i < zeilen.length; i += 200) await tx`insert into ${tx(tabelle)} ${tx(zeilen.slice(i, i + 200))}`;
  };
  await chunk("activities", aktivitaeten.map((a) => ({ ...a, raw: tx.json(a.raw), synced_at: new Date() })));
  await chunk("activity_streams", streams.map((s) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, k === "activity_id" ? v : tx.json(v)]))));
  await chunk("strength_sets", saetze);
  await chunk("daily_health", gesundheit.map((g) => ({ ...g, raw: tx.json(g.raw) })));
  await chunk("sleep_nights", naechte.map((n) => ({ ...n, raw: tx.json(n.raw), hrv_baseline: tx.json(n.hrv_baseline), zuletzt_synchronisiert: new Date() })));
  await chunk("ep_benchmarks", benchmarks);
  await tx`insert into courses ${tx({ ...course, geojson: tx.json(course.geojson) })}`;
  await tx`insert into app_settings ${tx({ key: "profil", value: tx.json({ name: "Demo", gewichtKg: 80, groesseCm: 180, ruhepuls: 47, hfMax: 195 }) })}`;
});
console.log(
  `Demo-Daten geschrieben: ${aktivitaeten.length} Aktivitäten, ${saetze.length} Sätze, ${gesundheit.length} Gesundheitstage, ${naechte.length} Nächte, ${benchmarks.length} Benchmarks, 1 Route (bis ${HEUTE}).`
);
await sql.end();
