import { NextRequest, NextResponse } from "next/server";
import { bridgeFetch } from "@/lib/garmin/bridge";
import { recomputeAll } from "@/lib/server/compute";
import { generiereUndSpeichereWoche } from "@/lib/server/plan-service";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/daily — nächtlicher Auto-Sync (Vercel Cron, 05:00 UTC).
 * Arbeitet Chunks ab, solange das Zeitbudget reicht; der Rest folgt am
 * nächsten Tag bzw. beim manuellen Sync.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const startMs = Date.now();
  const budgetMs = 45_000;
  const stats = { activities: 0, health: 0, zonen: 0, fehler: null as string | null };

  try {
    for (const typ of ["zonen", "activities", "health"] as const) {
      let hasMore = true;
      while (hasMore && Date.now() - startMs < budgetMs) {
        const r = await bridgeFetch<{ hasMore: boolean; verarbeitet: number }>(
          "/api/bridge/sync",
          { method: "POST", body: { typ }, timeoutMs: 50_000 }
        );
        stats[typ] += r.verarbeitet ?? 0;
        hasMore = Boolean(r.hasMore);
      }
    }
  } catch (e) {
    stats.fehler = e instanceof Error ? e.message : String(e);
  }

  await recomputeAll().catch((e) => {
    stats.fehler = stats.fehler ?? (e instanceof Error ? e.message : String(e));
  });

  // Sonntagabend (Cron läuft Mo 05:00 UTC → plant die angebrochene Woche);
  // zusätzlich: sonntags generiert der Cron die Folgewoche.
  const heute = new Date();
  if (heute.getDay() === 0 || heute.getDay() === 1) {
    await generiereUndSpeichereWoche().catch(() => {});
  }

  return NextResponse.json({ ok: true, ...stats });
}
