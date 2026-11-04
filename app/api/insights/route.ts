import { NextResponse } from "next/server";
import { and, asc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { getDb, tables } from "@/lib/db";
import { korrelationsInsights } from "@/lib/engine/correlations";
import { addTage, heuteIso, isoDatum } from "@/lib/format";
import { trainingsstartAus } from "@/lib/engine/fortschritt";

/**
 * GET /api/insights — Korrelations-Karten + regelbasierte Tipps über die
 * gesamte Historie seit Trainingsstart (erster Tag in computed_daily,
 * nie vor der ersten nicht gelöschten Aktivität).
 * Davor gibt es keine Trainingsmetriken, jedes Paar bräuchte aber eine —
 * ältere daily_health-Tage würden nur leere Paare liefern.
 */
export async function GET() {
  const db = getDb();
  const heute = heuteIso();

  const [alleComputed, [erste]] = await Promise.all([
    db
      .select()
      .from(tables.computedDaily)
      .where(lte(tables.computedDaily.datum, heute))
      .orderBy(asc(tables.computedDaily.datum)),
    db
      .select({ seit: sql<string | null>`min(${tables.activities.startZeit})` })
      .from(tables.activities)
      .where(isNull(tables.activities.deletedAt)),
  ]);
  // Wie im Dashboard: veraltete Zeilen vor der ersten nicht gelöschten Aktivität ignorieren
  const von =
    trainingsstartAus(alleComputed[0]?.datum, erste?.seit ? isoDatum(new Date(erste.seit)) : null) ?? heute;
  const computed = alleComputed.filter((c) => c.datum >= von);

  const [health, muskeln] = await Promise.all([
    db
      .select()
      .from(tables.dailyHealth)
      .where(and(gte(tables.dailyHealth.datum, von), lte(tables.dailyHealth.datum, heute))),
    db
      .select({ datum: tables.muscleState.datum, restbelastungProzent: tables.muscleState.restbelastungProzent })
      .from(tables.muscleState)
      .where(and(eq(tables.muscleState.muskelId, "waden"), gte(tables.muscleState.datum, von))),
  ]);

  const healthProTag = new Map(health.map((h) => [h.datum, h]));
  const computedProTag = new Map(computed.map((c) => [c.datum, c]));
  const wadenProTag = new Map(muskeln.map((m) => [m.datum, m.restbelastungProzent]));

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
  const efReihe = computed.filter((c) => c.effizienzIndex != null);
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
