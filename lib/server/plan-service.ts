import { and, desc, eq, gte, isNull, lt, lte, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb, tables } from "@/lib/db";
import { planeVerfuegbarkeit } from '@/lib/engine/verfuegbarkeit';
import { ladeProfil } from "@/lib/profile";
import { ladeZonen } from "./zonen-service";
import { aktuellePhase, restwochen } from "@/lib/ep/phasen";
import { generiereWochenplan, Wochenplan, z2Lauf } from "@/lib/engine/plan";
import { trainingsPaces } from "@/lib/engine/paces";
import { MuskelId } from "@/lib/engine/muscle";
import { trimpFuerEinheit } from "@/lib/engine/trimp";
import {
  berechneAnpassungen,
  type AnpassungsAktivitaet,
} from "@/lib/engine/plan-anpassung";
import { addTage, heuteIso, isoDatum, montagVon, tageDiff } from "@/lib/format";
import { ladeLaufModell } from "./ep-service";

/**
 * Standard, ob eine Einheit an Garmin geht — explizit über den Typ, NICHT
 * über Namens-Matching. Gym-/nicht-pushbare Einheiten werden ausgeschlossen.
 * Pro Einheit in der UI überschreibbar.
 */
export function standardSyncToGarmin(typ: string): boolean {
  return !["kraft", "klimmzuege", "gtg", "ruhe", "probe_ep", "liegestuetze"].includes(
    typ
  );
}
import { istKraft, istLauf } from "./compute";

/** Trainingsstart für den Wochenindex (Entlastungsrhythmus): fixer Anker */
const TRAININGS_START_MONTAG = "2026-07-13";

