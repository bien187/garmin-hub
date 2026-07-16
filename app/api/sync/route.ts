import { NextRequest, NextResponse } from "next/server";
import { bridgeFetch, BridgeError } from "@/lib/garmin/bridge";
import { recomputeAll } from "@/lib/server/compute";

export const maxDuration = 60;

/**
 * POST /api/sync — führt einen Sync-Chunk aus (Proxy auf die Python-Bridge).
 * Body: { typ: "activities" | "health" | "finalize" }
 * "finalize" stösst die Neuberechnung aller abgeleiteten Daten an.
 */
export async function POST(req: NextRequest) {
  const { typ } = await req.json().catch(() => ({ typ: "activities" }));

  if (typ === "finalize") {
    await recomputeAll();
    return NextResponse.json({ ok: true, typ: "finalize" });
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
