import { and, asc, desc, eq, gt, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { addTage } from "@/lib/format";
import {
  analysiereSchlaf,
  richtwerteAusScores,
  type SchlafAnalyse,
  type SchlafKernwerte,
  type SchlafNachtDaten,
} from "@/lib/engine/schlaf";
import type { SchlafEpoche, SchlafMetrik, SchlafZeitreihe } from "@/lib/engine/schlaf-parser";
import { getDb, tables } from "@/lib/db";
import { normalisiereSchlafNacht } from "@/lib/engine/schlaf-parser";

/**
 * Bereitet offene Nächte auf: sleep_nights.raw → sleep_epochen,
 * sleep_zeitreihen und die abgeleiteten Spalten (effizienz_proz,
 * einschlafzeit_s, anzahl_wachphasen).
 *
 * Offen = aufbereitet_am ist NULL oder älter als zuletzt_synchronisiert.
 * aufbereitet_am wird in SQL auf zuletzt_synchronisiert gesetzt (gleiche
 * µs-Genauigkeit), aber nur, wenn die Zeile noch den gelesenen Stand hat:
 * schreibt die Bridge währenddessen eine neuere Version, bleibt die Nacht
 * offen und wird beim nächsten Lauf erneut aufbereitet.
 *
 * Datenschutz: keine Schlafwerte in Logs oder Fehlermeldungen — nur Datum.
 */
export async function bereiteSchlafAuf(
  daten?: string[],
  limit = 30
): Promise<{ aufbereitet: number; fehlgeschlagen: string[] }> {
  if (daten && daten.length === 0) return { aufbereitet: 0, fehlgeschlagen: [] };
  const db = getDb();
  const n = tables.sleepNights;
  const offen = or(isNull(n.aufbereitetAm), lt(n.aufbereitetAm, n.zuletztSynchronisiert));

  const naechte = await db
    .select({
      datum: n.datum,
      raw: n.raw,
      hrvBaseline: n.hrvBaseline,
      zuletztSynchronisiert: n.zuletztSynchronisiert,
    })
    .from(n)
    .where(daten ? and(inArray(n.datum, daten), offen) : offen)
    .orderBy(desc(n.datum))
    .limit(Math.max(1, limit));

  let aufbereitet = 0;
  const fehlgeschlagen: string[] = [];
  for (const nacht of naechte) {
    try {
      await bereiteNachtAuf(nacht);
      aufbereitet++;
    } catch {
      // Originalfehler bewusst verworfen: DB-Meldungen können Werte enthalten
      fehlgeschlagen.push(nacht.datum);
    }
  }
  if (fehlgeschlagen.length) {
    console.error(`Schlaf-Aufbereitung fehlgeschlagen für ${fehlgeschlagen.join(", ")}`);
  }
  return { aufbereitet, fehlgeschlagen };
}

async function bereiteNachtAuf(nacht: {
  datum: string;
  raw: unknown;
  hrvBaseline: unknown;
  zuletztSynchronisiert: Date;
}): Promise<void> {
  const db = getDb();
  const { datum } = nacht;
  const norm = normalisiereSchlafNacht(nacht.raw, nacht.hrvBaseline);

  await db.transaction(async (tx) => {
    // Alte Aufbereitung der Nacht vollständig ersetzen (auch weggefallene
    // Metriken/Segmente verschwinden)
    await tx.delete(tables.sleepEpochen).where(eq(tables.sleepEpochen.datum, datum));
    await tx.delete(tables.sleepZeitreihen).where(eq(tables.sleepZeitreihen.datum, datum));

    if (norm && norm.epochen.length) {
      await tx.insert(tables.sleepEpochen).values(
        norm.epochen.map((e) => ({
          datum,
          art: e.art,
          start: new Date(e.startMs),
          dauerS: e.dauerS,
          level: e.level,
        }))
      );
    }
    const reihen = norm ? Object.entries(norm.zeitreihen) : [];
    if (reihen.length) {
      await tx.insert(tables.sleepZeitreihen).values(
        reihen.map(([metrik, z]) => ({
          datum,
          metrik,
          punkte: z.punkte,
          rohAnzahl: z.rohAnzahl,
          rohAufloesungS: z.rohAufloesungS,
          quelle: z.quelle,
        }))
      );
    }

    await tx
      .update(tables.sleepNights)
      .set({
        effizienzProz: norm?.nacht.effizienzProz ?? null,
        einschlafzeitS: norm?.nacht.einschlafzeitS ?? null,
        anzahlWachphasen: norm?.nacht.anzahlWachphasen ?? null,
        aufbereitetAm: sql`${tables.sleepNights.zuletztSynchronisiert}`,
      })
      .where(
        and(
          eq(tables.sleepNights.datum, datum),
          // JS-Date hat nur ms-Genauigkeit → Vergleich mit ±1 ms Toleranz
          sql`abs(extract(epoch from ${tables.sleepNights.zuletztSynchronisiert} - ${nacht.zuletztSynchronisiert.toISOString()}::timestamptz)) < 0.001`
        )
      );
  });
}

/* ------------------------------------------------------------------ */
/* Lesen: Analyse einer Nacht                                          */
/* ------------------------------------------------------------------ */


const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};
const positiv = (v: unknown) => {
  const n = num(v);
  return n != null && n > 0 ? n : null;
};

