import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
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
