import { NextResponse } from "next/server";
import { z } from "zod";
import { bridgeFetch, BridgeError } from "@/lib/garmin/bridge";
import { recomputeAll } from "@/lib/server/compute";
import { passePlanAn } from "@/lib/server/plan-service";
import { parseBody, requireSession } from "@/lib/api";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const maxDuration = 60;

const SyncSchema = z.object({
  typ: z.enum(["activities", "health", "zonen", "finalize"]),
});

/**
 * POST /api/sync — führt einen Sync-Chunk aus (Proxy auf die Python-Bridge).
 * Body: { typ: "activities" | "health" | "zonen" | "finalize" }
 * "finalize" stösst die Neuberechnung aller abgeleiteten Daten an.
 */
export async function POST(req: Request) {
  const nichtAuth = await requireSession();
  if (nichtAuth) return nichtAuth;

  // Garmin schonen: grosszügig genug für den Chunk-Backfill, blockt Runaway
  const limit = await rateLimit("sync", { max: 240, windowSec: 600 });
  if (!limit.ok) return tooManyRequests(limit.retryAfterS);

  const { data, error } = await parseBody(req, SyncSchema);
  if (error) return error;
  const { typ } = data;

  if (typ === "finalize") {
    await recomputeAll();
    // Neue Daten können den Wochenplan überholt haben (spontane Einheit,
    // Ermüdungssprung) — direkt nach der Neuberechnung nachziehen.
    const anpassungen = await passePlanAn().catch(() => []);
    return NextResponse.json({
      ok: true,
      typ: "finalize",
      anpassungen: anpassungen.length,
    });
  }

  try {
    const result = await bridgeFetch("/api/bridge/sync", {
      method: "POST",
      body: { typ },
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof BridgeError) {
      return NextResponse.json(
        { error: e.message, code: e.code },
        { status: e.status >= 400 && e.status < 500 ? e.status : 502 }
      );
    }
    return NextResponse.json(
      { error: "Bridge nicht erreichbar. Läuft das Deployment auf Vercel?", code: "bridge_unreachable" },
      { status: 502 }
    );
  }
}
