import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { getDb, tables } from "@/lib/db";
import { addTage, heuteIso, montagVon } from "@/lib/format";
import { aktuellePhase } from "@/lib/ep/phasen";
import { ladeAnpassungen } from "@/lib/server/plan-service";

/** GET /api/plan?woche=2026-07-20 — Einheiten + Hinweise der Woche */
export async function GET(req: NextRequest) {
  const db = getDb();
  const wocheParam = req.nextUrl.searchParams.get("woche");
  const montag = montagVon(wocheParam ?? heuteIso());
  const sonntag = addTage(montag, 6);

  const einheiten = await db
    .select()
    .from(tables.plannedWorkouts)
    .where(
      and(
        gte(tables.plannedWorkouts.datum, montag),
        lte(tables.plannedWorkouts.datum, sonntag)
      )
    )
    .orderBy(asc(tables.plannedWorkouts.datum));

  const hinweisRows = await db
    .select()
    .from(tables.appSettings)
    .where(eq(tables.appSettings.key, `plan_hinweise_${montag}`));

  const phase = aktuellePhase(montag);

  return NextResponse.json({
    montag,
    phase,
    einheiten,
    hinweise: (hinweisRows[0]?.value as string[] | undefined) ?? [],
    anpassungen: await ladeAnpassungen(montag),
    nichtVerfuegbar: (await db.select().from(tables.appSettings).where(eq(tables.appSettings.key, 'plan_verfuegbarkeit_' + montag)))[0]?.value ?? [],
  });
}
