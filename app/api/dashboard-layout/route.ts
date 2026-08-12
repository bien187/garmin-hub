import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, tables } from "@/lib/db";
import { DASHBOARD_LAYOUT_KEY } from "@/lib/server/dashboard-service";
import { requireSession } from "@/lib/api";

/**
 * Kachel-Reihenfolge des Dashboards. Bewusst serverseitig statt im
 * localStorage: die App läuft auf Handy und Desktop, die Anordnung soll
 * mitkommen.
 */
export async function GET() {
  const db = getDb();
  const rows = await db
    .select()
    .from(tables.appSettings)
    .where(eq(tables.appSettings.key, DASHBOARD_LAYOUT_KEY));
  const wert = rows[0]?.value;
  return NextResponse.json({
    reihenfolge: Array.isArray(wert) ? wert : [],
  });
}

export async function POST(req: NextRequest) {
  const nichtAuth = await requireSession();
  if (nichtAuth) return nichtAuth;

  const body = (await req.json().catch(() => null)) as
    | { reihenfolge?: unknown }
    | null;
  const roh = body?.reihenfolge;
  if (!Array.isArray(roh)) {
    return NextResponse.json({ error: "reihenfolge fehlt" }, { status: 400 });
  }
  // Nur plausible Kachel-IDs speichern; der Rest wird stillschweigend
  // verworfen, damit hier nichts Beliebiges in die Settings wandert.
  const reihenfolge = roh
    .filter((v): v is string => typeof v === "string" && /^[a-z0-9_-]{1,40}$/.test(v))
    .slice(0, 40);

  const db = getDb();
  await db
    .insert(tables.appSettings)
    .values({ key: DASHBOARD_LAYOUT_KEY, value: reihenfolge })
    .onConflictDoUpdate({
      target: tables.appSettings.key,
      set: { value: reihenfolge },
    });
  return NextResponse.json({ ok: true, reihenfolge });
}
