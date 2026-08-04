import { NextResponse } from "next/server";
import { and, desc, isNotNull, isNull } from "drizzle-orm";
import { getDb, tables } from "@/lib/db";

/** GET /api/activities/polylines — encodierte Polylines für den Heatmap-Layer */
export async function GET() {
  const db = getDb();
  const rows = await db
    .select({
      id: tables.activities.id,
      polyline: tables.activities.polyline,
    })
    .from(tables.activities)
    .where(
      and(isNotNull(tables.activities.polyline), isNull(tables.activities.deletedAt))
    )
    .orderBy(desc(tables.activities.startZeit))
    .limit(300);
  return NextResponse.json({ polylines: rows.map((r) => r.polyline) });
}
