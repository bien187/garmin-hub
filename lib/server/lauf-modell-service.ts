import { eq } from "drizzle-orm";
import { getDb, tables } from "@/lib/db";

/** Lauf-Leistungsmodell: 5-km-Prognose aus den besten Abschnitten der letzten Läufe */
export interface LaufModell {
  fuenfKmS: number | null;
  anzahlEfforts: number;
  berechnetAm: string;
}

export async function ladeLaufModell(): Promise<LaufModell | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(tables.appSettings)
    .where(eq(tables.appSettings.key, "lauf_modell"));
  return (rows[0]?.value as LaufModell | undefined) ?? null;
}
