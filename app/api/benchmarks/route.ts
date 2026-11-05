import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb, tables } from "@/lib/db";
import { EP_DISZIPLINEN } from "@/lib/ep/disziplinen";
import { ladeEpPrognose } from "@/lib/server/ep-service";
import { heuteIso } from "@/lib/format";
import { requireSession } from "@/lib/api";

export async function GET() {
  const db = getDb();
  const rows = await db
    .select()
    .from(tables.epBenchmarks)
    .orderBy(desc(tables.epBenchmarks.datum));
  const { prognose } = await ladeEpPrognose();
  return NextResponse.json({ benchmarks: rows, prognose });
}

/** POST /api/benchmarks — Testresultat erfassen */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const disziplin = body?.disziplin as string;
  const wert = Number(body?.wert);
  if (!EP_DISZIPLINEN[disziplin as keyof typeof EP_DISZIPLINEN] || !isFinite(wert) || wert <= 0) {
    return NextResponse.json({ error: "Ungültige Disziplin oder Wert" }, { status: 400 });
  }
  const db = getDb();
  await db.insert(tables.epBenchmarks).values({
    id: randomUUID(),
    datum: body?.datum ?? heuteIso(),
    disziplin,
    wert,
    notiz: body?.notiz ?? null,
  });
  const { prognose } = await ladeEpPrognose();
  return NextResponse.json({ ok: true, prognose });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id fehlt" }, { status: 400 });
  const db = getDb();
  const geloescht = await db.delete(tables.epBenchmarks).where(eq(tables.epBenchmarks.id, id)).returning({id:tables.epBenchmarks.id});
  if (!geloescht.length) return NextResponse.json({error:'Eintrag nicht gefunden.'},{status:404});
  return NextResponse.json({ ok: true });
}

/** PATCH /api/benchmarks — Wert und/oder Datum eines Eintrags anpassen */
export async function PATCH(req: NextRequest) {
  const nichtAuth = await requireSession();
  if (nichtAuth) return nichtAuth;
  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : null;
  const wert = body?.wert == null ? undefined : Number(body.wert);
  const datum = typeof body?.datum === "string" ? body.datum : undefined;
  if (!id) return NextResponse.json({ error: "id fehlt" }, { status: 400 });
  if (wert !== undefined && (!isFinite(wert) || wert <= 0)) {
    return NextResponse.json({ error: "Ungültiger Wert" }, { status: 400 });
  }
  if (datum !== undefined && (!/^\d{4}-\d{2}-\d{2}$/.test(datum) || Number.isNaN(Date.parse(datum)) || datum > heuteIso())) {
    return NextResponse.json({ error: "Ungültiges Datum" }, { status: 400 });
  }
  if (wert === undefined && datum === undefined) {
    return NextResponse.json({ error: "Nichts zu ändern" }, { status: 400 });
  }
  const db = getDb();
  const geaendert = await db
    .update(tables.epBenchmarks)
    .set({ ...(wert !== undefined ? { wert } : {}), ...(datum !== undefined ? { datum } : {}) })
    .where(eq(tables.epBenchmarks.id, id))
    .returning({ id: tables.epBenchmarks.id });
  if (!geaendert.length) return NextResponse.json({ error: "Eintrag nicht gefunden." }, { status: 404 });
  const { prognose } = await ladeEpPrognose();
  return NextResponse.json({ ok: true, prognose });
}
