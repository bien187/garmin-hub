import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, tables } from "@/lib/db";
import { parseBody, requireSession } from "@/lib/api";
import { istEpTag } from "@/lib/ep/konstanten";
import {
  bereinigeAbgehakt,
  checklisteFuer,
  checklistenSchluessel,
  istGueltigeStartzeit,
  leseZustand,
  type ChecklistenZustand,
} from "@/lib/ep/checkliste";

/**
 * EP-Checkliste: Abhakzustand + Startzeit je EP-Tag in app_settings unter
 * `ep_checkliste_<datum>` (kein eigenes Schema, keine Migration).
 * Nur die beiden EP-Tage sind erlaubt; unbekannte Punkt-IDs werden verworfen.
 */

const Datum = z.iso.date().refine(istEpTag, { message: "Kein EP-Tag" });

const PutSchema = z.object({
  datum: Datum,
  abgehakt: z.array(z.string().max(80)).max(200),
  startzeit: z.string().refine(istGueltigeStartzeit, { message: "Ungültige Startzeit" }),
});

export async function GET(req: NextRequest) {
  const nichtAuth = await requireSession();
  if (nichtAuth) return nichtAuth;

  const datum = Datum.safeParse(req.nextUrl.searchParams.get("datum"));
  if (!datum.success) {
    return NextResponse.json({ error: "Nur für die EP-Tage verfügbar." }, { status: 400 });
  }
  const gruppen = checklisteFuer(datum.data) ?? [];

  const db = getDb();
  const [zeile] = await db
    .select({ value: tables.appSettings.value })
    .from(tables.appSettings)
    .where(eq(tables.appSettings.key, checklistenSchluessel(datum.data)));

  const zustand = leseZustand(gruppen, zeile?.value);
  return NextResponse.json({ datum: datum.data, ...zustand });
}

export async function PUT(req: NextRequest) {
  const nichtAuth = await requireSession();
  if (nichtAuth) return nichtAuth;

  const { data, error } = await parseBody(req, PutSchema);
  if (error) return error;

  const gruppen = checklisteFuer(data.datum) ?? [];
  const wert: ChecklistenZustand = {
    abgehakt: bereinigeAbgehakt(gruppen, data.abgehakt),
    startzeit: data.startzeit,
  };

  const db = getDb();
  await db
    .insert(tables.appSettings)
    .values({ key: checklistenSchluessel(data.datum), value: wert })
    .onConflictDoUpdate({ target: tables.appSettings.key, set: { value: wert } });

  return NextResponse.json({ ok: true, datum: data.datum, ...wert });
}
