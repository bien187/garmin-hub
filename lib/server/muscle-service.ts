import { gte, inArray } from "drizzle-orm";
import { getDb, tables } from "@/lib/db";
import { ladeProfil } from "@/lib/profile";
import { trimpFuerEinheit } from "@/lib/engine/trimp";
import {
  Lasten,
  lastenAusKraft,
  lastenAusLauf,
} from "@/lib/engine/muscle";
import { istKraft, istLauf } from "./compute";

export interface MuskelBeitrag {
  activityId: number;
  name: string | null;
  typ: string;
  startZeit: Date;
  lasten: Lasten;
}

/** Muskel-Lastereignisse der letzten `tage` Tage inkl. Aktivitäts-Metadaten */
export async function ladeMuskelBeitraege(tage = 7): Promise<MuskelBeitrag[]> {
  const db = getDb();
  const profil = await ladeProfil();
  const seit = new Date(Date.now() - tage * 86_400_000);

  const acts = await db
    .select({
      id: tables.activities.id,
      typ: tables.activities.typ,
      name: tables.activities.name,
      startZeit: tables.activities.startZeit,
      dauerS: tables.activities.dauerS,
      distanzM: tables.activities.distanzM,
      hmAuf: tables.activities.hmAuf,
      hmAb: tables.activities.hmAb,
      avgHr: tables.activities.avgHr,
    })
    .from(tables.activities)
    .where(gte(tables.activities.startZeit, seit));

  const kraftIds = acts.filter((a) => istKraft(a.typ)).map((a) => a.id);
  const saetze = kraftIds.length
    ? await db
        .select()
        .from(tables.strengthSets)
        .where(inArray(tables.strengthSets.activityId, kraftIds))
    : [];

  const beitraege: MuskelBeitrag[] = [];
  for (const a of acts) {
    let lasten: Lasten = {};
    if (istKraft(a.typ)) {
      const eigene = saetze.filter((s) => s.activityId === a.id);
      if (eigene.length > 0) {
        lasten = lastenAusKraft(
          eigene.map((s) => ({
            uebungKey: s.uebungName,
            saetze: s.saetze || 1,
            wdh: s.wdh,
            gewichtKg: s.gewichtKg,
          })),
          profil.gewichtKg
        );
      }
    } else if (istLauf(a.typ) || (a.distanzM ?? 0) > 500) {
      const trimp = trimpFuerEinheit({
        dauerS: a.dauerS,
        avgHr: a.avgHr,
        istKraft: false,
        hrRuhe: profil.ruhepuls,
        hrMax: profil.hfMax,
      });
      lasten = lastenAusLauf({
        trimp,
        hmAuf: a.hmAuf ?? 0,
        hmAb: a.hmAb ?? 0,
        distanzM: a.distanzM ?? 0,
        istLastlauf: (a.name ?? "").toLowerCase().includes("lastlauf"),
      });
    }
    if (Object.keys(lasten).length > 0) {
      beitraege.push({
        activityId: a.id,
        name: a.name,
        typ: a.typ,
        startZeit: a.startZeit,
        lasten,
      });
    }
  }
  return beitraege;
}
