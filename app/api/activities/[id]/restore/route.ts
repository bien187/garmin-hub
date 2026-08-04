import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, tables } from "@/lib/db";
import { requireSession } from "@/lib/api";
import { recomputeAll } from "@/lib/server/compute";

/** POST /api/activities/[id]/restore — Soft-Delete rückgängig (Undo) */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const nichtAuth = await requireSession();
  if (nichtAuth) return nichtAuth;

  const { id } = await ctx.params;
  const activityId = Number(id);
  if (!Number.isFinite(activityId)) {
    return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
  }

  const db = getDb();
  await db
    .update(tables.activities)
    .set({ deletedAt: null })
    .where(eq(tables.activities.id, activityId));
  await recomputeAll();
  return NextResponse.json({ ok: true });
}
