import { eq } from "drizzle-orm";
import { getDb, tables } from "@/lib/db";
import { ladeProfil, Profil } from "@/lib/profile";
import { berechneEpPrognose, EpPrognose } from "@/lib/ep/prognose";
import { DisziplinId } from "@/lib/ep/disziplinen";
import { lastlaufPrognose } from "@/lib/engine/paces";
import { heuteIso } from "@/lib/format";

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

/** Lastlauf-Modellwert (20 kg + Stiefel) aus dem aktuellen Lauf-Modell */
export function lastlaufModellSekunden(
  modell: LaufModell | null,
  profil: Profil
): number | null {
  if (!modell?.fuenfKmS) return null;
  return lastlaufPrognose({
    fuenfKmFlachS: modell.fuenfKmS,
    zusatzlastKg: 20,
    mitStiefeln: true,
    zuschlagSproKmPro10kg: profil.lastZuschlagSproKmPro10kg,
    stiefelMalusSproKm: profil.stiefelMalusSproKm,
  });
}

export async function ladeEpPrognose(): Promise<{
  prognose: EpPrognose;
  profil: Profil;
  laufModell: LaufModell | null;
}> {
  const db = getDb();
  const profil = await ladeProfil();
  const benchmarks = await db.select().from(tables.epBenchmarks);
  const laufModell = await ladeLaufModell();
  const prognose = berechneEpPrognose(
    benchmarks.map((b) => ({
      datum: b.datum,
      disziplin: b.disziplin as DisziplinId,
      wert: b.wert,
    })),
    heuteIso(),
    profil.epDatum,
    lastlaufModellSekunden(laufModell, profil)
  );
  return { prognose, profil, laufModell };
}
