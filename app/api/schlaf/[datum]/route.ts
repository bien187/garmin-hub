import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api";
import { ladeSchlafDetail } from "@/lib/server/sleep-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/schlaf/[datum] — Detail und Analyse einer Nacht (Aufwachdatum).
 * Keine Daten → 200 mit `detail: null` (Leerzustand statt Fehler).
 * Fehlermeldungen enthalten nie Schlafwerte.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ datum: string }> }) {
  const nichtAuth = await requireSession();
  if (nichtAuth) return nichtAuth;
  const { datum } = await params;
  if (!z.iso.date().safeParse(datum).success) {
    return NextResponse.json({ error: "Ungültiges Datum" }, { status: 400 });
  }
  try {
    const detail = await ladeSchlafDetail(datum);
    return NextResponse.json({ datum, detail });
  } catch {
    return NextResponse.json({ error: "Schlafdaten konnten nicht geladen werden." }, { status: 500 });
  }
}
