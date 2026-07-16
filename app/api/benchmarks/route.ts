import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb, tables } from "@/lib/db";
import { EP_DISZIPLINEN } from "@/lib/ep/disziplinen";
import { ladeEpPrognose } from "@/lib/server/ep-service";
import { heuteIso } from "@/lib/format";

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
  await db.delete(tables.epBenchmarks).where(eq(tables.epBenchmarks.id, id));
  return NextResponse.json({ ok: true });
}
