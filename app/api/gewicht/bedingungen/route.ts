import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, tables } from "@/lib/db";
import { parseBody, requireSession } from "@/lib/api";

const minuten = z.number().int().min(0).max(24 * 60).nullable();

const Schema = z.object({
  messungId: z.string().min(1).max(64),
  nuechtern: z.boolean().nullable(),
  vorFruehstueck: z.boolean().nullable(),
  nachToilette: z.boolean().nullable(),
  mahlzeitVorMin: minuten,
  fluessigkeitVorMin: minuten,
  trainingVorMin: minuten,
  badSauna: z.boolean().nullable(),
});

/**
 * PUT /api/gewicht/bedingungen — Messbedingungen einer Wägung ergänzen
 * („Wie war deine Messung?"). null = keine Angabe. Die Garmin-Messwerte
 * selbst werden hier nie verändert.
 */
export async function PUT(req: Request) {
  const nichtAuth = await requireSession();
  if (nichtAuth) return nichtAuth;
  const { data, error } = await parseBody(req, Schema);
  if (error) return error;

  const db = getDb();
  const [messung] = await db
    .select({ id: tables.gewichtMessungen.id })
    .from(tables.gewichtMessungen)
    .where(eq(tables.gewichtMessungen.id, data.messungId));
  if (!messung) return NextResponse.json({ error: "Messung nicht gefunden" }, { status: 404 });

  const { messungId, ...werte } = data;
  await db
    .insert(tables.gewichtBedingungen)
    .values({ messungId, ...werte, aktualisiertAm: new Date() })
    .onConflictDoUpdate({
      target: tables.gewichtBedingungen.messungId,
      set: { ...werte, aktualisiertAm: new Date() },
    });
  return NextResponse.json({ ok: true });
}
