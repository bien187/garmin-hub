import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { getDb, tables } from "@/lib/db";
import { ladeProfil, PROFIL_DEFAULTS, Profil } from "@/lib/profile";
import { EpPrognose, berechneEpPrognose } from "@/lib/ep/prognose";
import { EP_DATUM } from "@/lib/ep/konstanten";
import { ladeEpPrognose } from "./ep-service";
import { addTage, heuteIso, isoDatum, montagVon } from "@/lib/format";
import { MuskelId } from "@/lib/engine/muscle";
import { verlaufSeitTrainingsstart, type PaceWoche } from '@/lib/engine/fortschritt';
import { recomputeAll } from './compute';

export interface DashboardDaten {
  dbBereit: boolean;
  profil: Profil;
  heuteHealth: {
    trainingReadiness: number | null;
    bodyBatteryMax: number | null;
    hrvStatus: string | null;
    hrvLetzteNacht: number | null;
    schlafScore: number | null;
    ruhepuls: number | null;
  };
  /** Erster Tag mit Trainingsdaten: min(datum) computed_daily, nie vor der ersten nicht gelöschten Aktivität (trainingsstartAus) */
  trainingsstart: string | null;
  /** CTL/ATL/TSB je Tag seit Trainingsstart bis heute */
  fitness: { datum: string; ctl: number; atl: number; tsb: number }[];
  tsbHeute: number | null;
  acwrHeute: number | null;
  epPrognose: EpPrognose;
  muskelnHeute: Partial<Record<MuskelId, number>>;
  letzteAktivitaet: {
    id: number;
    name: string | null;
    typ: string;
    startZeit: string;
    dauerS: number;
    distanzM: number | null;
  } | null;
  naechsteEinheit: { id: string; datum: string; titel: string; typ: string } | null;
  woche: { km: number; hm: number };
  vorwoche: { km: number; hm: number };
  allTime: AllTimeStats;
  paceFortschritt: { refHr: number | null; wochen: PaceWoche[]; letzteMessung: string | null };
}

/** Summenwerte über die gesamte Historie */
export interface AllTimeStats {
  aktivitaeten: number;
  distanzKm: number;
  laufKm: number;
  hm: number;
  stunden: number;
  kalorien: number;
  laengsterLaufKm: number;
  seit: string | null;
}

/** Ein Punkt der Fortschrittskurve (Wochenmontag → Pace bei Referenzpuls) */
export type { PaceWoche } from '@/lib/engine/fortschritt';

const ALL_TIME_LEER: AllTimeStats = {
  aktivitaeten: 0,
  distanzKm: 0,
  laufKm: 0,
  hm: 0,
  stunden: 0,
  kalorien: 0,
  laengsterLaufKm: 0,
  seit: null,
};

const LEER: DashboardDaten = {
  dbBereit: false,
  profil: PROFIL_DEFAULTS,
  heuteHealth: {
    trainingReadiness: null,
    bodyBatteryMax: null,
    hrvStatus: null,
    hrvLetzteNacht: null,
    schlafScore: null,
    ruhepuls: null,
  },
  trainingsstart: null,
  fitness: [],
  tsbHeute: null,
  acwrHeute: null,
  epPrognose: berechneEpPrognose([], heuteIso(), EP_DATUM),
  muskelnHeute: {},
  letzteAktivitaet: null,
  naechsteEinheit: null,
  woche: { km: 0, hm: 0 },
  vorwoche: { km: 0, hm: 0 },
  allTime: ALL_TIME_LEER,
  paceFortschritt: { refHr: null, wochen: [], letzteMessung: null },
};

