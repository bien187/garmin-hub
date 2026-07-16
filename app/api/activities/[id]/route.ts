import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, tables } from "@/lib/db";
import { ladeProfil, hrZonen } from "@/lib/profile";
import { gapAusStreams } from "@/lib/engine/gap";
import {
  aerobeEntkopplung,
  effizienzIndex,
  zonenVerteilung,
} from "@/lib/engine/efficiency";
import { mappeUebung } from "@/lib/engine/muscle";

/** GET /api/activities/[id] — Detail inkl. Streams + berechneter Metriken */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const activityId = Number(id);
  if (!Number.isFinite(activityId)) {
    return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
  }

  const db = getDb();
  const [aktivitaet] = await db
    .select()
    .from(tables.activities)
    .where(eq(tables.activities.id, activityId));
  if (!aktivitaet) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }

  const [streams] = await db
    .select()
    .from(tables.activityStreams)
    .where(eq(tables.activityStreams.activityId, activityId));

  const saetze = await db
    .select()
    .from(tables.strengthSets)
    .where(eq(tables.strengthSets.activityId, activityId));

  const profil = await ladeProfil();
  const zonen = hrZonen(profil);

  let gap = null;
  let entkopplung: number | null = null;
  let zonenZeit = null;
  if (streams?.zeitS) {
    if (streams.distanzM && streams.ele) {
      gap = gapAusStreams(streams.zeitS, streams.distanzM, streams.ele);
    }
    if (streams.distanzM && streams.hr) {
      entkopplung = aerobeEntkopplung(streams.zeitS, streams.distanzM, streams.hr);
    }
    if (streams.hr) {
      zonenZeit = zonenVerteilung(streams.zeitS, streams.hr, zonen);
    }
  }

  const ef = effizienzIndex({
    dauerS: aktivitaet.dauerS,
    distanzM: aktivitaet.distanzM ?? 0,
    avgHr: aktivitaet.avgHr,
    hmAuf: aktivitaet.hmAuf,
  });

  /* Splits pro km aus Streams */
  const splits: { km: number; zeitS: number; paceSKm: number; hmAuf: number }[] = [];
  if (streams?.zeitS && streams.distanzM) {
    let kmGrenze = 1000;
    let letzteZeit = streams.zeitS[0] ?? 0;
    let letzteEle: number | null = null;
    let hmAuf = 0;
    for (let i = 0; i < streams.zeitS.length; i++) {
      const d = streams.distanzM[i];
      const e = streams.ele?.[i] ?? null;
      if (e != null && letzteEle != null && e > letzteEle) hmAuf += e - letzteEle;
      if (e != null) letzteEle = e;
      if (d != null && d >= kmGrenze) {
        const zeit = streams.zeitS[i] - letzteZeit;
        splits.push({
          km: kmGrenze / 1000,
          zeitS: zeit,
          paceSKm: zeit,
          hmAuf: Math.round(hmAuf),
        });
        letzteZeit = streams.zeitS[i];
        hmAuf = 0;
        kmGrenze += 1000;
      }
    }
  }

  return NextResponse.json({
    aktivitaet,
    streams: streams ?? null,
    saetze: saetze.map((s) => ({
      ...s,
      muskelgruppen: s.muskelgruppen ?? mappeUebung(s.uebungName).haupt,
    })),
    metriken: {
      gapPaceSKm: gap?.gapPaceSKm ?? null,
      istPaceSKm: gap?.istPaceSKm ?? aktivitaet.avgPace,
      entkopplung,
      effizienzIndex: ef,
      zonenZeit,
      splits,
      zonen,
    },
  });
}
