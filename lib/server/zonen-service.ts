import { eq } from "drizzle-orm";
import { getDb, tables } from "@/lib/db";
import { ladeProfil } from "@/lib/profile";
import {
  aktiveZonen,
  type GarminZonenDaten,
  type ZonenSatz,
} from "@/lib/hr-zonen";

/**
 * Zugriff auf die von Garmin übernommenen HF-Zonen (Sync legt sie unter
 * app_settings["garmin_hr_zonen"] ab). Fehlen sie, rechnen die Aufrufer
 * über `aktiveZonen` automatisch mit dem Karvonen-Fallback weiter.
 */
export async function ladeGarminZonen(): Promise<GarminZonenDaten | null> {
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(tables.appSettings)
      .where(eq(tables.appSettings.key, "garmin_hr_zonen"));
    const wert = rows[0]?.value as GarminZonenDaten | undefined;
    return wert?.sportarten?.length ? wert : null;
  } catch {
    return null;
  }
}

/** Die gültigen Zonen für einen Garmin-Aktivitätstyp (leer = DEFAULT). */
export async function ladeZonen(typ?: string | null): Promise<ZonenSatz> {
  const [profil, garmin] = await Promise.all([ladeProfil(), ladeGarminZonen()]);
  return aktiveZonen(profil, garmin, typ);
}
