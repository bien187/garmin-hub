import { eq, inArray, isNull } from "drizzle-orm";
import { getDb, tables } from "@/lib/db";
import { analysiereLauf, ABSCHNITT_VERSION, type Abschnitt, type LaufStatus } from "@/lib/engine/aerobe-abschnitte";
import { berechneAerobeLeistung, type AerobeLeistung, type AerobLauf } from "@/lib/engine/aerobe-leistung";
import { medianPaceBeiHr, referenzPulsAusLaeufen } from "@/lib/engine/pace-bei-hr";
import { istLauf } from "@/lib/engine/sport";
import { isoDatum } from "@/lib/format";
import { zonenMitte } from "@/lib/hr-zonen";
import { ladeZonen } from "./zonen-service";

/**
 * Aerobic Performance — Analyse-Cache und Auswertung.
 *
 * Die Zeitreihen sind das grösste Datum in der DB. Jeder Lauf wird deshalb
 * genau einmal analysiert (stabile Abschnitte, Pulsverteilung, Vergleichswert
 * der bisherigen Methode); das kompakte Ergebnis liegt in
 * app_settings["aerobe_analyse"]. Neu analysiert wird nur bei neuen Läufen,
 * nach einem Resync (synced_at) oder wenn sich die Regeln ändern
 * (ABSCHNITT_VERSION). Die Originaldaten bleiben unangetastet.
 *
 * Modell, Normierung und Trend rechnet die reine Engine
 * (lib/engine/aerobe-leistung.ts) bei jedem Aufruf frisch aus dem Cache.
 */

const CACHE_KEY = "aerobe_analyse";
const REF_HR_KEY = "pace_ref_hr";
/** Läufe ab dieser Distanz werden ausgewertet */
const MIN_DISTANZ_M = 1500;

interface CacheEintrag {
  datum: string;
  /** synced_at der Aktivität bei der Analyse — ändert er sich, wird neu analysiert */
  stand: string | null;
  status: LaufStatus;
  ab: Abschnitt[];
  hoehe: boolean;
  hmProKm: number | null;
  bewegungS: number;
  hfAbdeckung: number;
  hfVon: number | null;
  hfS: number[];
  /** bisherige Methode (±3 bpm um altRef), s/km */
  alt: number | null;
  altRef: number;
}

interface Cache {
  version: number;
  laeufe: Record<string, CacheEintrag>;
}

interface LaufZeile {
  id: number;
  typ: string;
  startZeit: Date;
  dauerS: number;
  distanzM: number | null;
  hmAuf: number | null;
  avgHr: number | null;
  syncedAt: Date | null;
}

async function ladeCache(): Promise<Cache> {
  const db = getDb();
  const rows = await db.select().from(tables.appSettings).where(eq(tables.appSettings.key, CACHE_KEY));
  const wert = rows[0]?.value as Cache | undefined;
  if (!wert || wert.version !== ABSCHNITT_VERSION || typeof wert.laeufe !== "object") {
    return { version: ABSCHNITT_VERSION, laeufe: {} };
  }
  return wert;
}

async function speichereCache(cache: Cache): Promise<void> {
  const db = getDb();
  await db
    .insert(tables.appSettings)
    .values({ key: CACHE_KEY, value: cache })
    .onConflictDoUpdate({ target: tables.appSettings.key, set: { value: cache } });
}

async function ladeLaeufe(): Promise<LaufZeile[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: tables.activities.id,
      typ: tables.activities.typ,
      startZeit: tables.activities.startZeit,
      dauerS: tables.activities.dauerS,
      distanzM: tables.activities.distanzM,
      hmAuf: tables.activities.hmAuf,
      avgHr: tables.activities.avgHr,
      syncedAt: tables.activities.syncedAt,
    })
    .from(tables.activities)
    .where(isNull(tables.activities.deletedAt));
  return rows.filter((a) => istLauf(a.typ) && (a.distanzM ?? 0) >= MIN_DISTANZ_M);
}

/**
 * Referenzpuls der Hauptreihe. Einmal aus den eigenen lockeren Läufen
 * bestimmt (referenzPulsAusLaeufen) und dann festgeschrieben, damit Werte
 * über die Zeit vergleichbar bleiben — auch mit der bisherigen Kurve.
 * Gespeichert wird erst, wenn er aus mindestens fünf Läufen stammt.
 */
export async function referenzpuls(laeufe: { dauerS: number; avgHr: number | null }[]): Promise<number> {
  const db = getDb();
  const rows = await db.select().from(tables.appSettings).where(eq(tables.appSettings.key, REF_HR_KEY));
  const gespeichert = (rows[0]?.value as { refHr?: number } | undefined)?.refHr;
  if (typeof gespeichert === "number" && gespeichert > 0) return gespeichert;

  const zonen = await ladeZonen("running");
  const wert = referenzPulsAusLaeufen(laeufe, { von: zonen.z2.von, bis: zonen.z3.bis }, zonenMitte(zonen.z2));
  const belastbar = laeufe.filter((l) => l.dauerS >= 20 * 60 && l.avgHr != null && l.avgHr > 0).length >= 5;
  if (belastbar) {
    await db
      .insert(tables.appSettings)
      .values({ key: REF_HR_KEY, value: { refHr: wert } })
      .onConflictDoUpdate({ target: tables.appSettings.key, set: { value: { refHr: wert } } });
  }
  return wert;
}

