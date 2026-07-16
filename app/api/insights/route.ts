import { NextResponse } from "next/server";
import { gte } from "drizzle-orm";
import { getDb, tables } from "@/lib/db";
import { korrelationsInsights } from "@/lib/engine/correlations";
import { addTage, heuteIso } from "@/lib/format";

/** GET /api/insights — Korrelations-Karten + regelbasierte Tipps */
export async function GET() {
  const db = getDb();
  const heute = heuteIso();
  const von = addTage(heute, -90);

  const [health, computed, muskeln] = await Promise.all([
    db.select().from(tables.dailyHealth).where(gte(tables.dailyHealth.datum, von)),
    db.select().from(tables.computedDaily).where(gte(tables.computedDaily.datum, von)),
    db.select().from(tables.muscleState).where(gte(tables.muscleState.datum, von)),
  ]);

  const healthProTag = new Map(health.map((h) => [h.datum, h]));
  const computedProTag = new Map(computed.map((c) => [c.datum, c]));
  const wadenProTag = new Map(
    muskeln.filter((m) => m.muskelId === "waden").map((m) => [m.datum, m.restbelastungProzent])
  );

  const tage = [];
  for (let d = von; d <= heute; d = addTage(d, 1)) {
    const h = healthProTag.get(d);
    const c = computedProTag.get(d);
    const folgetag = computedProTag.get(addTage(d, 1));
    tage.push({
      datum: d,
      schlafDauerH: h?.schlafDauerS != null ? h.schlafDauerS / 3600 : null,
      schlafScore: h?.schlafScore ?? null,
      hrv: h?.hrvLetzteNacht ?? null,
      ruhepuls: h?.ruhepuls ?? null,
      ctl: c?.ctl ?? null,
      efFolgetag: folgetag?.effizienzIndex ?? null,
      trimp: c?.trimpGesamt ?? null,
      wadenErschoepfung: wadenProTag.get(d) ?? null,
      hmTag: c?.hm ?? null,
    });
  }

  const karten = korrelationsInsights({ tage });

  /* Regelbasierte Tipps (EF-Trend) */
  const tipps: string[] = [];
  const efReihe = computed
    .filter((c) => c.effizienzIndex != null)
    .sort((a, b) => a.datum.localeCompare(b.datum));
  if (efReihe.length >= 6) {
    const drittel = Math.floor(efReihe.length / 3);
    const fruehe = efReihe.slice(0, drittel);
    const spaete = efReihe.slice(-drittel);
    const avg = (r: typeof efReihe) =>
      r.reduce((s, x) => s + (x.effizienzIndex as number), 0) / r.length;
    const delta = ((avg(spaete) - avg(fruehe)) / avg(fruehe)) * 100;
    if (delta > 1.5) {
      tipps.push(
        `Deine Effizienz (EF) ist um ${delta.toFixed(1)} % gestiegen — die Z2-Basis wirkt.`
      );
    } else if (delta < -1.5) {
      tipps.push(
        `Deine Effizienz (EF) ist um ${Math.abs(delta).toFixed(1)} % gesunken — zu viele harte Läufe oder zu wenig Erholung?`
      );
    }
  }

  return NextResponse.json({ karten, tipps });
}
