import { NextRequest, NextResponse } from "next/server";
import { bridgeFetch, BridgeError } from "@/lib/garmin/bridge";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { code } = await req.json().catch(() => ({ code: "" }));
  if (!code) {
    return NextResponse.json({ error: "MFA-Code fehlt" }, { status: 400 });
  }
  try {
    const result = await bridgeFetch("/api/bridge/mfa", {
      method: "POST",
      body: { code },
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof BridgeError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    }
    return NextResponse.json({ error: "Bridge nicht erreichbar" }, { status: 502 });
  }
}