/** Kleine Felder aus raw per SQL (die ~100 KB Rohantwort wird nicht geladen) */
const rawFelder = () => {
  const n = tables.sleepNights;
  return {
    ruhepuls: sql<string | null>`${n.raw}->>'restingHeartRate'`,
    hrvMittel: sql<string | null>`${n.raw}->>'avgOvernightHrv'`,
    atemMittel: sql<string | null>`${n.raw}->'dailySleepDTO'->>'averageRespirationValue'`,
    spo2Min: sql<string | null>`${n.raw}->'dailySleepDTO'->>'lowestSpO2Value'`,
  };
};

function kernwerteAusZeile(r: {
  datum: string;
  schlafDauerS: number | null;
  effizienzProz: number | null;
  tiefS: number | null;
  leichtS: number | null;
  remS: number | null;
  garminScore: number | null;
  ruhepuls: string | null;
  hrvMittel: string | null;
  atemMittel: string | null;
  spo2Min: string | null;
}): SchlafKernwerte {
  const schlaf = (r.tiefS ?? 0) + (r.leichtS ?? 0) + (r.remS ?? 0);
  return {
    datum: r.datum,
    dauerS: r.schlafDauerS,
    effizienzProz: r.effizienzProz,
    hrvMittel: positiv(r.hrvMittel),
    ruhepuls: positiv(r.ruhepuls),
    atemMittel: positiv(r.atemMittel),
    spo2Min: positiv(r.spo2Min),
    tiefAnteilProz: r.tiefS != null && schlaf > 0 ? Math.round((r.tiefS / schlaf) * 1000) / 10 : null,
    tiefS: r.tiefS,
    garminScore: r.garminScore,
  };
}

export interface SchlafDetail {
  datum: string;
  vorher: string | null;
  nachher: string | null;
  epochen: SchlafEpoche[];
  zeitreihen: Partial<Record<SchlafMetrik, SchlafZeitreihe>>;
  analyse: SchlafAnalyse;
  /** Trend der letzten Nächte bis einschliesslich datum (für Kachel/Verlauf) */
  trend: { datum: string; dauerS: number | null; garminScore: number | null }[];
}

/**
 * Lädt eine Nacht samt 30 Vornächten (Baseline), Plan-Kontext und den
 * benachbarten Nächten. null, wenn für das Datum keine Nacht existiert.
 * Keine Schlafwerte in Logs oder Fehlermeldungen.
 */
