import { NextResponse } from "next/server";
import { desc, gte } from "drizzle-orm";
import { getDb, tables } from "@/lib/db";
import { MUSKELGRUPPEN, stundenBisBelastbar, MuskelId } from "@/lib/engine/muscle";
import { ladeMuskelBeitraege } from "@/lib/server/muscle-service";
import { addTage, heuteIso } from "@/lib/format";

/** GET /api/body — Muskelstatus heute + Verlauf + Beiträge + Systemik */
export async function GET() {
  const db = getDb();
  const heute = heuteIso();

  const verlauf = await db
    .select()
    .from(tables.muscleState)
    .where(gte(tables.muscleState.datum, addTage(heute, -14)));

  const heuteStand: Record<string, number> = {};
  for (const r of verlauf) {
    if (r.datum === heute) heuteStand[r.muskelId] = r.restbelastungProzent;
  }

  const sparklines: Record<string, { datum: string; wert: number }[]> = {};
  for (const m of MUSKELGRUPPEN) {
    sparklines[m.id] = verlauf
      .filter((r) => r.muskelId === m.id)
      .sort((a, b) => a.datum.localeCompare(b.datum))
      .map((r) => ({ datum: r.datum, wert: r.restbelastungProzent }));
  }

  const beitraege = await ladeMuskelBeitraege(7);

  const belastbarInH: Record<string, number> = {};
  for (const m of MUSKELGRUPPEN) {
    belastbarInH[m.id] = Math.round(
      stundenBisBelastbar(heuteStand[m.id] ?? 0, m.id as MuskelId)
    );
  }

  const [fitness] = await db
    .select()
    .from(tables.computedDaily)
    .orderBy(desc(tables.computedDaily.datum))
    .limit(1);

  const hrvTrend = await db
    .select({
      datum: tables.dailyHealth.datum,
      hrv: tables.dailyHealth.hrvLetzteNacht,
    })
    .from(tables.dailyHealth)
    .where(gte(tables.dailyHealth.datum, addTage(heute, -7)))
    .orderBy(tables.dailyHealth.datum);

  return NextResponse.json({
    heute: heuteStand,
    belastbarInH,
    sparklines,
    beitraege: beitraege.map((b) => ({
      ...b,
      startZeit: b.startZeit.toISOString(),
    })),
    systemisch: {
      tsb: fitness?.tsb ?? null,
      acwr: fitness?.acwr ?? null,
      hrvTrend,
    },
  });
}
