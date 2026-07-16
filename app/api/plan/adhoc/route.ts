import { NextRequest, NextResponse } from "next/server";
import { desc, gte } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb, tables } from "@/lib/db";
import { hrZonen, ladeProfil } from "@/lib/profile";
import { ladeLaufModell } from "@/lib/server/ep-service";
import { trainingsPaces } from "@/lib/engine/paces";
import { banisterTrimp } from "@/lib/engine/trimp";
import { aktuellePhase } from "@/lib/ep/phasen";
import { addTage, heuteIso } from "@/lib/format";
import { WorkoutSchritt, WorkoutStruktur } from "@/lib/garmin/workout-types";

export const maxDuration = 30;

interface AdhocWunsch {
  distanzM?: number;
  dauerMin?: number;
  anstrengung: "locker" | "mittel" | "hart";
  mitHm: boolean;
  speichern?: boolean;
}

/**
 * POST /api/plan/adhoc — Workout-Generator „Heute frei Schnauze".
 * Baut aus Wunsch (Distanz ODER Dauer, Anstrengung, Hm) ein Workout mit
 * echten Zonen-Paces, erwartetem TRIMP und TSB-Auswirkung von morgen.
 */
export async function POST(req: NextRequest) {
  const wunsch = (await req.json().catch(() => null)) as AdhocWunsch | null;
  if (!wunsch || (!wunsch.distanzM && !wunsch.dauerMin)) {
    return NextResponse.json(
      { error: "distanzM oder dauerMin erforderlich" },
      { status: 400 }
    );
  }

  const db = getDb();
  const profil = await ladeProfil();
  const zonen = hrZonen(profil);
  const modell = await ladeLaufModell();
  const paces = modell?.fuenfKmS ? trainingsPaces(modell.fuenfKmS) : null;

  // Dauer abschätzen, falls nur Distanz gegeben (mit Wunsch-Pace)
  const basisPace =
    wunsch.anstrengung === "locker"
      ? paces?.z2.bis ?? 390
      : wunsch.anstrengung === "mittel"
        ? paces?.steady ?? 340
        : paces?.schwelle ?? 315;
  const dauerMin =
    wunsch.dauerMin ?? Math.round(((wunsch.distanzM ?? 0) / 1000) * (basisPace / 60));

  /* Workout-Struktur bauen */
  const schritte: WorkoutSchritt[] = [];
  let avgHrSchaetzung: number;
  if (wunsch.anstrengung === "locker") {
    schritte.push(
      { art: "aufwaermen", dauerTyp: "zeit", dauerWert: 600 },
      {
        art: "intervall",
        dauerTyp: wunsch.distanzM ? "distanz" : "zeit",
        dauerWert: wunsch.distanzM ?? Math.max(0, dauerMin - 15) * 60,
        ziel: { typ: "hr", vonBpm: zonen.z2.von, bisBpm: zonen.z2.bis },
        notiz: "Strikt Z2",
      },
      { art: "auslaufen", dauerTyp: "zeit", dauerWert: 300 }
    );
    avgHrSchaetzung = (zonen.z2.von + zonen.z2.bis) / 2;
  } else if (wunsch.anstrengung === "mittel") {
    schritte.push(
      { art: "aufwaermen", dauerTyp: "zeit", dauerWert: 600 },
      {
        art: "intervall",
        dauerTyp: wunsch.distanzM ? "distanz" : "zeit",
        dauerWert: wunsch.distanzM ?? Math.max(0, dauerMin - 15) * 60,
        ziel: paces
          ? { typ: "pace", vonSproKm: paces.steady * 1.03, bisSproKm: paces.steady * 0.97 }
          : { typ: "hr", vonBpm: zonen.z3.von, bisBpm: zonen.z3.bis },
        notiz: "Steady / Z3",
      },
      { art: "auslaufen", dauerTyp: "zeit", dauerWert: 300 }
    );
    avgHrSchaetzung = (zonen.z3.von + zonen.z3.bis) / 2;
  } else {
    const kernMin = Math.max(12, dauerMin - 25);
    const anzahl = Math.max(3, Math.min(8, Math.floor(kernMin / 5)));
    schritte.push(
      { art: "aufwaermen", dauerTyp: "zeit", dauerWert: 900 },
      {
        art: "wiederholung",
        dauerTyp: "offen",
        wiederholungen: anzahl,
        schritte: [
          {
            art: "intervall",
            dauerTyp: "zeit",
            dauerWert: 180,
            ziel: paces
              ? { typ: "pace", vonSproKm: paces.intervall * 1.03, bisSproKm: paces.intervall * 0.97 }
              : { typ: "hr", vonBpm: zonen.z5.von, bisBpm: zonen.z5.bis },
            notiz: wunsch.mitHm ? "Am Hügel bergauf" : "Z5",
          },
          { art: "erholung", dauerTyp: "zeit", dauerWert: 150 },
        ],
      },
      { art: "auslaufen", dauerTyp: "zeit", dauerWert: 600 }
    );
    avgHrSchaetzung = zonen.z4.bis;
  }

  const name = `${wunsch.anstrengung === "locker" ? "Z2" : wunsch.anstrengung === "mittel" ? "Steady" : "Intervalle"}${
    wunsch.mitHm ? " + Hm" : ""
  } ${dauerMin} Min`;
  const struktur: WorkoutStruktur = { name, sport: "laufen", schritte };

  /* Erwarteter TRIMP + TSB-Auswirkung morgen */
  const erwarteterTrimp = Math.round(
    banisterTrimp(dauerMin * 60, avgHrSchaetzung, profil.ruhepuls, profil.hfMax) *
      (wunsch.mitHm ? 1.15 : 1)
  );
  const [fitnessHeute] = await db
    .select()
    .from(tables.computedDaily)
    .orderBy(desc(tables.computedDaily.datum))
    .limit(1);
  let tsbMorgen: number | null = null;
  if (fitnessHeute) {
    const kCtl = 1 - Math.exp(-1 / 42);
    const kAtl = 1 - Math.exp(-1 / 7);
    const ctlNeu = fitnessHeute.ctl + kCtl * (erwarteterTrimp - fitnessHeute.ctl);
    const atlNeu = fitnessHeute.atl + kAtl * (erwarteterTrimp - fitnessHeute.atl);
    tsbMorgen = Math.round((ctlNeu - atlNeu) * 10) / 10;
  }

  /* Passende Routen mit Hm vorschlagen */
  let routenVorschlaege: { id: string; name: string; distanzM: number; hmAuf: number }[] = [];
  if (wunsch.mitHm) {
    const alle = await db
      .select({
        id: tables.courses.id,
        name: tables.courses.name,
        distanzM: tables.courses.distanzM,
        hmAuf: tables.courses.hmAuf,
      })
      .from(tables.courses)
      .where(gte(tables.courses.hmAuf, 80));
    const zielDistanz = wunsch.distanzM ?? (dauerMin * 1000 * 60) / basisPace;
    routenVorschlaege = alle
      .sort(
        (a, b) =>
          Math.abs(a.distanzM - zielDistanz) - Math.abs(b.distanzM - zielDistanz)
      )
      .slice(0, 3);
  }

  let planId: string | null = null;
  if (wunsch.speichern) {
    planId = randomUUID();
    const profilPhase = aktuellePhase(heuteIso(), profil.epDatum);
    await db.insert(tables.plannedWorkouts).values({
      id: planId,
      datum: heuteIso(),
      phase: profilPhase.nr,
      typ: wunsch.anstrengung === "hart" ? "intervalle" : "lauf_z2",
      titel: name,
      beschreibung: `Frei-Schnauze-Workout (${wunsch.anstrengung}${wunsch.mitHm ? ", mit Hm" : ""})`,
      struktur,
      erwarteterTrimp,
      status: "geplant",
    });
  }

  return NextResponse.json({
    ok: true,
    planId,
    struktur,
    erwarteterTrimp,
    tsbMorgen,
    tsbHeute: fitnessHeute?.tsb ?? null,
    hinweis:
      tsbMorgen != null && tsbMorgen < -10
        ? `Nach diesem Lauf: TSB ${tsbMorgen} — morgen Regeneration einplanen.`
        : null,
    routenVorschlaege,
  });
}
