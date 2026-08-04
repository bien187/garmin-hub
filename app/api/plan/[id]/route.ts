import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, tables } from "@/lib/db";
import { requireSession } from "@/lib/api";

/**
 * PATCH /api/plan/[id] — Status ändern (absolviert/verpasst/geplant) und/oder
 * das Garmin-Sync-Flag pro Einheit umschalten.
 */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const nichtAuth = await requireSession();
  if (nichtAuth) return nichtAuth;

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const patch: { status?: string; syncToGarmin?: boolean } = {};

  if (body?.status !== undefined) {
    if (!["geplant", "gepusht", "absolviert", "verpasst"].includes(body.status)) {
      return NextResponse.json({ error: "Ungültiger Status" }, { status: 400 });
    }
    patch.status = body.status;
  }
  if (typeof body?.syncToGarmin === "boolean") {
    patch.syncToGarmin = body.syncToGarmin;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nichts zu ändern" }, { status: 400 });
  }

  const db = getDb();
  await db
    .update(tables.plannedWorkouts)
    .set(patch)
    .where(eq(tables.plannedWorkouts.id, id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const nichtAuth = await requireSession();
  if (nichtAuth) return nichtAuth;

  const { id } = await ctx.params;
  const db = getDb();
  await db.delete(tables.plannedWorkouts).where(eq(tables.plannedWorkouts.id, id));
  return NextResponse.json({ ok: true });
}
