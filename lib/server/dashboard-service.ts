import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { getDb, tables } from "@/lib/db";
import { ladeProfil, PROFIL_DEFAULTS, Profil } from "@/lib/profile";
import { addTage, heuteIso, isoDatum, montagVon } from "@/lib/format";
import { PROGRAMM_START, trainingsblock, type Trainingsblock } from "@/lib/engine/block";
import {
  wochenFortschritt,
  wochenTage,
  wochenVerlauf,
  wochenwerte,
  type StatAktivitaet,
  type VerlaufWoche,
  type WochenTag,
  type Wochenwerte,
} from "@/lib/engine/wochenstatistik";
import { MuskelId } from "@/lib/engine/muscle";
import { verlaufSeitTrainingsstart, type PaceWoche } from '@/lib/engine/fortschritt';
import { recomputeAll } from './compute';
import { berechneKonsistenz, type Konsistenz } from '@/lib/engine/konsistenz';
import { gewichtKurzAus, ladeGewicht, type GewichtKurz } from './gewicht-service';

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
  muskelnHeute: Partial<Record<MuskelId, number>>;
  /** die letzten Aktivitäten, neueste zuerst */
  letzteAktivitaeten: DashboardAktivitaet[];
  /** nächste geplante Trainingseinheit ab heute (ohne Ruhetage) */
  naechsteEinheit: NaechsteEinheit | null;
  /** Blockwoche der laufenden Woche */
  block: Trainingsblock;
  /** Kennzahlen der laufenden Woche (bis heute) und der ganzen Vorwoche */
  woche: Wochenwerte;
  vorwoche: Wochenwerte;
  /** Mo–So der laufenden Woche: Plan + Aktivitäten */
  wochenTage: WochenTag[];
  /** erledigte von geplanten Trainingseinheiten der laufenden Woche */
  wochenFortschritt: { erledigt: number; geplant: number };
  /** Wochenverlauf der letzten 12 Wochen */
  verlauf: VerlaufWoche[];
  allTime: AllTimeStats;
  paceFortschritt: { refHr: number | null; wochen: PaceWoche[]; letzteMessung: string | null };
  /** Trainingsstunden der letzten 12 Wochen + Serie (fehlt in älteren Demo-Daten) */
  konsistenz?: Konsistenz;
  /** Gewichtskarte (Smart Weight Tracking); null ohne Messungen */
  gewicht: GewichtKurz | null;
}

export interface DashboardAktivitaet {
  id: number;
  name: string | null;
  typ: string;
  startZeit: string;
  dauerS: number;
  distanzM: number | null;
  hmAuf: number | null;
  avgHr: number | null;
  avgPace: number | null;
}

export interface NaechsteEinheit {
  id: string;
  datum: string;
  titel: string;
  typ: string;
  beschreibung: string | null;
  struktur: unknown;
  erwarteterTrimp: number | null;
  status: string;
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

const WOCHE_LEER: Wochenwerte = {
  einheiten: 0,
  dauerS: 0,
  laeufe: 0,
  laufKm: 0,
  laufDauerS: 0,
  laufPaceSKm: null,
  avgHr: null,
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
  muskelnHeute: {},
  letzteAktivitaeten: [],
  naechsteEinheit: null,
  block: trainingsblock(heuteIso()),
  woche: WOCHE_LEER,
  vorwoche: WOCHE_LEER,
  wochenTage: [],
  wochenFortschritt: { erledigt: 0, geplant: 0 },
  verlauf: [],
  allTime: ALL_TIME_LEER,
  paceFortschritt: { refHr: null, wochen: [], letzteMessung: null },
  gewicht: null,
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

    const montag = montagVon(heute);
    const [
      healthRows,
      fitnessRows,
      muskelRows,
      letzteActs,
      naechste,
      summenRows,
      refHrRows,
      dauerRows,
      wochenPlan,
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
            hmAuf: tables.activities.hmAuf,
            avgHr: tables.activities.avgHr,
            avgPace: tables.activities.avgPace,
          })
          .from(tables.activities)
          .where(isNull(tables.activities.deletedAt))
          .orderBy(desc(tables.activities.startZeit))
          .limit(5),
        db
          .select({
            id: tables.plannedWorkouts.id,
            datum: tables.plannedWorkouts.datum,
            titel: tables.plannedWorkouts.titel,
            typ: tables.plannedWorkouts.typ,
            beschreibung: tables.plannedWorkouts.beschreibung,
            struktur: tables.plannedWorkouts.struktur,
            erwarteterTrimp: tables.plannedWorkouts.erwarteterTrimp,
            status: tables.plannedWorkouts.status,
          })
          .from(tables.plannedWorkouts)
          .where(
            and(
              gte(tables.plannedWorkouts.datum, heute),
              // Erst ab Programmstart: frühere Einträge gehören zum Archiv
              gte(tables.plannedWorkouts.datum, PROGRAMM_START),
              inArray(tables.plannedWorkouts.status, ["geplant", "gepusht"]),
              ne(tables.plannedWorkouts.typ, "ruhe")
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
        /* Kennwerte je Aktivität für Konsistenz, Wochenstatistik und Verlauf
           (ganze Historie, damit die Serie über 12 Wochen hinaus zählt) */
        db
          .select({
            startZeit: tables.activities.startZeit,
            typ: tables.activities.typ,
            dauerS: tables.activities.dauerS,
            distanzM: tables.activities.distanzM,
            avgHr: tables.activities.avgHr,
          })
          .from(tables.activities)
          .where(isNull(tables.activities.deletedAt)),
        /* Plan der laufenden Woche (Wochenstreifen + Fortschritt) */
        montag >= PROGRAMM_START
          ? db
              .select({
                datum: tables.plannedWorkouts.datum,
                typ: tables.plannedWorkouts.typ,
                titel: tables.plannedWorkouts.titel,
                status: tables.plannedWorkouts.status,
              })
              .from(tables.plannedWorkouts)
              .where(
                and(
                  gte(tables.plannedWorkouts.datum, montag),
                  lte(tables.plannedWorkouts.datum, addTage(montag, 6))
                )
              )
          : Promise.resolve([] as { datum: string; typ: string; titel: string; status: string }[]),
      ]);

    const gewicht = gewichtKurzAus(await ladeGewicht(), heute);

    const h = healthRows[0];
    const letzterTag = fitnessRows[fitnessRows.length - 1];

    const vorMontag = addTage(montag, -7);
    const statAkts: StatAktivitaet[] = dauerRows.map((a) => ({
      datum: isoDatum(new Date(a.startZeit)),
      typ: a.typ,
      dauerS: a.dauerS,
      distanzM: a.distanzM,
      avgHr: a.avgHr,
    }));

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
      muskelnHeute,
      letzteAktivitaeten: letzteActs.map((a) => ({ ...a, startZeit: a.startZeit.toISOString() })),
      naechsteEinheit: naechste[0] ?? null,
      block: trainingsblock(heute),
      woche: wochenwerte(statAkts, montag, heute),
      vorwoche: wochenwerte(statAkts, vorMontag, addTage(montag, -1)),
      wochenTage: wochenTage(montag, wochenPlan, statAkts),
      wochenFortschritt: wochenFortschritt(wochenPlan),
      verlauf: wochenVerlauf(statAkts, heute),
      allTime,
      konsistenz: berechneKonsistenz(statAkts, heute, profil.wochenBudgetH ?? null),
      paceFortschritt: {
        refHr: typeof refHrWert === "number" ? refHrWert : null,
        ...fortschritt,
      },
      gewicht,
    };
  } catch {
    return LEER;
  }
}