export async function generiereUndSpeichereWoche(
  wochenstart?: string,
  nichtVerfuegbar?: string[]
): Promise<Wochenplan> {
  return getDb().transaction(async (db) => {
    const heute = heuteIso();
    // Standard: aktuelle Woche; sonntags wird bereits die Folgewoche geplant
    const istSonntag = new Date(heute + "T12:00:00").getDay() === 0;
    const start = wochenstart ?? (istSonntag ? addTage(montagVon(heute), 7) : montagVon(heute));
    const montag = montagVon(start);

    await db.execute(sql`select pg_advisory_xact_lock(hashtext(${montag}))`);
    const key = 'plan_verfuegbarkeit_' + montag;
    const [settings] = await db.select().from(tables.appSettings).where(eq(tables.appSettings.key, key));
    const gesperrt = nichtVerfuegbar ?? (settings?.value as string[] | undefined) ?? [];
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
      .where(and(eq(tables.plannedWorkouts.typ, "lastlauf"), lt(tables.plannedWorkouts.datum, montag)))
      .orderBy(desc(tables.plannedWorkouts.datum))
      .limit(1);
    const kgMatch = lastlaeufe[0]?.titel.match(/(\d{1,2})\s*kg/i);
    const letztesLastKg = kgMatch ? parseInt(kgMatch[1], 10) : 4;

    // Laufzonen wie auf der Uhr: nur so trifft ein „Zone 2"-Plan auch die
    // Zone 2, die die FR 265 später in der Aktivität ausweist.
    const zonen = await ladeZonen("running");
    let plan = generiereWochenplan({
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
    // Erledigte, verpasste und bereits übertragene Tage bleiben erhalten.
    const belegt = [...new Set(bestehende.filter(b => b.status !== 'geplant' || b.garminWorkoutId != null).map(b => b.datum))];
    if (nichtVerfuegbar && bestehende.some(b => gesperrt.includes(b.datum) && b.datum >= heute && (b.status === 'gepusht' || b.garminWorkoutId != null) && b.status !== 'absolviert')) {
      throw new Error('Bitte die Einheiten dieses Tages zuerst mit «Von der Uhr entfernen» zurückholen, danach den Tag sperren.');
    }
    const festeHarteTage = bestehende.filter(b => belegt.includes(b.datum) && ['intervalle', 'huegel_intervalle', 'lastlauf', 'langer_lauf', 'probe_ep'].includes(b.typ)).map(b => b.datum);
    const harteTageAb = addTage(montag, Math.max(muscleState.quadrizeps ?? 0, muscleState.waden ?? 0) >= 60 ? 2 : 1);
    plan = planeVerfuegbarkeit(plan, gesperrt, heute, belegt, festeHarteTage, harteTageAb);
    for (const b of bestehende) {
      if (b.datum >= heute && b.status === 'geplant' && b.garminWorkoutId == null && (!belegt.includes(b.datum) || gesperrt.includes(b.datum))) {
        await db.delete(tables.plannedWorkouts).where(eq(tables.plannedWorkouts.id, b.id));
      }
    }
    await db.insert(tables.appSettings).values({key, value:gesperrt})
      .onConflictDoUpdate({target:tables.appSettings.key, set:{value:gesperrt}});
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
        syncToGarmin: standardSyncToGarmin(e.typ),
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

    /* Frisch generierte Woche: alte Anpassungs-Protokolle gelten nicht mehr,
       ihre Einheiten-IDs existieren nicht einmal mehr. */
    await db
      .delete(tables.appSettings)
      .where(eq(tables.appSettings.key, anpassungsKey(montag)));

    return plan;
  });
}

/* ------------------------------------------------------------------ */
/* Laufende Anpassung nach jedem Sync                                  */
/* ------------------------------------------------------------------ */

const anpassungsKey = (montag: string) => `plan_anpassungen_${montag}`;

/** Ein protokollierter Eingriff, wie ihn die Plan-Seite anzeigt */
export interface ProtokollEintrag {
  einheitId: string;
  datum: string;
  alterTitel: string;
  neuerTitel: string;
  grund: string;
  bereitsGepusht: boolean;
  zeitpunkt: string;
}

export async function ladeAnpassungen(montag: string): Promise<ProtokollEintrag[]> {
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(tables.appSettings)
      .where(eq(tables.appSettings.key, anpassungsKey(montag)));
    return (rows[0]?.value as ProtokollEintrag[] | undefined) ?? [];
  } catch {
    return [];
  }
}

/**
 * Geht die laufende Woche durch und passt noch offene Einheiten an die
 * tatsächliche Belastung an. Läuft nach jedem Sync (aus `recomputeAll`).
 *
 * Bereits an die Uhr gesendete Einheiten werden hier zwar lokal angepasst,
 * aber bewusst NICHT stillschweigend bei Garmin überschrieben — sonst
 * stimmt das, was auf der Uhr liegt, nicht mehr mit dem überein, was die
 * App zeigt. Stattdessen wird das im Protokoll vermerkt, damit man sie
 * bewusst neu senden kann.
 */
export async function passePlanAn(): Promise<ProtokollEintrag[]> {
  const db = getDb();
  const heute = heuteIso();
  const montag = montagVon(heute);
  const sonntag = addTage(montag, 6);

  const einheiten = await db
    .select()
    .from(tables.plannedWorkouts)
    .where(
      and(
        gte(tables.plannedWorkouts.datum, montag),
        lte(tables.plannedWorkouts.datum, sonntag)
      )
    );
  if (einheiten.length === 0) return [];

  const profil = await ladeProfil();

  /* Aktivitäten der letzten 10 Tage inkl. TRIMP und Zuordnung zum Plan */
  const seit = new Date(addTage(heute, -10) + "T00:00:00");
  const acts = await db
    .select({
      id: tables.activities.id,
      typ: tables.activities.typ,
      startZeit: tables.activities.startZeit,
      dauerS: tables.activities.dauerS,
      avgHr: tables.activities.avgHr,
    })
    .from(tables.activities)
    .where(and(gte(tables.activities.startZeit, seit), isNull(tables.activities.deletedAt)));

  const zugeordnet = new Set(
    einheiten.map((e) => e.matchedActivityId).filter((id): id is number => id != null)
  );

  const aktivitaeten: AnpassungsAktivitaet[] = acts.map((a) => ({
    id: a.id,
    datum: isoDatum(new Date(a.startZeit)),
    istLauf: istLauf(a.typ),
    istKraft: istKraft(a.typ),
    trimp: trimpFuerEinheit({
      dauerS: a.dauerS,
      avgHr: a.avgHr,
      istKraft: istKraft(a.typ),
      hrRuhe: profil.ruhepuls,
      hrMax: profil.hfMax,
    }),
    eingeplant: zugeordnet.has(a.id),
  }));

  const [letzterTag] = await db
    .select()
    .from(tables.computedDaily)
    .orderBy(desc(tables.computedDaily.datum))
    .limit(1);

  const muskelRows = await db
    .select()
    .from(tables.muscleState)
    .where(eq(tables.muscleState.datum, heute));
  const muskeln: Partial<Record<MuskelId, number>> = {};
  for (const r of muskelRows) muskeln[r.muskelId as MuskelId] = r.restbelastungProzent;

  const protokoll = await ladeAnpassungen(montag);

  const anpassungen = berechneAnpassungen({
    heute,
    einheiten: einheiten.map((e) => ({
      id: e.id,
      datum: e.datum,
      typ: e.typ,
      titel: e.titel,
      status: e.status,
      erwarteterTrimp: e.erwarteterTrimp,
    })),
    aktivitaeten,
    tsb: letzterTag?.tsb ?? null,
    acwr: letzterTag?.acwr ?? null,
    muskeln,
    bereitsAngepasst: protokoll.map((p) => p.einheitId),
  });

  if (anpassungen.length === 0) return protokoll;

  const zonen = await ladeZonen("running");
  const neueEintraege: ProtokollEintrag[] = [];

  for (const a of anpassungen) {
    const minuten = parseInt(a.neuerTitel.match(/(\d{2,3})\s*Min/i)?.[1] ?? "40", 10);
    const struktur =
      a.neuerTyp === "lauf_z2"
        ? z2Lauf(minuten, { z2: zonen.z2, z4: zonen.z4, z5: zonen.z5 }, a.neuerTitel)
        : null;
    await db
      .update(tables.plannedWorkouts)
      .set({
        typ: a.neuerTyp,
        titel: a.neuerTitel,
        beschreibung: a.neueBeschreibung,
        struktur,
        erwarteterTrimp: a.neuerTyp === "ruhe" ? 0 : Math.round(minuten * 1.1),
        syncToGarmin: a.neuerTyp !== "ruhe",
      })
      .where(eq(tables.plannedWorkouts.id, a.einheitId));

    neueEintraege.push({
      einheitId: a.einheitId,
      datum: a.datum,
      alterTitel: a.alterTitel,
      neuerTitel: a.neuerTitel,
      grund: a.grund,
      bereitsGepusht: a.bereitsGepusht,
      zeitpunkt: new Date().toISOString(),
    });
  }

  const gesamt = [...protokoll, ...neueEintraege].slice(-6);
  await db
    .insert(tables.appSettings)
    .values({ key: anpassungsKey(montag), value: gesamt })
    .onConflictDoUpdate({
      target: tables.appSettings.key,
      set: { value: gesamt },
    });

  return gesamt;
}
