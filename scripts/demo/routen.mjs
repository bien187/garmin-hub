/**
 * Holt die FIKTIVEN Demo-Routen einmalig über BRouter (öffentlich, ohne
 * API-Schlüssel — derselbe Dienst wie im Routen-Builder) und legt sie als
 * scripts/demo/routen.json ab. Die Aufnahme (aufnahme.aufnahme.ts) liest nur
 * diese Datei und läuft damit offline und deterministisch.
 *
 * Die Wegpunkte sind frei erfunden (öffentliche Orte rund um Bern), keine
 * aufgezeichneten Strecken einer Person.
 *
 *   node scripts/demo/routen.mjs
 */
import { writeFileSync } from "node:fs";

/** [lng, lat] */
const ROUTEN = {
  aare_kurz: {
    name: "Aare-Runde Marzili",
    profil: "trekking",
    punkte: [[7.4436, 46.9433], [7.4515, 46.9372], [7.4545, 46.9296], [7.4590, 46.9305], [7.4532, 46.9395], [7.4436, 46.9433]],
  },
  aare_lang: {
    name: "Aare bis Muri",
    profil: "trekking",
    punkte: [[7.4436, 46.9433], [7.4545, 46.9296], [7.4660, 46.9230], [7.4810, 46.9185], [7.4775, 46.9260], [7.4655, 46.9330], [7.4532, 46.9395], [7.4436, 46.9433]],
  },
  bremgartenwald: {
    name: "Bremgartenwald",
    profil: "hiking-mountain",
    punkte: [[7.4265, 46.9585], [7.4135, 46.9625], [7.4010, 46.9655], [7.3960, 46.9590], [7.4105, 46.9545], [7.4265, 46.9585]],
  },
  allmend: {
    name: "Allmend-Runde",
    profil: "trekking",
    punkte: [[7.4655, 46.9615], [7.4760, 46.9575], [7.4805, 46.9640], [7.4700, 46.9700], [7.4655, 46.9615]],
  },
  gurten: {
    name: "Gurten-Trail",
    profil: "hiking-mountain",
    punkte: [[7.4495, 46.9300], [7.4430, 46.9205], [7.4375, 46.9160], [7.4465, 46.9140], [7.4560, 46.9195], [7.4495, 46.9300]],
  },
  gurten_lang: {
    name: "Gurten und Köniz",
    profil: "hiking-mountain",
    punkte: [[7.4436, 46.9433], [7.4495, 46.9300], [7.4375, 46.9160], [7.4180, 46.9200], [7.4150, 46.9300], [7.4300, 46.9380], [7.4436, 46.9433]],
  },
  bantiger: {
    name: "Bantiger-Wanderung",
    profil: "hiking-mountain",
    punkte: [[7.5010, 46.9745], [7.5150, 46.9800], [7.5285, 46.9783], [7.5300, 46.9670], [7.5200, 46.9600], [7.5010, 46.9745]],
  },
  guerbetal: {
    name: "Velotour Gürbetal",
    profil: "trekking",
    punkte: [[7.4495, 46.9300], [7.4700, 46.9100], [7.4985, 46.8910], [7.5010, 46.8620], [7.4700, 46.8700], [7.4560, 46.9000], [7.4495, 46.9300]],
  },
  wohlensee: {
    name: "Velotour Wohlensee",
    profil: "trekking",
    punkte: [[7.4430, 46.9630], [7.4140, 46.9800], [7.3550, 46.9700], [7.3300, 46.9580], [7.3600, 46.9500], [7.4100, 46.9520], [7.4430, 46.9630]],
  },
};

async function segment(a, b, profil) {
  const url = `https://brouter.de/brouter?lonlats=${a[0]},${a[1]}|${b[0]},${b[1]}&profile=${profil}&alternativeidx=0&format=geojson`;
  for (let versuch = 0; versuch < 3; versuch++) {
    const res = await fetch(url, { headers: { "User-Agent": "garmin-hub-demo-generator" } });
    if (res.ok) {
      const data = await res.json();
      return data.features[0].geometry.coordinates;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`BRouter fehlgeschlagen: ${url}`);
}

const out = {};
for (const [id, r] of Object.entries(ROUTEN)) {
  const koords = [];
  for (let i = 0; i < r.punkte.length - 1; i++) {
    const seg = await segment(r.punkte[i], r.punkte[i + 1], r.profil);
    koords.push(...(koords.length ? seg.slice(1) : seg));
    await new Promise((res) => setTimeout(res, 600)); // Dienst schonen
  }
  out[id] = {
    name: r.name,
    // [lng, lat, ele] auf 6 bzw. 1 Nachkommastelle
    koordinaten: koords.map(([x, y, z]) => [+x.toFixed(6), +y.toFixed(6), +(z ?? 0).toFixed(1)]),
  };
  console.log(`${id}: ${koords.length} Punkte`);
}
writeFileSync(new URL("./routen.json", import.meta.url), JSON.stringify(out));