export async function ladeSchlafDetail(datum: string): Promise<SchlafDetail | null> {
  const db = getDb();
  const n = tables.sleepNights;
  const [zeile] = await db
    .select({
      datum: n.datum,
      schlafStart: n.schlafStart,
      schlafEnde: n.schlafEnde,
      garminScore: n.garminScore,
      schlafDauerS: n.schlafDauerS,
      tiefS: n.tiefS,
      leichtS: n.leichtS,
      remS: n.remS,
      wachS: n.wachS,
      anzahlWachphasen: n.anzahlWachphasen,
      einschlafzeitS: n.einschlafzeitS,
      effizienzProz: n.effizienzProz,
      hrvBaseline: n.hrvBaseline,
      scores: sql<unknown>`${n.raw}->'dailySleepDTO'->'sleepScores'`,
      ...rawFelder(),
    })
    .from(n)
    .where(eq(n.datum, datum));
  if (!zeile) return null;

  // Bewusst nacheinander statt Promise.all: mehr parallele Abfragen als
  // Verbindungen (max: 4) pipelinet postgres.js auf eine Verbindung, was der
  // Supabase-Transaction-Pooler nicht verträgt (Hänger, siehe lib/db).
  const epochenRows = await db.select().from(tables.sleepEpochen).where(eq(tables.sleepEpochen.datum, datum)).orderBy(asc(tables.sleepEpochen.start));
  const reihenRows = await db.select().from(tables.sleepZeitreihen).where(eq(tables.sleepZeitreihen.datum, datum));
  const historieRows = await db
      .select({
        datum: n.datum,
        schlafDauerS: n.schlafDauerS,
        effizienzProz: n.effizienzProz,
        tiefS: n.tiefS,
        leichtS: n.leichtS,
        remS: n.remS,
        garminScore: n.garminScore,
        ...rawFelder(),
      })
      .from(n)
      .where(and(gte(n.datum, addTage(datum, -30)), lt(n.datum, datum)))
      .orderBy(asc(n.datum));
  const geplant = await db
      .select({ typ: tables.plannedWorkouts.typ, titel: tables.plannedWorkouts.titel })
      .from(tables.plannedWorkouts)
      .where(eq(tables.plannedWorkouts.datum, datum));
  const vorherRows = await db.select({ datum: n.datum }).from(n).where(lt(n.datum, datum)).orderBy(desc(n.datum)).limit(1);
  const nachherRows = await db.select({ datum: n.datum }).from(n).where(gt(n.datum, datum)).orderBy(asc(n.datum)).limit(1);
  const [vorher] = vorherRows;
  const [nachher] = nachherRows;

  const epochen: SchlafEpoche[] = epochenRows.map((e) => ({
    art: e.art as SchlafEpoche["art"],
    startMs: e.start.getTime(),
    dauerS: e.dauerS,
    level: e.level,
  }));
  const zeitreihen: SchlafDetail["zeitreihen"] = {};
  for (const r of reihenRows) {
    zeitreihen[r.metrik as SchlafMetrik] = {
      punkte: r.punkte,
      rohAnzahl: r.rohAnzahl,
      rohAufloesungS: r.rohAufloesungS,
      quelle: r.quelle,
    };
  }
  const b = (zeile.hrvBaseline ?? {}) as Record<string, unknown>;
  const basis = (b.baseline ?? {}) as Record<string, unknown>;
  const nacht: SchlafNachtDaten = {
    datum,
    schlafStartMs: zeile.schlafStart?.getTime() ?? null,
    schlafEndeMs: zeile.schlafEnde?.getTime() ?? null,
    garminScore: zeile.garminScore,
    schlafDauerS: zeile.schlafDauerS,
    tiefS: zeile.tiefS,
    leichtS: zeile.leichtS,
    remS: zeile.remS,
    wachS: zeile.wachS,
    anzahlWachphasen: zeile.anzahlWachphasen,
    einschlafzeitS: zeile.einschlafzeitS,
    effizienzProz: zeile.effizienzProz,
    ruhepuls: positiv(zeile.ruhepuls),
    hrvBaseline: zeile.hrvBaseline
      ? {
          balancedLow: num(basis.balancedLow),
          balancedUpper: num(basis.balancedUpper),
          lowUpper: num(basis.lowUpper),
          lastNightAvg: num(b.lastNightAvg),
          weeklyAvg: num(b.weeklyAvg),
          status: typeof b.status === "string" ? b.status : null,
        }
      : null,
    richtwerte: richtwerteAusScores(zeile.scores),
    epochen,
    zeitreihen,
  };
  const historie = historieRows.map(kernwerteAusZeile);
  const analyse = analysiereSchlaf(nacht, historie, { geplant }, {
    hrvMittel: positiv(zeile.hrvMittel),
    atemMittel: positiv(zeile.atemMittel),
    spo2Min: positiv(zeile.spo2Min),
  });
  const trend = [...historieRows.filter((h) => h.datum >= addTage(datum, -13)), zeile].map((h) => ({
    datum: h.datum,
    dauerS: h.schlafDauerS,
    garminScore: h.garminScore,
  }));
  return { datum, vorher: vorher?.datum ?? null, nachher: nachher?.datum ?? null, epochen, zeitreihen, analyse, trend };
}

/** Letzte Nacht mit Daten bis einschliesslich `bis` (für die Dashboard-Kachel) */
export async function letzteSchlafNacht(bis: string): Promise<string | null> {
  const db = getDb();
  const n = tables.sleepNights;
  const [r] = await db.select({ datum: n.datum }).from(n).where(lte(n.datum, bis)).orderBy(desc(n.datum)).limit(1);
  return r?.datum ?? null;
}
