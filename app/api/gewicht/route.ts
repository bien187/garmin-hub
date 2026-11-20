import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api";
import { ladeGewicht } from "@/lib/server/gewicht-service";

export const dynamic = "force-dynamic";

/** GET /api/gewicht — Messungen mit Messqualität, Trend und Körperzusammensetzung */
export async function GET() {
  const nichtAuth = await requireSession();
  if (nichtAuth) return nichtAuth;
  return NextResponse.json(await ladeGewicht());
}
