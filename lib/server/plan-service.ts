import { and, desc, eq, gte, isNull, lte } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb, tables } from "@/lib/db";
import { ladeProfil, hrZonen } from "@/lib/profile";
import { aktuellePhase, restwochen } from "@/lib/ep/phasen";
import { generiereWochenplan, Wochenplan } from "@/lib/engine/plan";
import { trainingsPaces } from "@/lib/engine/paces";
import { MuskelId } from "@/lib/engine/muscle";
import { addTage, heuteIso, montagVon, tageDiff } from "@/lib/format";
import { ladeLaufModell } from "./ep-service";
import { istLauf } from "./compute";

/** Trainingsstart für den Wochenindex (Entlastungsrhythmus): fixer Anker */
const TRAININGS_START_MONTAG = "2026-07-13";

export async function generiereUndSpeichereWoche(
  wochenstart?: string
): Promise<Wochenplan> {
  const db = getDb();
  const heute = heuteIso();
  // Standard: aktuelle Woche; sonntags wird bereits die Folgewoche geplant
  const istSonntag = new Date(heute + "T12:00:00").getDay() === 0;
  const start = wochenstart ?? (istSonntag ? addTage(montagVon(heute), 7) : montagVon(heute));
  const montag = montagVon(start);

  const profil = await ladeProfil();
  const phase = aktuellePhase(montag, profil.epDatum);

  /* Vorwochen-Laufminuten aus Aktivitäten */
  const vorwocheVon = addTage(montag, -7);
  const acts = await db
    .select({
      typ: tables.activities.typ,
      startZeit: tables.activities.startZeit,
      dauerS: tables.activities.dauerS,
    })
    .from(tables.activities)
    .where(
      and(
        gte(tables.activities.startZeit, new Date(vorwocheVon + "T00:00:00")),
        lte(tables.activities.startZeit, new Date(montag + "T00:00:00")),
        isNull(tables.activities.deletedAt)
      )
    );
  const vorwocheLaufMin = Math.round(
    acts.filter((a) => istLauf(a.typ)).reduce((s, a) => s + a.dauerS / 60, 0)
  );

  /* TSB/ACWR von heute */
  const fitnessRows = await db
    .select()
    .from(tables.computedDaily)
    .orderBy(desc(tables.computedDaily.datum))
    .limit(1);
  const tsb = fitnessRows[0]?.tsb ?? null;
  const acwr = fitnessRows[0]?.acwr ?? null;

  /* Muskelzustand heute */
  const muskelRows = await db
    .select()
    .from(tables.muscleState)
    .where(eq(tables.muscleState.datum, heute));
  const muscleState: Partial<Record<MuskelId, number>> = {};
  for (const r of muskelRows) {
    muscleState[r.muskelId as MuskelId] = r.restbelastungProzent;
  }

  /* Letzte Benchmarks */
  const benchRows = await db
    .select()
    .from(tables.epBenchmarks)
    .orderBy(desc(tables.epBenchmarks.datum));
  const letzter = (d: string) => benchRows.find((b) => b.disziplin === d)?.wert;

  /* Readiness heute */
  const healthRows = await db
    .select({ readiness: tables.dailyHealth.trainingReadiness })
    .from(tables.dailyHealth)
    .where(eq(tables.dailyHealth.datum, heute));

  /* Paces aus Lauf-Modell */
  const modell = await ladeLaufModell();
  const paces = modell?.fuenfKmS ? trainingsPaces(modell.fuenfKmS) : null;

  /* Letztes Lastlauf-Gewicht aus geplanten Lastläufen */
  const lastlaeufe = await db
    .select()
    .from(tables.plannedWorkouts)
    .where(eq(tables.plannedWorkouts.typ, "lastlauf"))
    .orderBy(desc(tables.plannedWorkouts.datum))
    .limit(1);
  const kgMatch = lastlaeufe[0]?.titel.match(/(\d{1,2})\s*kg/i);
  const letztesLastKg = kgMatch ? parseInt(kgMatch[1], 10) : 4;

  const zonen = hrZonen(profil);
  const plan = generiereWochenplan({
    wochenstart: montag,
    phaseNr: phase.nr,
    restwochen: restwochen(montag, profil.epDatum),
    wochenIndex: Math.max(0, Math.floor(tageDiff(TRAININGS_START_MONTAG, montag) / 7)),
    vorwocheLaufMin,
    tsb,
    acwr,
    muscleState,
    benchmarks: {
      klimmzuege: letzter("klimmzuege"),
      liegestuetze: letzter("liegestuetze"),
      rumpfSeitlichS: letzter("rumpf_seitlich"),
      rumpfDorsalS: letzter("rumpf_dorsal"),
    },
    readiness: healthRows[0]?.readiness ?? null,
    paces,
    zonen: { z2: zonen.z2, z4: zonen.z4, z5: zonen.z5 },
    letztesLastKg,
  });

  /* Persistieren: bestehende, noch nicht absolvierte Einheiten der Woche ersetzen */
  const wochenende = addTage(montag, 6);
  const bestehende = await db
    .select()
    .from(tables.plannedWorkouts)
    .where(
      and(
        gte(tables.plannedWorkouts.datum, montag),
        lte(tables.plannedWorkouts.datum, wochenende)
      )
    );
  for (const b of bestehende) {
    if (b.status === "geplant") {
      await db.delete(tables.plannedWorkouts).where(eq(tables.plannedWorkouts.id, b.id));
    }
  }
  for (const e of plan.einheiten) {
    await db.insert(tables.plannedWorkouts).values({
      id: randomUUID(),
      datum: e.datum,
      phase: plan.phaseNr,
      typ: e.typ,
      titel: e.titel,
      beschreibung: e.beschreibung,
      struktur: e.struktur ?? null,
      erwarteterTrimp: e.erwarteterTrimp ?? null,
      status: "geplant",
    });
  }

  /* Hinweise der Woche ablegen */
  await db
    .insert(tables.appSettings)
    .values({ key: `plan_hinweise_${montag}`, value: plan.hinweise })
    .onConflictDoUpdate({
      target: tables.appSettings.key,
      set: { value: plan.hinweise },
    });

  return plan;
}
