import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, tables } from "@/lib/db";

/** PATCH /api/plan/[id] — Status ändern (absolviert/verpasst/geplant) */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const status = body?.status as string;
  if (!["geplant", "gepusht", "absolviert", "verpasst"].includes(status)) {
    return NextResponse.json({ error: "Ungültiger Status" }, { status: 400 });
  }
  const db = getDb();
  await db
    .update(tables.plannedWorkouts)
    .set({ status })
    .where(eq(tables.plannedWorkouts.id, id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const db = getDb();
  await db.delete(tables.plannedWorkouts).where(eq(tables.plannedWorkouts.id, id));
  return NextResponse.json({ ok: true });
}
