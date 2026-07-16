import { NextRequest, NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb, tables } from "@/lib/db";

export async function GET() {
  const db = getDb();
  const rows = await db
    .select()
    .from(tables.courses)
    .orderBy(desc(tables.courses.erstelltAm));
  return NextResponse.json({ courses: rows });
}

/** POST /api/courses — Route aus dem Builder speichern */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.name || !body?.geojson || typeof body.distanzM !== "number") {
    return NextResponse.json({ error: "name, geojson, distanzM erforderlich" }, { status: 400 });
  }
  const db = getDb();
  const id = randomUUID();
  await db.insert(tables.courses).values({
    id,
    name: String(body.name).slice(0, 120),
    geojson: body.geojson,
    distanzM: body.distanzM,
    hmAuf: body.hmAuf ?? 0,
    hmAb: body.hmAb ?? 0,
  });
  return NextResponse.json({ ok: true, id });
}