const standVon = (a: LaufZeile) => (a.syncedAt ? new Date(a.syncedAt).toISOString() : null);

interface Stand {
  laeufe: LaufZeile[];
  refHr: number;
  cache: Cache;
  /** noch nicht (neu) analysierte Läufe */
  offen: number;
}

/**
 * Analysiert neue oder geänderte Läufe innerhalb eines Zeitbudgets (die
 * Function hat 60 s). Was nicht fertig wird, folgt beim nächsten Aufruf.
 * Gibt die Zahl der noch offenen Läufe zurück.
 */
export async function aktualisiereAerobeAnalyse(budgetMs: number): Promise<{ offen: number }> {
  const { offen } = await aktualisiere(budgetMs);
  return { offen };
}

async function aktualisiere(budgetMs: number): Promise<Stand> {
  const start = performance.now();
  const db = getDb();
  const laeufe = await ladeLaeufe();
  const refHr = await referenzpuls(laeufe);
  const cache = await ladeCache();

  let geaendert = false;
  const ids = new Set(laeufe.map((l) => String(l.id)));
  for (const id of Object.keys(cache.laeufe)) {
    if (!ids.has(id)) {
      delete cache.laeufe[id];
      geaendert = true;
    }
  }

  const offen = laeufe
    .filter((a) => {
      const e = cache.laeufe[String(a.id)];
      return !e || e.stand !== standVon(a) || e.altRef !== refHr;
    })
    // neueste zuerst: die aktuelle Entwicklung steht als Erstes
    .sort((a, b) => new Date(b.startZeit).getTime() - new Date(a.startZeit).getTime());

  let erledigt = 0;
  for (let i = 0; i < offen.length; i += 8) {
    if (performance.now() - start > budgetMs) break;
    const chunk = offen.slice(i, i + 8);
    const streams = await db
      .select({
        activityId: tables.activityStreams.activityId,
        zeitS: tables.activityStreams.zeitS,
        distanzM: tables.activityStreams.distanzM,
        hr: tables.activityStreams.hr,
        ele: tables.activityStreams.ele,
      })
      .from(tables.activityStreams)
      .where(inArray(tables.activityStreams.activityId, chunk.map((c) => c.id)));
    for (const a of chunk) {
      const s = streams.find((x) => x.activityId === a.id);
      let analyse = analysiereLauf({ zeitS: [], distanzM: [], hr: [] });
      let alt: { paceSKm: number } | null = null;
      if (s?.zeitS && s.distanzM && s.hr) {
        const z = { zeitS: s.zeitS, distanzM: s.distanzM, hr: s.hr, ele: s.ele };
        try {
          analyse = analysiereLauf(z);
          alt = medianPaceBeiHr(z, { refHr });
        } catch {
          // defekte Zeitreihe: als „keine Zeitreihen" vermerken statt bei jedem Aufruf erneut zu scheitern
        }
      }
      const km = (a.distanzM ?? 0) / 1000;
      cache.laeufe[String(a.id)] = {
        datum: isoDatum(new Date(a.startZeit)),
        stand: standVon(a),
        status: analyse.status,
        ab: analyse.abschnitte,
        hoehe: analyse.hoehe,
        hmProKm: a.hmAuf != null && km > 0 ? Math.round((a.hmAuf / km) * 10) / 10 : null,
        bewegungS: analyse.bewegungS,
        hfAbdeckung: analyse.hfAbdeckung,
        hfVon: analyse.hfVon,
        hfS: analyse.hfS,
        alt: alt ? Math.round(alt.paceSKm * 10) / 10 : null,
        altRef: refHr,
      };
      erledigt++;
      geaendert = true;
    }
  }
  if (geaendert) await speichereCache(cache);
  return { laeufe, refHr, cache, offen: offen.length - erledigt };
}

/**
 * Auswertung für das Dashboard. Stehen noch Läufe aus (z.B. direkt nach
 * dem Update: alle historischen Läufe), wird ein kurzes Stück weiter
 * analysiert; der Rest folgt beim nächsten Laden oder Sync.
 */
export async function ladeAerobeLeistung(heute: string): Promise<AerobeLeistung | null> {
  let stand: Stand;
  try {
    stand = await aktualisiere(6000);
  } catch {
    // Analyse fehlgeschlagen (z.B. Zeitreihe defekt): mit dem vorhandenen Cache weiter
    const laeufe = await ladeLaeufe();
    stand = { laeufe, refHr: await referenzpuls(laeufe), cache: await ladeCache(), offen: 0 };
  }
  const { laeufe, refHr, cache, offen } = stand;
  const zonen = await ladeZonen("running");
  const eintraege: AerobLauf[] = [];
  let fehlend = 0;
  for (const a of laeufe) {
    const e = cache.laeufe[String(a.id)];
    if (!e) {
      fehlend++;
      continue;
    }
    eintraege.push({
      id: a.id,
      datum: e.datum,
      status: e.status,
      abschnitte: e.ab,
      hoehe: e.hoehe,
      hmProKm: e.hmProKm,
      hfAbdeckung: e.hfAbdeckung,
      hfVon: e.hfVon,
      hfS: e.hfS,
      alt: e.altRef === refHr ? e.alt : null,
    });
  }
  return berechneAerobeLeistung({
    laeufe: eintraege,
    refHr,
    zone2: { von: zonen.z2.von, bis: zonen.z2.bis, quelle: zonen.quelle },
    heute,
    offen: Math.max(offen, fehlend),
  });
}
