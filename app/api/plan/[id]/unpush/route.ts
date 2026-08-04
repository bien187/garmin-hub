import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, tables } from "@/lib/db";
import { bridgeFetch, BridgeError } from "@/lib/garmin/bridge";
import { requireSession } from "@/lib/api";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const maxDuration = 60;

/**
 * POST /api/plan/[id]/unpush — Übertragung rückgängig: Workout + Kalender-
 * Eintrag bei Garmin entfernen und lokal auf "geplant" zurücksetzen.
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const nichtAuth = await requireSession();
  if (nichtAuth) return nichtAuth;
  const limit = await rateLimit("push", { max: 60, windowSec: 600 });
  if (!limit.ok) return tooManyRequests(limit.retryAfterS);

  const { id } = await ctx.params;
  const db = getDb();
  const [einheit] = await db
    .select()
    .from(tables.plannedWorkouts)
    .where(eq(tables.plannedWorkouts.id, id));
  if (!einheit) {
    return NextResponse.json({ error: "Einheit nicht gefunden" }, { status: 404 });
  }
  if (!einheit.garminWorkoutId) {
    // War nie übertragen — idempotent
    return NextResponse.json({ ok: true, already: true });
  }

  try {
    await bridgeFetch("/api/bridge/unpush_workout", {
      method: "POST",
      body: {
        workoutId: einheit.garminWorkoutId,
        scheduleId: einheit.garminScheduleId,
      },
    });
    await db
      .update(tables.plannedWorkouts)
      .set({ garminWorkoutId: null, garminScheduleId: null, status: "geplant" })
      .where(eq(tables.plannedWorkouts.id, id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof BridgeError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    }
    return NextResponse.json({ error: "Bridge nicht erreichbar" }, { status: 502 });
  }
}
