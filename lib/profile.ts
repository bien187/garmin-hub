import { eq } from "drizzle-orm";
import { getDb, tables } from "@/lib/db";

/** Editierbares Athletenprofil (Defaults aus dem Auftrag, live überschreibbar) */
export interface Profil {
  name: string;
  gewichtKg: number;
  groesseCm: number;
  ruhepuls: number; // wird bei Sync live aus Garmin überschrieben (7-Tage-Min)
  hfMax: number; // geschätzt, editierbar (Max-Puls-Test folgt)
  epDatum: string; // ISO, Tag 1 der zweitägigen EP
  /** Zusatzlast-Kalibrierung Lastlauf: s/km Zuschlag pro 10 kg (auto-kalibriert) */
  lastZuschlagSproKmPro10kg: number;
  stiefelMalusSproKm: number;
}

export const PROFIL_DEFAULTS: Profil = {
  name: "Ben",
  gewichtKg: 88,
  groesseCm: 185,
  ruhepuls: 46,
  hfMax: 197,
  epDatum: "2026-11-14", // Mitte November 2026 (editierbar in /settings)
  lastZuschlagSproKmPro10kg: 8.5, // ~7–10 s/km pro 10 kg, Startwert
  stiefelMalusSproKm: 10,
};

/** Karvonen-Herzfrequenzzonen aus Profil */
export function hrZonen(p: Pick<Profil, "ruhepuls" | "hfMax">) {
  const reserve = p.hfMax - p.ruhepuls;
  const k = (f: number) => Math.round(p.ruhepuls + f * reserve);
  return {
    z1: { von: k(0.5), bis: k(0.6) },
    z2: { von: k(0.6), bis: k(0.7) }, // Ben: 137–152
    z3: { von: k(0.7), bis: k(0.8) },
    z4: { von: k(0.8), bis: k(0.9) }, // 168–183
    z5: { von: k(0.9), bis: p.hfMax }, // 183–198
  };
}

export async function ladeProfil(): Promise<Profil> {
  const db = getDb();
  const rows = await db
    .select()
    .from(tables.appSettings)
    .where(eq(tables.appSettings.key, "profil"));
  const gespeichert = (rows[0]?.value ?? {}) as Partial<Profil>;
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
