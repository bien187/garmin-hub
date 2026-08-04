import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, tables } from "@/lib/db";
import { bridgeFetch, BridgeError } from "@/lib/garmin/bridge";
import { requireSession } from "@/lib/api";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { recomputeAll } from "@/lib/server/compute";

export const maxDuration = 60;

/**
 * POST /api/activities/[id]/resync — Aktivität frisch von Garmin holen.
 * Body (optional): { skipRecompute?: boolean } — true beim Massen-Resync,
 * damit die Neuberechnung nur einmal am Ende läuft.
 * Antwort: { ok, syncedAt } · { ok:false, code:"not_found_at_garmin" }.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const nichtAuth = await requireSession();
  if (nichtAuth) return nichtAuth;
  const limit = await rateLimit("resync", { max: 300, windowSec: 600 });
  if (!limit.ok) return tooManyRequests(limit.retryAfterS);

  const { id } = await ctx.params;
  const activityId = Number(id);
  if (!Number.isFinite(activityId)) {
    return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  const skipRecompute = body?.skipRecompute === true;

  try {
    const result = await bridgeFetch<{ ok: boolean; code?: string }>(
      "/api/bridge/resync_activity",
      { method: "POST", body: { activityId } }
    );
    if (!result.ok) {
      // z.B. bei Garmin gelöscht → Client bietet lokales Entfernen an
      return NextResponse.json(result);
    }
    if (!skipRecompute) await recomputeAll();

    const [row] = await getDb()
      .select({ syncedAt: tables.activities.syncedAt })
      .from(tables.activities)
      .where(
        and(eq(tables.activities.id, activityId), isNull(tables.activities.deletedAt))
      );
    return NextResponse.json({ ok: true, syncedAt: row?.syncedAt ?? null });
  } catch (e) {
    if (e instanceof BridgeError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    }
    return NextResponse.json({ error: "Bridge nicht erreichbar" }, { status: 502 });
  }
}
