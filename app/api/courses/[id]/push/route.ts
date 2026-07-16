import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, tables } from "@/lib/db";
import { bridgeFetch, BridgeError } from "@/lib/garmin/bridge";
import { baueGarminCourseJson, CourseGeojson } from "@/lib/garmin/course-json";

export const maxDuration = 60;

/** POST /api/courses/[id]/push — Route an Garmin senden */
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const db = getDb();
  const [course] = await db
    .select()
    .from(tables.courses)
    .where(eq(tables.courses.id, id));
  if (!course) {
    return NextResponse.json({ error: "Route nicht gefunden" }, { status: 404 });
  }

  const json = baueGarminCourseJson(
    course.name,
    course.geojson as CourseGeojson,
    course.distanzM,
    course.hmAuf,
    course.hmAb
  );

  try {
    const result = await bridgeFetch<{ ok: boolean; courseId: number | null }>(
      "/api/bridge/push_course",
      { method: "POST", body: { course: json } }
    );
    if (result.courseId) {
      await db
        .update(tables.courses)
        .set({ garminCourseId: result.courseId })
        .where(eq(tables.courses.id, id));
    }
    return NextResponse.json({
      ok: true,
      courseId: result.courseId,
      hinweis:
        "Uhr einmal mit Garmin Connect synchronisieren, dann unter Navigation > Strecken verfügbar.",
    });
  } catch (e) {
    if (e instanceof BridgeError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    }
    return NextResponse.json({ error: "Bridge nicht erreichbar" }, { status: 502 });
  }
}
