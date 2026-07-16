import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import { getDb, tables } from "@/lib/db";
import { ladeProfil, PROFIL_DEFAULTS, Profil } from "@/lib/profile";
import { EpPrognose, berechneEpPrognose } from "@/lib/ep/prognose";
import { ladeEpPrognose } from "./ep-service";
import { addTage, heuteIso, montagVon } from "@/lib/format";
import { MuskelId } from "@/lib/engine/muscle";

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
}

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
  fitness: [],
  tsbHeute: null,
  acwrHeute: null,
  epPrognose: berechneEpPrognose([], heuteIso(), PROFIL_DEFAULTS.epDatum),
  muskelnHeute: {},
  letzteAktivitaet: null,
  naechsteEinheit: null,
  woche: { km: 0, hm: 0 },
  vorwoche: { km: 0, hm: 0 },
};

export async function ladeDashboard(): Promise<DashboardDaten> {
  try {
    const db = getDb();
    const heute = heuteIso();
    const profil = await ladeProfil();

    const [healthRows, fitnessRows, muskelRows, letzteActs, naechste] =
      await Promise.all([
        db.select().from(tables.dailyHealth).where(eq(tables.dailyHealth.datum, heute)),
        db
          .select()
          .from(tables.computedDaily)
          .where(gte(tables.computedDaily.datum, addTage(heute, -90)))
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
      fitness: fitnessRows.map((r) => ({
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
    };
  } catch {
    return LEER;
  }
}
