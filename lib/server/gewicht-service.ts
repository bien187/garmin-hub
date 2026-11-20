import { and, asc, count, gte, isNull } from "drizzle-orm";
import { getDb, tables } from "@/lib/db";
import { addTage, isoDatum } from "@/lib/format";
import {
  bewerteAlle,
  komposition,
  standardTrend,
  veraenderung,
  type Aktivitaetsfenster,
  type BewerteteMessung,
  type Klasse,
  type KompositionsReihe,
  type Messbedingungen,
  type TrendPunkt,
} from "@/lib/engine/gewicht";

export interface GewichtDaten {
  /** false, solange die Tabellen fehlen (Migration 0003 nicht angewendet) */
  verfuegbar: boolean;
  /** alle Messungen, älteste zuerst — Rohwerte unverändert */
  messungen: BewerteteMessung[];
  /** standardisierter Trend: gleitender 7-Tage-Median */
  trend7: TrendPunkt[];
  /** längerfristige Entwicklung: gleitender 30-Tage-Median (≥ 10 Tageswerte) */
  trend30: TrendPunkt[];
  komposition: KompositionsReihe[];
}

/** Kompakte Sicht für die Dashboard-Karte */
export interface GewichtKurz {
  aktuellKg: number;
  datum: string;
  zeitpunkt: string;
  klasse: Klasse;
  trendKg: number | null;
  veraenderung7: number | null;
  veraenderung30: number | null;
  /** Trendwerte der letzten 30 Tage (für die Mini-Linie) */
  verlauf: { datum: string; kg: number }[];
}

const LEER: GewichtDaten = { verfuegbar: false, messungen: [], trend7: [], trend30: [], komposition: [] };

export async function ladeGewicht(): Promise<GewichtDaten> {
  const db = getDb();
  let zeilen: (typeof tables.gewichtMessungen.$inferSelect)[];
  let bedRows: (typeof tables.gewichtBedingungen.$inferSelect)[];
  try {
    [zeilen, bedRows] = await Promise.all([
      db.select().from(tables.gewichtMessungen).orderBy(asc(tables.gewichtMessungen.zeitpunkt)),
      db.select().from(tables.gewichtBedingungen),
    ]);
  } catch {
    // Tabelle fehlt (Migration noch nicht angewendet) — nicht verfügbar statt Fehler
    return LEER;
  }
  if (zeilen.length === 0) return { ...LEER, verfuegbar: true };

  const bedingungen: Record<string, Messbedingungen> = {};
  for (const r of bedRows) {
    bedingungen[r.messungId] = {
      nuechtern: r.nuechtern,
      vorFruehstueck: r.vorFruehstueck,
      nachToilette: r.nachToilette,
      mahlzeitVorMin: r.mahlzeitVorMin,
      fluessigkeitVorMin: r.fluessigkeitVorMin,
      trainingVorMin: r.trainingVorMin,
      badSauna: r.badSauna,
    };
  }

  /* Trainings rund um die Messungen (Abstand Sport → Messung automatisch) */
  const ab = new Date(addTage(isoDatum(new Date(zeilen[0].zeitpunkt)), -2) + "T00:00:00");
  const [akts, [gesamt]] = await Promise.all([
    db
      .select({ start: tables.activities.startZeit, dauerS: tables.activities.dauerS })
      .from(tables.activities)
      .where(and(gte(tables.activities.startZeit, ab), isNull(tables.activities.deletedAt))),
    db.select({ n: count() }).from(tables.activities).where(isNull(tables.activities.deletedAt)),
  ]);
  // Ohne jede synchronisierte Aktivität ist „kein Training" nicht belegt → unbekannt
  const fenster: Aktivitaetsfenster[] | null =
    Number(gesamt?.n ?? 0) > 0
      ? akts.map((a) => {
          const startMs = new Date(a.start).getTime();
          return { startMs, endeMs: startMs + a.dauerS * 1000 };
        })
      : null;

  const messungen = bewerteAlle(
    zeilen.map((z) => ({
      id: z.id,
      zeitpunkt: new Date(z.zeitpunkt).toISOString(),
      datum: z.datum,
      gewichtKg: z.gewichtKg,
      bmi: z.bmi,
      koerperfettProz: z.koerperfettProz,
      koerperwasserProz: z.koerperwasserProz,
      muskelmasseKg: z.muskelmasseKg,
      knochenmasseKg: z.knochenmasseKg,
      quelle: z.quelle,
    })),
    bedingungen,
    fenster
  );
  return {
    verfuegbar: true,
    messungen,
    trend7: standardTrend(messungen, 7, 3),
    trend30: standardTrend(messungen, 30, 10),
    komposition: (["koerperfettProz", "muskelmasseKg", "koerperwasserProz", "bmi"] as const).map((f) =>
      komposition(messungen, f)
    ),
  };
}

/** Dashboard-Karte aus den vollständigen Daten (rein, auch für die Demo) */
export function gewichtKurzAus(d: GewichtDaten, heute: string): GewichtKurz | null {
  const letzte = d.messungen.at(-1);
  if (!letzte) return null;
  const ab = addTage(heute, -30);
  return {
    aktuellKg: letzte.gewichtKg,
    datum: letzte.datum,
    zeitpunkt: letzte.zeitpunkt,
    klasse: letzte.qualitaet.klasse,
    trendKg: d.trend7.at(-1)?.kg ?? null,
    veraenderung7: veraenderung(d.trend7, 7)?.kg ?? null,
    veraenderung30: veraenderung(d.trend7, 30)?.kg ?? null,
    verlauf: d.trend7.filter((p) => p.datum >= ab).map(({ datum, kg }) => ({ datum, kg })),
  };
}
