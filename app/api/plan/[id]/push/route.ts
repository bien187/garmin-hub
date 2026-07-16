import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, tables } from "@/lib/db";
import { bridgeFetch, BridgeError } from "@/lib/garmin/bridge";
import { baueGarminWorkoutJson } from "@/lib/garmin/workout-json";
import { WorkoutStruktur } from "@/lib/garmin/workout-types";

export const maxDuration = 60;

/** POST /api/plan/[id]/push — geplante Einheit auf die Uhr laden */
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const db = getDb();
  const [einheit] = await db
    .select()
    .from(tables.plannedWorkouts)
    .where(eq(tables.plannedWorkouts.id, id));
  if (!einheit) {
    return NextResponse.json({ error: "Einheit nicht gefunden" }, { status: 404 });
  }
  if (!einheit.struktur) {
    return NextResponse.json(
      { error: "Diese Einheit hat keine pushbare Struktur (In-App-Anleitung nutzen)." },
      { status: 400 }
    );
  }

  const workoutJson = baueGarminWorkoutJson(einheit.struktur as WorkoutStruktur);

  try {
    const result = await bridgeFetch<{ ok: boolean; workoutId: number | null }>(
      "/api/bridge/push_workout",
      { method: "POST", body: { workout: workoutJson, datum: einheit.datum } }
    );
    if (result.workoutId) {
      await db
        .update(tables.plannedWorkouts)
        .set({ garminWorkoutId: result.workoutId, status: "gepusht" })
        .where(eq(tables.plannedWorkouts.id, id));
    }
    return NextResponse.json({
      ok: true,
      workoutId: result.workoutId,
      hinweis:
        "Workout liegt im Garmin-Kalender. Uhr synchronisieren, dann erscheint es am Plandatum auf der FR 265.",
    });
  } catch (e) {
    if (e instanceof BridgeError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    }
    return NextResponse.json({ error: "Bridge nicht erreichbar" }, { status: 502 });
  }
}
