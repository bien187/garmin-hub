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
  // Ein früher gespeichertes `epDatum` wird bewusst verworfen: der
  // EP-Termin ist fix (lib/ep/konstanten.ts) und nicht mehr Teil des Profils.
  const { epDatum: _veraltet, ...gespeichert } = (rows[0]?.value ?? {}) as Partial<Profil> & {
    epDatum?: unknown;
  };
  void _veraltet;
  return { ...PROFIL_DEFAULTS, ...gespeichert };
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