export async function ladeDashboard(): Promise<DashboardDaten> {
  try {
    const db = getDb();
    const heute = heuteIso();
    // Auch nach einem Tageswechsel ohne neuen Sync bis heute berechnen.
    const [stand] = await db.select({datum:tables.computedDaily.datum}).from(tables.computedDaily)
      .where(lte(tables.computedDaily.datum, heute)).orderBy(desc(tables.computedDaily.datum)).limit(1);
    if (!stand || stand.datum < heute) await recomputeAll();
    const profil = await ladeProfil();

    const [
      healthRows,
      fitnessRows,
      muskelRows,
      letzteActs,
      naechste,
      summenRows,
      refHrRows,
    ] = await Promise.all([
        db.select().from(tables.dailyHealth).where(eq(tables.dailyHealth.datum, heute)),
        /* Gesamte Historie bis heute: computed_daily beginnt am ersten
           Trainingstag (lückenlose Tagesserie aus compute.ts). Bei ~130–400
           Zeilen ist das unkritisch und wird nicht ausgedünnt. */
        db
          .select()
          .from(tables.computedDaily)
          .where(lte(tables.computedDaily.datum, heute))
          .orderBy(asc(tables.computedDaily.datum)),
        db.select().from(tables.muscleState).where(eq(tables.muscleState.datum, heute)),
        db
          .select({
            id: tables.activities.id,
            name: tables.activities.name,
            typ: tables.activities.typ,
            startZeit: tables.activities.startZeit,
            dauerS: tables.activities.dauerS,
            distanzM: tables.activities.distanzM,
          })
          .from(tables.activities)
          .where(isNull(tables.activities.deletedAt))
          .orderBy(desc(tables.activities.startZeit))
          .limit(1),
        db
          .select({
            id: tables.plannedWorkouts.id,
            datum: tables.plannedWorkouts.datum,
            titel: tables.plannedWorkouts.titel,
            typ: tables.plannedWorkouts.typ,
          })
          .from(tables.plannedWorkouts)
          .where(
            and(
              gte(tables.plannedWorkouts.datum, heute),
              inArray(tables.plannedWorkouts.status, ["geplant", "gepusht"])
            )
          )
          .orderBy(asc(tables.plannedWorkouts.datum))
          .limit(1),
        /* All-Time-Summen — eine Aggregation in der DB statt aller Zeilen
           im Speicher. FILTER trennt die Lauf-Anteile ab. */
        db
          .select({
            anzahl: sql<number>`count(*)::int`,
            dauerS: sql<number>`coalesce(sum(${tables.activities.dauerS}), 0)`,
            distanzM: sql<number>`coalesce(sum(${tables.activities.distanzM}), 0)`,
            hm: sql<number>`coalesce(sum(${tables.activities.hmAuf}), 0)`,
            kalorien: sql<number>`coalesce(sum(${tables.activities.kalorien}), 0)`,
            laufDistanzM: sql<number>`coalesce(sum(${tables.activities.distanzM}) filter (where ${tables.activities.typ} like '%running%'), 0)`,
            laengsterLaufM: sql<number>`coalesce(max(${tables.activities.distanzM}) filter (where ${tables.activities.typ} like '%running%'), 0)`,
            seit: sql<string | null>`min(${tables.activities.startZeit})`,
          })
          .from(tables.activities)
          .where(isNull(tables.activities.deletedAt)),
        db
          .select()
          .from(tables.appSettings)
          .where(eq(tables.appSettings.key, "pace_ref_hr")),
      ]);

    const { prognose } = await ladeEpPrognose();

    const h = healthRows[0];
    const letzterTag = fitnessRows[fitnessRows.length - 1];

    const montag = montagVon(heute);
    const vorMontag = addTage(montag, -7);
    const summe = (von: string, bis: string) => {
      const rows = fitnessRows.filter((r) => r.datum >= von && r.datum <= bis);
      return {
        km: Math.round(rows.reduce((s, r) => s + r.laufKm, 0) * 10) / 10,
        hm: Math.round(rows.reduce((s, r) => s + r.hm, 0)),
      };
    };

    const muskelnHeute: Partial<Record<MuskelId, number>> = {};
    for (const m of muskelRows) {
      muskelnHeute[m.muskelId as MuskelId] = m.restbelastungProzent;
    }

    const s = summenRows[0];
    const allTime: AllTimeStats = {
      aktivitaeten: Number(s?.anzahl ?? 0),
      distanzKm: Math.round(Number(s?.distanzM ?? 0) / 1000),
      laufKm: Math.round(Number(s?.laufDistanzM ?? 0) / 1000),
      hm: Math.round(Number(s?.hm ?? 0)),
      stunden: Math.round(Number(s?.dauerS ?? 0) / 3600),
      kalorien: Math.round(Number(s?.kalorien ?? 0)),
      laengsterLaufKm: Math.round(Number(s?.laengsterLaufM ?? 0) / 100) / 10,
      seit: s?.seit ? new Date(s.seit).toISOString().slice(0, 10) : null,
    };

    // Kalendertag wie in compute.ts (isoDatum), damit Start und Serie übereinstimmen
    const ersteAktivitaet = s?.seit ? isoDatum(new Date(s.seit)) : null;
    const { trainingsstart, verlauf, fortschritt } = verlaufSeitTrainingsstart(fitnessRows, heute, ersteAktivitaet);
    const refHrWert = (refHrRows[0]?.value as { refHr?: number } | undefined)?.refHr;

    return {
      dbBereit: true,
      profil,
      heuteHealth: {
        trainingReadiness: h?.trainingReadiness ?? null,
        bodyBatteryMax: h?.bodyBatteryMax ?? null,
        hrvStatus: h?.hrvStatus ?? null,
        hrvLetzteNacht: h?.hrvLetzteNacht ?? null,
        schlafScore: h?.schlafScore ?? null,
        ruhepuls: h?.ruhepuls ?? profil.ruhepuls,
      },
      trainingsstart,
      fitness: verlauf.map((r) => ({
        datum: r.datum,
        ctl: Math.round(r.ctl * 10) / 10,
        atl: Math.round(r.atl * 10) / 10,
        tsb: Math.round(r.tsb * 10) / 10,
      })),
      tsbHeute: letzterTag ? Math.round(letzterTag.tsb) : null,
      acwrHeute: letzterTag?.acwr != null ? Math.round(letzterTag.acwr * 100) / 100 : null,
      epPrognose: prognose,
      muskelnHeute,
      letzteAktivitaet: letzteActs[0]
        ? { ...letzteActs[0], startZeit: letzteActs[0].startZeit.toISOString() }
        : null,
      naechsteEinheit: naechste[0] ?? null,
      woche: summe(montag, heute),
      vorwoche: summe(vorMontag, addTage(montag, -1)),
      allTime,
      paceFortschritt: {
        refHr: typeof refHrWert === "number" ? refHrWert : null,
        ...fortschritt,
      },
    };
  } catch {
    return LEER;
  }
}
