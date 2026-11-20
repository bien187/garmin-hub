import { eq } from "drizzle-orm";
import { getDb, tables } from "@/lib/db";
import { Profil, PROFIL_DEFAULTS } from "./profil-typen";

export { hrZonen, PROFIL_DEFAULTS } from "./profil-typen";
export type { Profil } from "./profil-typen";

export async function ladeProfil(): Promise<Profil> {
  const db = getDb();
  const rows = await db
    .select()
    .from(tables.appSettings)
    .where(eq(tables.appSettings.key, "profil"));
  // Nur bekannte Felder übernehmen: Altfelder früherer Versionen, die noch
  // im gespeicherten JSON stehen, fallen so stillschweigend weg.
  const gespeichert = (rows[0]?.value ?? {}) as Record<string, unknown>;
  const bekannt = Object.fromEntries(
    Object.entries(gespeichert).filter(([k]) => k in PROFIL_DEFAULTS)
  ) as Partial<Profil>;
  return { ...PROFIL_DEFAULTS, ...bekannt };
}

export async function speichereProfil(patch: Partial<Profil>): Promise<Profil> {
  const db = getDb();
  const aktuell = await ladeProfil();
  const neu = { ...aktuell, ...patch };
  await db
    .insert(tables.appSettings)
    .values({ key: "profil", value: neu })
    .onConflictDoUpdate({ target: tables.appSettings.key, set: { value: neu } });
  return neu;
}
