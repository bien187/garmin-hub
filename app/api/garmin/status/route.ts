import { NextResponse } from "next/server";
import { bridgeFetch, BridgeError } from "@/lib/garmin/bridge";

export async function GET() {
  try {
    const result = await bridgeFetch("/api/bridge/status");
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof BridgeError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 502 });
    }
    return NextResponse.json(
      { error: "Bridge nicht erreichbar (lokal ohne `vercel dev` normal).", code: "bridge_unreachable" },
      { status: 502 }
    );
  }
}
