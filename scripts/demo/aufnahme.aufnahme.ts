/**
 * Erzeugt den statischen Datenstand der öffentlichen Demo (/demo).
 *
 * Ablauf — alles lokal, ohne Netz, ohne Supabase, ohne Garmin:
 *  1. In-Memory-Postgres (PGlite) mit den echten Drizzle-Migrationen.
 *  2. Woche für Woche mit gestellter Uhr: echte Engine-Neuberechnung
 *     (`recomputeAll`), echter Plan-Generator (`generiereUndSpeichereWoche`),
 *     danach „absolviert" die fiktive Person Alex Muster die geplanten
 *     Einheiten (scripts/demo/generator.mjs). So passen Plan, Aktivitäten,
 *     Fitness, Muskelstatus und EP-Noten zueinander.
 *  3. Export der Antworten der echten Services/Route-Handler als JSON nach
 *     public/demo/daten/ — die Demo liest nur diese Dateien.
 *
 *   pnpm demo:daten
 *
 * Die Routen-Geometrie kommt aus scripts/demo/routen.json
 * (einmalig erzeugt mit `node scripts/demo/routen.mjs`).
 */
import { test, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { asc, eq } from "drizzle-orm";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import * as schema from "@/lib/db/schema";
import * as gen from "./generator.mjs";

const HEUTE = "2026-11-05";
/** „Jetzt" der Demo: Do 05.11.2026, 20:15 Zürich (alle Einheiten des Tages erledigt) */
export const DEMO_JETZT = "2026-11-05T19:15:00.000Z";
const VORLAUF_START = "2026-06-29";
const PLAN_START = "2026-07-13";
const SCHLAF_AB = "2026-10-08"; // vier Wochen Schlafdetails
const ZIEL = path.resolve(__dirname, "../../public/demo/daten");

const PROFIL = {
  name: "Alex Muster",
  gewichtKg: 76,
  groesseCm: 180,
  ruhepuls: 50,
  hfMax: 192,
  lastZuschlagSproKmPro10kg: 8.5,
  stiefelMalusSproKm: 10,
};
const hrAnteil = (f: number) => Math.round(PROFIL.ruhepuls + f * (PROFIL.hfMax - PROFIL.ruhepuls));

/* ------------------------------------------------------------ Helfer */

type Zeile = Record<string, unknown>;
let pg: PGlite;

async function einfuegen(tabelle: string, zeilen: Zeile[]) {
  for (const z of zeilen) {
    const spalten = Object.keys(z);
    const werte = spalten.map((k) => {
      const v = z[k];
      if (v instanceof Date) return v.toISOString();
      if (v !== null && typeof v === "object") return JSON.stringify(v);
      return v;
    });
    await pg.query(
      `insert into ${tabelle} (${spalten.join(",")}) values (${spalten.map((_, i) => `$${i + 1}`).join(",")})`,
      werte
    );
  }
}

const uhr = (iso: string, hh = 12, mm = 0) => vi.setSystemTime(gen.zuerich(iso, hh, mm));
const wochentag = (iso: string) => new Date(iso + "T12:00:00Z").getUTCDay(); // 0 = So
const fortschrittAm = (iso: string) =>
  Math.max(0, Math.min(1, (Date.parse(iso) - Date.parse(PLAN_START)) / (Date.parse("2026-11-01") - Date.parse(PLAN_START))));

/** EP-Benchmark-Wert der fiktiven Person an einem Datum (stetige Verbesserung) */
function benchmarkWert(disziplin: string, datum: string): number {
  const p = fortschrittAm(datum);
  const s = gen.zw(-0.04, 0.04);
  switch (disziplin) {
    case "lastlauf":
      return Math.round(2230 - 330 * p + 30 * s * 10); // 37:10 → ~31:40
    case "klimmzuege":
      return Math.round(6 + 4.4 * p + s * 10);
    case "liegestuetze":
      return Math.round(24 + 12 * p + s * 15);
    case "rumpf_seitlich":
      return Math.round(70 + 40 * p + s * 50);
    case "rumpf_dorsal":
      return Math.round(95 + 25 * p + s * 50);
  }
  throw new Error(disziplin);
}

/* --------------------------------------------------- Einheit → Aktivität */

interface PlanZeile {
  id: string;
  datum: string;
  typ: string;
  titel: string;
  struktur: { schritte?: unknown[] } | null;
}

type Phase = { dauerS: number; paceSKm: number; hr: number };

/** Workout-Struktur des Plans in Simulationsphasen übersetzen */
/**
 * Wahre Leistungsfähigkeit der fiktiven Person: 5-km-Pace ohne Last
 * (5:35 → 5:02/km). Harte Abschnitte richten sich danach, NICHT nach den
 * Zielpaces des Plans — sonst lernte das Lauf-Modell nur seine eigenen
 * Vorgaben zurück.
 */
const fuenfKmPace = (datum: string) => 335 - 33 * fortschrittAm(datum);

function phasenAusStruktur(
  struktur: PlanZeile["struktur"],
  basis: { pace: number; hr: number },
  hart: { p5: number; einheitTyp: string }
): Phase[] {
  const out: Phase[] = [];
  const schritt = (s: Record<string, unknown>) => {
    if (Array.isArray(s.schritte)) {
      const n = typeof s.wiederholungen === "number" ? s.wiederholungen : 1;
      for (let i = 0; i < n; i++) (s.schritte as Record<string, unknown>[]).forEach(schritt);
      return;
    }
    const art = s.art as string;
    const ziel = s.ziel as { typ: string; vonSproKm?: number; bisSproKm?: number; vonBpm?: number; bisBpm?: number } | undefined;
    let pace = art === "erholung" ? basis.pace + 45 : art === "aufwaermen" || art === "auslaufen" ? basis.pace + 20 : basis.pace;
    let hr = art === "erholung" ? hrAnteil(0.62) : art === "aufwaermen" || art === "auslaufen" ? hrAnteil(0.6) : basis.hr;
    const intensiv = ["intervalle", "huegel_intervalle"].includes(hart.einheitTyp);
    if (art === "intervall" && intensiv && (ziel?.typ === "pace" || (ziel?.typ === "hr" && (ziel.vonBpm ?? 0) >= hrAnteil(0.78)))) {
      const kurz = s.dauerTyp === "zeit" ? Number(s.dauerWert) <= 300 : Number(s.dauerWert) <= 1200;
      pace = hart.p5 * (kurz ? 0.97 : 1.06) * (hart.einheitTyp === "huegel_intervalle" ? 1.12 : 1);
      hr = hrAnteil(kurz ? 0.9 : 0.83);
    } else if (ziel?.typ === "pace") {
      hr = basis.hr + 6;
    } else if (ziel?.typ === "hr" && ziel.vonBpm && ziel.bisBpm) {
      hr = (ziel.vonBpm + ziel.bisBpm) / 2;
      const f = (hr - PROFIL.ruhepuls) / (PROFIL.hfMax - PROFIL.ruhepuls);
      pace = basis.pace - (f - 0.65) * 380;
    }
    let dauerS = 0;
    if (s.dauerTyp === "zeit") dauerS = Number(s.dauerWert);
    else if (s.dauerTyp === "distanz") dauerS = (Number(s.dauerWert) / 1000) * pace;
    else dauerS = 120;
    if (dauerS > 0) out.push({ dauerS: Math.round(dauerS * gen.zw(0.97, 1.04)), paceSKm: pace * gen.zw(0.98, 1.02), hr });
  };
  (struktur?.schritte ?? []).forEach((s) => schritt(s as Record<string, unknown>));
  return out;
}

const LAUF_RUNDEN = ["aare_kurz", "bremgartenwald", "allmend", "aare_kurz"];

function laufFuerEinheit(e: PlanZeile, idx: number, benchmarks: Zeile[]) {
  const p = fortschrittAm(e.datum);
  const z2Pace = 398 - 32 * p; // 6:38 → 6:06 bei gleichem Puls
  const basis = { pace: z2Pace, hr: hrAnteil(0.66) };
  const profil = { ruhepuls: PROFIL.ruhepuls, hfMax: PROFIL.hfMax };
  const titel = e.titel;
  if (e.typ === "probe_ep") {
    const zeit = benchmarkWert("lastlauf", e.datum);
    for (const d of ["klimmzuege", "liegestuetze", "rumpf_seitlich", "rumpf_dorsal"]) {
      benchmarks.push({ id: crypto.randomUUID(), datum: e.datum, disziplin: d, wert: benchmarkWert(d, e.datum), notiz: "Probe-EP" });
    }
    benchmarks.push({ id: crypto.randomUUID(), datum: e.datum, disziplin: "lastlauf", wert: zeit, notiz: "Probe-EP" });
    return gen.ausdauer({
      datum: e.datum, stunde: 9, typ: "running", name: "Probe-EP: Lastlauf 5 km mit 20 kg", routeId: "allmend", profil, fortschritt: p, startDistanz: 0,
      phasen: [{ dauerS: zeit, paceSKm: zeit / 5, hr: hrAnteil(0.86) }],
      // Name mit „Lastlauf": das Lauf-Modell klammert Läufe mit Last aus
    });
  }
  if (e.typ === "lastlauf") {
    const kg = Number(titel.match(/(\d{1,2})\s*kg/i)?.[1] ?? 10);
    const aufZeit = /auf Zeit/i.test(titel);
    const pace = aufZeit ? benchmarkWert("lastlauf", e.datum) / 5 : z2Pace - 10 + kg * 0.9;
    if (aufZeit) benchmarks.push({ id: crypto.randomUUID(), datum: e.datum, disziplin: "lastlauf", wert: Math.round(pace * 5), notiz: "Lastlauf auf Zeit" });
    const phasen = aufZeit
      ? [{ dauerS: 600, paceSKm: z2Pace + 30, hr: hrAnteil(0.6) }, { dauerS: Math.round(pace * 5), paceSKm: pace, hr: hrAnteil(0.85) }]
      : phasenAusStruktur(e.struktur, { pace, hr: hrAnteil(0.76) }, { p5: fuenfKmPace(e.datum), einheitTyp: e.typ });
    return gen.ausdauer({ datum: e.datum, stunde: 9, typ: "running", name: titel, routeId: "allmend", profil, fortschritt: p, phasen: phasen.length ? phasen : [{ dauerS: 2700, paceSKm: pace, hr: hrAnteil(0.76) }] });
  }
  const huegel = e.typ === "huegel_intervalle";
  const lang = e.typ === "langer_lauf";
  const routeId = huegel ? "gurten" : lang ? (idx % 2 ? "gurten_lang" : "aare_lang") : LAUF_RUNDEN[idx % LAUF_RUNDEN.length];
  const phasen = phasenAusStruktur(e.struktur, lang ? { pace: z2Pace + 12, hr: hrAnteil(0.65) } : basis, {
    p5: fuenfKmPace(e.datum),
    einheitTyp: e.typ,
  });
  return gen.ausdauer({
    datum: e.datum,
    stunde: lang ? 9 : idx % 3 === 0 ? 7 : 18,
    minute: Math.round(gen.zw(0, 40)),
    typ: routeId.startsWith("gurten") || routeId === "bremgartenwald" ? "trail_running" : "running",
    name: titel,
    routeId,
    profil,
    fortschritt: p,
    phasen: phasen.length ? phasen : [{ dauerS: 2400, paceSKm: z2Pace, hr: basis.hr }],
  });
}

function kraftFuerTag(datum: string, einheiten: PlanZeile[]) {
  const p = fortschrittAm(datum);
  const kz = Math.round(5 + 4 * p);
  const uebungen: [string, number, number, number][] = [];
  const typen = new Set(einheiten.map((e) => e.typ));
  if (typen.has("kraft")) {
    const wt = wochentag(datum);
    if (wt === 1)
      uebungen.push(["BENCH_PRESS", 4, 8, Math.round(62 + 10 * p)], ["DIP", 3, 10, 0], ["SHOULDER_PRESS", 3, 10, 18], ["TRICEPS_EXTENSION", 3, 12, 22]);
    else if (wt === 4)
      uebungen.push(["ROW", 4, 10, Math.round(52 + 8 * p)], ["LAT_PULLDOWN", 3, 10, 50], ["CURL", 3, 12, 12], ["FARMERS_CARRY", 3, 40, 28]);
    else
      uebungen.push(["SQUAT", 4, 8, Math.round(70 + 15 * p)], ["ROMANIAN_DEADLIFT", 3, 10, 60], ["LUNGE", 3, 12, 16], ["CALF_RAISE", 3, 15, 30], ["HIP_THRUST", 3, 10, 60]);
  }
  if (typen.has("klimmzuege") || typen.has("kraft")) uebungen.push(["PULL_UP", 5, kz, 0]);
  if (typen.has("liegestuetze")) uebungen.push(["PUSH_UP", 4, Math.round(16 + 8 * p), 0]);
  if (typen.has("rumpf") || typen.has("kraft")) uebungen.push(["PLANK", 3, Math.round(75 + 30 * p), 0], ["SIDE_PLANK", 2, Math.round(55 + 30 * p), 0]);
  const name = typen.has("kraft")
    ? { 1: "Gym: Brust/Schultern", 4: "Gym: Rücken/Zug", 0: "Gym: Beine/Ganzkörper" }[wochentag(datum) as 0 | 1 | 4] ?? "Gym: Ganzkörper"
    : einheiten[0].titel;
  return gen.kraft({ datum, name, uebungen, profil: PROFIL });
}

/* ---------------------------------------------------------------- Test */

test("Demo-Daten aufnehmen", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  uhr(VORLAUF_START, 6);

  pg = new PGlite();
  for (const f of readdirSync("drizzle").filter((f) => f.endsWith(".sql")).sort()) {
    for (const s of readFileSync(path.join("drizzle", f), "utf8").split("--> statement-breakpoint")) {
      if (s.trim()) await pg.exec(s);
    }
  }
  const db = drizzle(pg, { schema });
  // PGlite hat genau eine Verbindung: Eine echte Transaktion würde die
  // Abfragen blockieren, die Services darin über getDb() absetzen (in
  // Produktion laufen die über den Pool). Für die Aufnahme genügt es,
  // den Transaktionsblock direkt auszuführen.
  const dbOhneTx = Object.create(db, {
    transaction: { value: (fn: (tx: unknown) => unknown) => fn(dbOhneTx) },
  });
  (globalThis as { __ghqDb?: unknown }).__ghqDb = dbOhneTx;

  const { recomputeAll } = await import("@/lib/server/compute");
  const { generiereUndSpeichereWoche } = await import("@/lib/server/plan-service");
  const { ladeDashboard } = await import("@/lib/server/dashboard-service");
  const { ladeSchlafDetail, letzteSchlafNacht } = await import("@/lib/server/sleep-service");

  await einfuegen("app_settings", [{ key: "profil", value: PROFIL }]);

  const aktivitaeten: Zeile[] = [];
  const benchmarks: Zeile[] = [];
  const profilSim = { ruhepuls: PROFIL.ruhepuls, hfMax: PROFIL.hfMax };
  let laufIdx = 0;

  /** Gesundheit + (ab SCHLAF_AB) Schlafnacht für einen Morgen */
  async function gesundheit(datum: string) {
    const gestern = gen.addTage(datum, -1);
    const last = aktivitaeten
      .filter((a) => (a.start_zeit as Date).toISOString().slice(0, 10) === gestern)
      .reduce((s, a) => s + ((a.dauer_s as number) / 60) * (((a.avg_hr as number) - PROFIL.ruhepuls) / (PROFIL.hfMax - PROFIL.ruhepuls)), 0);
    const erholung = Math.max(0.15, Math.min(1, 0.85 - last / 110 + gen.zw(-0.12, 0.12)));
    const n = datum >= SCHLAF_AB ? gen.schlafNacht(datum, erholung) : null;
    if (n) await einfuegen("sleep_nights", [{ ...n.zeile, zuletzt_synchronisiert: gen.zuerich(datum, 8) }]);
    await einfuegen("daily_health", [
      {
        datum,
        ruhepuls: n?.ruhepuls ?? Math.round(51 - 3 * erholung + gen.zw(-1, 1)),
        hrv_letzte_nacht: n?.hrvMittel ?? Math.round(62 + 22 * erholung + gen.zw(-4, 4)),
        hrv_status: erholung < 0.3 ? "UNBALANCED" : "BALANCED",
        schlaf_dauer_s: n ? Math.round(n.schlafS) : Math.round(gen.zw(6.5, 8) * 3600),
        schlaf_score: n?.score ?? Math.round(60 + 30 * erholung + gen.zw(-5, 5)),
        tiefschlaf_s: n ? Math.round(n.tiefS) : null,
        rem_s: n ? Math.round(n.remS) : null,
        stress_avg: Math.round(gen.zw(20, 34) + 8 * (1 - erholung)),
        body_battery_min: Math.round(gen.zw(10, 24)),
        body_battery_max: n?.bbMax ?? Math.round(62 + 34 * erholung),
        schritte: Math.round(gen.zw(7000, 14500)),
        training_readiness: Math.round(Math.max(18, Math.min(98, 38 + 55 * erholung + gen.zw(-5, 5)))),
        raw: { demo: true },
      },
    ]);
  }

  async function speichere(a: { zeile: Zeile; stream?: Zeile; saetze?: Zeile[] }) {
    aktivitaeten.push(a.zeile);
    await einfuegen("activities", [{ ...a.zeile, synced_at: a.zeile.start_zeit }]);
    if (a.stream) await einfuegen("activity_streams", [a.stream]);
    if (a.saetze?.length) await einfuegen("strength_sets", a.saetze);
  }

  /* ---- Vorlauf ohne Plan: lockere Grundlage + Eingangstest ---- */
  for (let d = VORLAUF_START; d < PLAN_START; d = gen.addTage(d, 1)) {
    uhr(d, 6);
    await gesundheit(d);
    const wt = wochentag(d);
    if ([2, 4].includes(wt) || (wt === 6 && d > "2026-07-04")) {
      const lang = wt === 6;
      await speichere(
        gen.ausdauer({
          datum: d, stunde: lang ? 9 : 18, typ: "running", name: lang ? "Lauf Aare bis Muri" : "Lockerer Lauf",
          routeId: lang ? "aare_lang" : LAUF_RUNDEN[laufIdx++ % 4], profil: profilSim, fortschritt: 0,
          phasen: [{ dauerS: lang ? 4800 : 2700, paceSKm: 402, hr: hrAnteil(0.67) }],
        })
      );
    }
    if ([1, 5].includes(wt)) await speichere(kraftFuerTag(d, [{ id: "", datum: d, typ: "kraft", titel: "Gym", struktur: null }]));
    if (d === "2026-07-04") {
      for (const disz of ["lastlauf", "klimmzuege", "liegestuetze", "rumpf_seitlich", "rumpf_dorsal"]) {
        benchmarks.push({ id: crypto.randomUUID(), datum: d, disziplin: disz, wert: benchmarkWert(disz, d), notiz: "Eingangstest" });
      }
    }
  }

  /* ---- Planwochen ---- */
  const VERPASST = new Set(["2026-08-19", "2026-09-24"]); // realistisch: zwei ausgelassene Einheiten
  for (let montag = PLAN_START; montag <= "2026-11-02"; montag = gen.addTage(montag, 7)) {
    uhr(gen.addTage(montag, -1), 20); // Sonntagabend: Woche planen
    await recomputeAll();
    await generiereUndSpeichereWoche(montag);
    process.stderr.write(`Woche ${montag} geplant (${aktivitaeten.length} Aktivitäten bisher)\n`);
    const einheiten = (await db
      .select()
      .from(schema.plannedWorkouts)
      .orderBy(asc(schema.plannedWorkouts.datum))) as unknown as PlanZeile[];
    for (let i = 0; i < 7; i++) {
      const d = gen.addTage(montag, i);
      if (d > HEUTE) break;
      uhr(d, 6);
      await gesundheit(d);
      const tag = einheiten.filter((e) => e.datum === d);
      for (const e of tag.filter((e) => ["lauf_z2", "intervalle", "huegel_intervalle", "langer_lauf", "lastlauf", "probe_ep"].includes(e.typ))) {
        if (VERPASST.has(d)) continue;
        await speichere(laufFuerEinheit(e, laufIdx++, benchmarks));
      }
      const kraftEinheiten = tag.filter((e) => ["kraft", "klimmzuege", "rumpf", "liegestuetze"].includes(e.typ));
      if (kraftEinheiten.length) await speichere(kraftFuerTag(d, kraftEinheiten));
      // Aktive Erholung am Wochenende ohne Lauf: Wanderung bzw. Velotour
      const ohneLauf = !tag.some((e) => ["lauf_z2", "intervalle", "huegel_intervalle", "langer_lauf", "lastlauf", "probe_ep"].includes(e.typ));
      const wochenNr = Math.round((Date.parse(montag) - Date.parse(PLAN_START)) / 604_800_000);
      if (ohneLauf && wochentag(d) === 0 && wochenNr % 3 === 1 && d < "2026-11-01") {
        await speichere(
          gen.ausdauer({
            datum: d, stunde: 10, typ: "hiking", name: "Wanderung Bantiger", routeId: "bantiger", art: "wandern",
            profil: profilSim, fortschritt: fortschrittAm(d), startDistanz: 0, phasen: [{ dauerS: 11000, paceSKm: 760, hr: hrAnteil(0.4) }],
          })
        );
      } else if (ohneLauf && [0, 6].includes(wochentag(d)) && wochenNr % 3 !== 1 && d < "2026-10-25") {
        const wohlensee = (wochenNr + wochentag(d)) % 2 === 1;
        await speichere(
          gen.ausdauer({
            datum: d, stunde: 14, typ: "cycling", name: wohlensee ? "Velotour Wohlensee" : "Velotour Gürbetal",
            routeId: wohlensee ? "wohlensee" : "guerbetal", art: "velo", profil: profilSim, fortschritt: fortschrittAm(d),
            startDistanz: 0, phasen: [{ dauerS: Math.round(gen.zw(3900, 4700)), paceSKm: 150, hr: hrAnteil(0.55) }],
          })
        );
      }
      // Monatlicher Benchmark-Test (Samstag) zusätzlich zur Probe-EP
      if (["2026-08-08", "2026-09-05"].includes(d)) {
        for (const disz of ["klimmzuege", "liegestuetze", "rumpf_seitlich", "rumpf_dorsal"]) {
          benchmarks.push({ id: crypto.randomUUID(), datum: d, disziplin: disz, wert: benchmarkWert(disz, d), notiz: "Monatstest" });
        }
      }
    }
    // Benchmarks fortlaufend speichern, damit der Plan-Generator sie sieht
    const neu = benchmarks.filter((b) => !b.gespeichert);
    if (neu.length) {
      await einfuegen("ep_benchmarks", neu.map((b) => Object.fromEntries(Object.entries(b).filter(([k]) => k !== "gespeichert"))));
      neu.forEach((b) => (b.gespeichert = true));
    }
  }

  /* ---- Stand „heute" (Do 05.11.2026 20:15) ---- */
  vi.setSystemTime(new Date(DEMO_JETZT));
  await einfuegen("courses", [
    ["gurten", "Gurten-Trail", "2026-09-02"],
    ["bantiger", "Bantiger-Hügelrunde", "2026-09-20"],
    ["bremgartenwald", "Bremgartenwald-Runde", "2026-10-11"],
  ].map(([id, name, datum]) => {
    const k = gen.ROUTEN[id].koordinaten as [number, number, number][];
    let auf = 0;
    let ab = 0;
    for (let i = 1; i < k.length; i++) {
      const dh = k[i][2] - k[i - 1][2];
      if (dh > 0) auf += dh;
      else ab -= dh;
    }
    return {
      id: crypto.randomUUID(),
      name,
      geojson: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: k } },
      distanz_m: Math.round(gen.routenLaenge(id)),
      hm_auf: Math.round(auf * 0.85),
      hm_ab: Math.round(ab * 0.85),
      erstellt_am: gen.zuerich(datum, 19),
    };
  }));
  await recomputeAll();
  await generiereUndSpeichereWoche("2026-11-09");
  await generiereUndSpeichereWoche("2026-11-16");
  await recomputeAll();
  // Zwei kommende Einheiten liegen (simuliert) schon auf der Uhr
  const kommend = (await db.select().from(schema.plannedWorkouts).orderBy(asc(schema.plannedWorkouts.datum))).filter(
    (e) => e.datum > HEUTE && e.struktur != null && e.syncToGarmin && e.typ !== "ep"
  );
  for (const [i, e] of kommend.slice(0, 2).entries()) {
    await db.update(schema.plannedWorkouts).set({ status: "gepusht", garminWorkoutId: 900_000_001 + i }).where(eq(schema.plannedWorkouts.id, e.id));
  }
  await einfuegen("sync_state", [{ key: "activities", value: { lastSyncAt: "2026-11-05T18:58:00.000Z" } }]);

  /* ---------------------------------------------------------- Export */
  rmSync(ZIEL, { recursive: true, force: true });
  mkdirSync(path.join(ZIEL, "aktivitaeten"), { recursive: true });
  mkdirSync(path.join(ZIEL, "schlaf"), { recursive: true });
  const schreibe = (datei: string, daten: unknown) => writeFileSync(path.join(ZIEL, datei), JSON.stringify(daten));
  const anfrage = (pfad: string) => new NextRequest(new URL(pfad, "http://demo.local"));
  const json = async (res: Response) => JSON.parse(JSON.stringify(await res.json()));

  const route = {
    insights: await import("@/app/api/insights/route"),
    body: await import("@/app/api/body/route"),
    model: await import("@/app/api/model/route"),
    benchmarks: await import("@/app/api/benchmarks/route"),
    courses: await import("@/app/api/courses/route"),
    polylines: await import("@/app/api/activities/polylines/route"),
    detail: await import("@/app/api/activities/[id]/route"),
  };

  const liste = await db
    .select({
      id: schema.activities.id,
      typ: schema.activities.typ,
      name: schema.activities.name,
      startZeit: schema.activities.startZeit,
      dauerS: schema.activities.dauerS,
      distanzM: schema.activities.distanzM,
      hmAuf: schema.activities.hmAuf,
      avgHr: schema.activities.avgHr,
      avgPace: schema.activities.avgPace,
      polyline: schema.activities.polyline,
    })
    .from(schema.activities)
    .orderBy(asc(schema.activities.startZeit));
  for (const a of liste) {
    const res = await route.detail.GET(anfrage(`/api/activities/${a.id}`), { params: Promise.resolve({ id: String(a.id) }) });
    schreibe(`aktivitaeten/${a.id}.json`, await json(res));
  }

  const naechte = (await db.select({ datum: schema.sleepNights.datum }).from(schema.sleepNights)).map((n) => n.datum).sort();
  for (const datum of naechte) schreibe(`schlaf/${datum}.json`, { datum, detail: await ladeSchlafDetail(datum) });

  const settingsZeilen = await db.select().from(schema.appSettings);
  const setting = (prefix: string) =>
    Object.fromEntries(settingsZeilen.filter((s) => s.key.startsWith(prefix)).map((s) => [s.key.slice(prefix.length), s.value]));

  const letzteNacht = await letzteSchlafNacht(HEUTE);
  const kern = {
    erzeugt: "scripts/demo/aufnahme.aufnahme.ts",
    hinweis: "Fiktive Testdaten (Alex Muster). Keine echten Garmin- oder Gesundheitsdaten.",
    heute: HEUTE,
    jetzt: DEMO_JETZT,
    dashboard: await ladeDashboard(),
    schlafKachel: letzteNacht ? await ladeSchlafDetail(letzteNacht) : null,
    schlafNaechte: naechte,
    insights: await json(await route.insights.GET()),
    body: await json(await route.body.GET()),
    model: await json(await route.model.GET()),
    courses: (await json(await route.courses.GET())).courses,
    polylines: (await json(await route.polylines.GET())).polylines,
    aktivitaeten: JSON.parse(JSON.stringify(liste)).reverse(),
    lastSync: "2026-11-05T18:58:00.000Z",
    // Antwort der echten Route (inkl. Notenstand), Einstellungen gehören nicht in die Demo
    ...(await json(await route.benchmarks.GET()).then((r: { benchmarks: unknown; prognose: unknown }) => ({
      benchmarks: r.benchmarks,
      benchmarkPrognose: r.prognose,
    }))),
    plan: {
      einheiten: JSON.parse(JSON.stringify(await db.select().from(schema.plannedWorkouts).orderBy(asc(schema.plannedWorkouts.datum)))),
      hinweise: setting("plan_hinweise_"),
      anpassungen: setting("plan_anpassungen_"),
      verfuegbarkeit: setting("plan_verfuegbarkeit_"),
    },
  };
  schreibe("kern.json", kern);
  process.stdout.write(
    `\nDemo-Daten: ${liste.length} Aktivitäten, ${naechte.length} Nächte, ${(kern.benchmarks as unknown[]).length} Benchmarks, ` +
      `${kern.plan.einheiten.length} Plan-Einheiten → ${path.relative(process.cwd(), ZIEL)}\n`
  );
});
