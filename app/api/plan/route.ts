import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { getDb, tables } from "@/lib/db";
import { addTage, heuteIso, montagVon } from "@/lib/format";
import { PROGRAMM_START, trainingsblock } from "@/lib/engine/block";
import { archivTitel, imArchivSichtbar } from "@/lib/engine/plan-archiv";
import { ladeAnpassungen } from "@/lib/server/plan-service";

/** GET /api/plan?woche=2026-11-23 — Einheiten + Hinweise der Woche */
export async function GET(req: NextRequest) {
  const db = getDb();
  const wocheParam = req.nextUrl.searchParams.get("woche");
  const montag = montagVon(wocheParam ?? heuteIso());
  const sonntag = addTage(montag, 6);
  // Wochen vor dem Programmstart: neutral und schreibgeschützt (Archiv)
  const archiv = montag < PROGRAMM_START;

  const zeilen = await db
    .select()
    .from(tables.plannedWorkouts)
    .where(
      and(
        gte(tables.plannedWorkouts.datum, montag),
        lte(tables.plannedWorkouts.datum, sonntag)
      )
    )
    .orderBy(asc(tables.plannedWorkouts.datum));
  const einheiten = archiv
    ? zeilen
        .filter((e) => imArchivSichtbar(e.typ))
        .map((e) => ({ ...e, titel: archivTitel(e.typ, e.titel), beschreibung: null, struktur: null }))
    : zeilen;

  const hinweisRows = archiv
    ? []
    : await db
        .select()
        .from(tables.appSettings)
        .where(eq(tables.appSettings.key, `plan_hinweise_${montag}`));

  return NextResponse.json({
    montag,
    block: trainingsblock(montag),
    archiv,
    einheiten,
    hinweise: (hinweisRows[0]?.value as string[] | undefined) ?? [],
    anpassungen: archiv ? [] : await ladeAnpassungen(montag),
    nichtVerfuegbar: archiv
      ? []
      : (await db.select().from(tables.appSettings).where(eq(tables.appSettings.key, 'plan_verfuegbarkeit_' + montag)))[0]?.value ?? [],
  });
}
