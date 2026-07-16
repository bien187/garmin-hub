import { NextRequest, NextResponse } from "next/server";
import { generiereUndSpeichereWoche } from "@/lib/server/plan-service";

export const maxDuration = 60;

/** POST /api/plan/generate — Woche (neu) generieren */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const plan = await generiereUndSpeichereWoche(body?.wochenstart);
  return NextResponse.json({ ok: true, plan });
}
