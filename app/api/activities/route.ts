import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, gte, isNull, lt, like, SQL } from "drizzle-orm";
import { getDb, tables } from "@/lib/db";

/**
 * GET /api/activities?cursor=<startZeit-ISO>&typ=running&von=2026-01-01
 * Infinite Scroll: 20 pro Seite, Cursor = startZeit der letzten Karte.
 */
export async function GET(req: NextRequest) {
  const db = getDb();
  const p = req.nextUrl.searchParams;
  const cursor = p.get("cursor");
  const typ = p.get("typ");
  const von = p.get("von");

  const bedingungen: SQL[] = [isNull(tables.activities.deletedAt)];
  if (cursor) bedingungen.push(lt(tables.activities.startZeit, new Date(cursor)));
  if (typ && typ !== "alle") {
    if (typ === "running") bedingungen.push(like(tables.activities.typ, "%running%"));
    else if (typ === "strength") bedingungen.push(like(tables.activities.typ, "%strength%"));
    else bedingungen.push(like(tables.activities.typ, `%${typ}%`));
  }
  if (von) bedingungen.push(gte(tables.activities.startZeit, new Date(von)));

  const rows = await db
    .select({
      id: tables.activities.id,
      typ: tables.activities.typ,
      name: tables.activities.name,
      startZeit: tables.activities.startZeit,
      dauerS: tables.activities.dauerS,
      distanzM: tables.activities.distanzM,
      hmAuf: tables.activities.hmAuf,
      avgHr: tables.activities.avgHr,
      avgPace: tables.activities.avgPace,
      polyline: tables.activities.polyline,
    })
    .from(tables.activities)
    .where(and(...bedingungen))
    .orderBy(desc(tables.activities.startZeit))
    .limit(20);

  // „Zuletzt synchronisiert" nur auf der ersten Seite mitliefern
  let lastSync: string | null = null;
  if (!cursor) {
    const [s] = await db
      .select({ value: tables.syncState.value })
      .from(tables.syncState)
      .where(eq(tables.syncState.key, "activities"));
    const v = s?.value as { lastSyncAt?: string } | undefined;
    lastSync = v?.lastSyncAt ?? null;
  }

  return NextResponse.json({
    aktivitaeten: rows,
    nextCursor: rows.length === 20 ? rows[rows.length - 1].startZeit : null,
    lastSync,
  });
}
