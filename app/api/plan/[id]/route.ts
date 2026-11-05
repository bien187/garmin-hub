import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, tables } from "@/lib/db";
import { requireSession } from "@/lib/api";
import { istFixerEpEintrag } from "@/lib/server/plan-sync";

/**
 * PATCH /api/plan/[id] — Status ändern (absolviert/verpasst/geplant) und/oder
 * das Garmin-Sync-Flag pro Einheit umschalten. Typ, Titel und Datum sind
 * hier nicht änderbar. EP-Einträge: nur der Status (absolviert/geplant),
 * nie „gepusht" und nie an Garmin.
 */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const nichtAuth = await requireSession();
  if (nichtAuth) return nichtAuth;

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const patch: { status?: string; syncToGarmin?: boolean } = {};

  if (body?.status !== undefined) {
    if (!["geplant", "gepusht", "absolviert", "verpasst"].includes(body.status)) {
      return NextResponse.json({ error: "Ungültiger Status" }, { status: 400 });
    }
    patch.status = body.status;
  }
  if (typeof body?.syncToGarmin === "boolean") {
    patch.syncToGarmin = body.syncToGarmin;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nichts zu ändern" }, { status: 400 });
  }

  const db = getDb();
  const [einheit] = await db
    .select({ typ: tables.plannedWorkouts.typ })
    .from(tables.plannedWorkouts)
    .where(eq(tables.plannedWorkouts.id, id));
  if (!einheit) {
    return NextResponse.json({ error: "Einheit nicht gefunden" }, { status: 404 });
  }
  if (istFixerEpEintrag(einheit)) {
    if (body?.typ !== undefined && body.typ !== "ep") {
      return NextResponse.json(
        { error: "EP-Tage sind fix und lassen sich nicht in eine andere Einheit umwandeln." },
        { status: 409 }
      );
    }
    if (patch.syncToGarmin === true || patch.status === "gepusht") {
      return NextResponse.json(
        { error: "EP-Tage werden nicht an die Uhr gesendet." },
        { status: 409 }
      );
    }
    patch.syncToGarmin = false;
  }

  await db
    .update(tables.plannedWorkouts)
    .set(patch)
    .where(eq(tables.plannedWorkouts.id, id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const nichtAuth = await requireSession();
  if (nichtAuth) return nichtAuth;

  const { id } = await ctx.params;
  const db = getDb();
  const [einheit] = await db
    .select({ typ: tables.plannedWorkouts.typ })
    .from(tables.plannedWorkouts)
    .where(eq(tables.plannedWorkouts.id, id));
  if (einheit && istFixerEpEintrag(einheit)) {
    return NextResponse.json(
      { error: "EP-Tage sind fix und können nicht gelöscht werden." },
      { status: 409 }
    );
  }
  await db.delete(tables.plannedWorkouts).where(eq(tables.plannedWorkouts.id, id));
  return NextResponse.json({ ok: true });
}
