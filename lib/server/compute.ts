import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { getDb, tables } from "@/lib/db";
import { ladeProfil, speichereProfil } from "@/lib/profile";
import { trimpFuerEinheit } from "@/lib/engine/trimp";
import { berechneFitnessSerie } from "@/lib/engine/fitness";
import { effizienzIndex } from "@/lib/engine/efficiency";
import { bestEffort, fuenfKmPrognose } from "@/lib/engine/riegel";
import { gapAusStreams } from "@/lib/engine/gap";
import { kalibriereZuschlag, LastlaufMessung } from "@/lib/engine/paces";
import {
  LastEreignis,
  lastenAusKraft,
  lastenAusLauf,
  MUSKELGRUPPEN,
  restErschoepfung,
} from "@/lib/engine/muscle";
import { addTage, heuteIso, isoDatum, tageDiff } from "@/lib/format";

const LAUF_TYPEN = ["running", "trail_running", "street_running", "track_running", "treadmill_running"];
const KRAFT_TYPEN = ["strength_training", "indoor_cardio", "fitness_equipment"];

export function istLauf(typ: string): boolean {
  return LAUF_TYPEN.includes(typ) || typ.includes("running");
}

export function istKraft(typ: string): boolean {
  return KRAFT_TYPEN.includes(typ) || typ.includes("strength");
}

function istLastlaufAktivitaet(name: string | null): boolean {
  const n = (name ?? "").toLowerCase();
  return n.includes("lastlauf") || n.includes("ruck") || n.includes("weste");
}

/**
 * Materialisiert alle abgeleiteten Daten nach einem Sync:
 *  - computed_daily (TRIMP, CTL/ATL/TSB, ACWR, km, Hm, EF)
 *  - muscle_state (letzte 60 Tage)
 *  - Lauf-Modell (5-km-Prognose aus Best Efforts) + Lastlauf-Kalibrierung
 *  - Ruhepuls-Update im Profil
 *  - Matching geplanter Einheiten mit Aktivitäten
 */
export async function recomputeAll(): Promise<void> {
  const db = getDb();
  const profil = await ladeProfil();

  const alleAktivitaeten = await db
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
    .where(isNull(tables.activities.deletedAt));

  if (alleAktivitaeten.length === 0) return;

  /* ---- Ruhepuls live aus Garmin (Median der letzten 7 Tage) ---- */
  const heute = heuteIso();
  const rhrRows = await db
    .select({ ruhepuls: tables.dailyHealth.ruhepuls })
    .from(tables.dailyHealth)
    .where(gte(tables.dailyHealth.datum, addTage(heute, -7)));
  const rhrWerte = rhrRows
    .map((r) => r.ruhepuls)
    .filter((v): v is number => v != null && v > 25 && v < 100)
    .sort((a, b) => a - b);
  if (rhrWerte.length >= 3) {
    const median = rhrWerte[Math.floor(rhrWerte.length / 2)];
    if (Math.abs(median - profil.ruhepuls) >= 1) {
      await speichereProfil({ ruhepuls: median });
      profil.ruhepuls = median;
    }
  }

  /* ---- Kraft-Volumen pro Aktivität ---- */
  const kraftIds = alleAktivitaeten.filter((a) => istKraft(a.typ)).map((a) => a.id);
  const saetze = kraftIds.length
    ? await db
        .select()
        .from(tables.strengthSets)
        .where(inArray(tables.strengthSets.activityId, kraftIds))
    : [];
  const saetzeProAktivitaet = new Map<number, typeof saetze>();
  for (const s of saetze) {
    const list = saetzeProAktivitaet.get(s.activityId) ?? [];
    list.push(s);
    saetzeProAktivitaet.set(s.activityId, list);
  }
  const volumenProAktivitaet = new Map<number, number>();
  for (const [id, list] of saetzeProAktivitaet) {
    let vol = 0;
    for (const s of list) {
      const gewicht = s.gewichtKg ?? profil.gewichtKg * 0.55;
      vol += (s.saetze || 1) * (s.wdh ?? 8) * gewicht;
    }
    volumenProAktivitaet.set(id, vol);
  }

  /* ---- TRIMP pro Aktivität + Tagesaggregation ---- */
  const trimpProAktivitaet = new Map<number, number>();
  interface TagAgg {
    trimp: number;
    laufKm: number;
    hm: number;
    efWerte: number[];
  }
  const proTag = new Map<string, TagAgg>();

  for (const a of alleAktivitaeten) {
    const trimp = trimpFuerEinheit({
      dauerS: a.dauerS,
      avgHr: a.avgHr,
      istKraft: istKraft(a.typ),
      volumenKg: volumenProAktivitaet.get(a.id),
      hrRuhe: profil.ruhepuls,
      hrMax: profil.hfMax,
    });
    trimpProAktivitaet.set(a.id, trimp);

    const datum = isoDatum(new Date(a.startZeit));
    const agg = proTag.get(datum) ?? { trimp: 0, laufKm: 0, hm: 0, efWerte: [] };
    agg.trimp += trimp;
    if (istLauf(a.typ)) {
      agg.laufKm += (a.distanzM ?? 0) / 1000;
      const ef = effizienzIndex({
        dauerS: a.dauerS,
        distanzM: a.distanzM ?? 0,
        avgHr: a.avgHr,
        hmAuf: a.hmAuf,
      });
      if (ef != null) agg.efWerte.push(ef);
    }
    agg.hm += a.hmAuf ?? 0;
    proTag.set(datum, agg);
  }

  /* ---- Lückenlose Tagesserie + Fitness ---- */
  const daten = [...proTag.keys()].sort();
  const start = daten[0];
  const serieTage: { datum: string; trimp: number }[] = [];
  for (let d = start; d <= heute; d = addTage(d, 1)) {
    serieTage.push({ datum: d, trimp: proTag.get(d)?.trimp ?? 0 });
  }
  const fitness = berechneFitnessSerie(serieTage);

  const computedRows = fitness.map((f) => {
    const agg = proTag.get(f.datum);
    const efWerte = agg?.efWerte ?? [];
    return {
      datum: f.datum,
      trimpGesamt: f.trimp,
      ctl: f.ctl,
      atl: f.atl,
      tsb: f.tsb,
      acwr: f.acwr,
      laufKm: agg?.laufKm ?? 0,
      hm: agg?.hm ?? 0,
      effizienzIndex: efWerte.length
        ? efWerte.reduce((a, b) => a + b, 0) / efWerte.length
        : null,
    };
  });

  // Upsert in Batches
  for (let i = 0; i < computedRows.length; i += 500) {
    const batch = computedRows.slice(i, i + 500);
    await db
      .insert(tables.computedDaily)
      .values(batch)
      .onConflictDoUpdate({
        target: tables.computedDaily.datum,
        set: {
          trimpGesamt: sql`excluded.trimp_gesamt`,
          ctl: sql`excluded.ctl`,
          atl: sql`excluded.atl`,
          tsb: sql`excluded.tsb`,
          acwr: sql`excluded.acwr`,
          laufKm: sql`excluded.lauf_km`,
          hm: sql`excluded.hm`,
          effizienzIndex: sql`excluded.effizienz_index`,
        },
      });
  }

  /* ---- Muskel-Erschöpfung: Ereignisse + Materialisierung 60 Tage ---- */
  const ereignisse: LastEreignis[] = [];
  for (const a of alleAktivitaeten) {
    const zeitpunktMs = new Date(a.startZeit).getTime() + a.dauerS * 1000;
    if (istKraft(a.typ)) {
      const list = saetzeProAktivitaet.get(a.id) ?? [];
      if (list.length > 0) {
        ereignisse.push({
          zeitpunktMs,
          lasten: lastenAusKraft(
            list.map((s) => ({
              uebungKey: s.uebungName,
              saetze: s.saetze || 1,
              wdh: s.wdh,
              gewichtKg: s.gewichtKg,
            })),
            profil.gewichtKg
          ),
        });
      } else {
        // Kraft ohne Satzdaten: pauschale Ganzkörperlast aus TRIMP
        const trimp = trimpProAktivitaet.get(a.id) ?? 0;
        ereignisse.push({
          zeitpunktMs,
          lasten: {
            brust: trimp * 0.3,
            oberer_ruecken_lat: trimp * 0.3,
            schultern: trimp * 0.25,
            bizeps: trimp * 0.2,
            trizeps: trimp * 0.2,
            bauch: trimp * 0.15,
          },
        });
      }
    } else if (istLauf(a.typ) || (a.distanzM ?? 0) > 500) {
      ereignisse.push({
        zeitpunktMs,
        lasten: lastenAusLauf({
          trimp: trimpProAktivitaet.get(a.id) ?? 0,
          hmAuf: a.hmAuf ?? 0,
          hmAb: a.hmAb ?? 0,
          distanzM: a.distanzM ?? 0,
          istLastlauf: istLastlaufAktivitaet(a.name),
        }),
      });
    }
  }

  const muskelRows: { datum: string; muskelId: string; restbelastungProzent: number }[] = [];
  const vor60 = addTage(heute, -60);
  for (let d = vor60; d <= heute; d = addTage(d, 1)) {
    const zeitpunkt =
      d === heute ? Date.now() : new Date(d + "T23:59:00").getTime();
    const relevant = ereignisse.filter(
      (e) => e.zeitpunktMs <= zeitpunkt && zeitpunkt - e.zeitpunktMs < 14 * 86_400_000
    );
    const rest = restErschoepfung(relevant, zeitpunkt);
    for (const m of MUSKELGRUPPEN) {
      muskelRows.push({
        datum: d,
        muskelId: m.id,
        restbelastungProzent: Math.round(rest[m.id] * 10) / 10,
      });
    }
  }
  for (let i = 0; i < muskelRows.length; i += 500) {
    const batch = muskelRows.slice(i, i + 500);
    await db
      .insert(tables.muscleState)
      .values(batch)
      .onConflictDoUpdate({
        target: [tables.muscleState.datum, tables.muscleState.muskelId],
        set: { restbelastungProzent: sql`excluded.restbelastung_prozent` },
      });
  }

  /* ---- Lauf-Modell: Best Efforts der letzten 6 Wochen ---- */
  await berechneLaufModell(alleAktivitaeten);

  /* ---- Geplante Einheiten mit Aktivitäten matchen ---- */
  await matcheGeplanteEinheiten();
}

async function berechneLaufModell(
  alleAktivitaeten: {
    id: number;
    typ: string;
    name: string | null;
    startZeit: Date;
    dauerS: number;
    distanzM: number | null;
  }[]
): Promise<void> {
  const db = getDb();
  const heute = heuteIso();
  const grenze = addTage(heute, -42);

  const laeufe = alleAktivitaeten
    .filter(
      (a) =>
        istLauf(a.typ) &&
        (a.distanzM ?? 0) >= 1000 &&
        isoDatum(new Date(a.startZeit)) >= grenze &&
        !istLastlaufAktivitaet(a.name)
    )
    .sort((a, b) => (b.distanzM ?? 0) - (a.distanzM ?? 0))
    .slice(0, 20);

  if (laeufe.length === 0) return;

  const streams = await db
    .select()
    .from(tables.activityStreams)
    .where(inArray(tables.activityStreams.activityId, laeufe.map((l) => l.id)));

  const efforts: { distanzM: number; zeitS: number; paceSKm: number }[] = [];
  for (const s of streams) {
    if (!s.zeitS || !s.distanzM) continue;
    for (const ziel of [1000, 5000, 10000]) {
      const e = bestEffort(s.zeitS, s.distanzM, ziel);
      if (e) efforts.push(e);
    }
  }
  // Fallback ohne Streams: Aktivitäts-Summenwerte als Effort
  if (efforts.length === 0) {
    for (const l of laeufe) {
      if ((l.distanzM ?? 0) >= 3000) {
        efforts.push({
          distanzM: l.distanzM as number,
          zeitS: l.dauerS,
          paceSKm: l.dauerS / ((l.distanzM as number) / 1000),
        });
      }
    }
  }

  const fuenfKm = fuenfKmPrognose(efforts);

  /* Lastlauf-Kalibrierung: Lastläufe vs. unbelastete GAP-Pace */
  const lastlaeufe = alleAktivitaeten.filter(
    (a) => istLauf(a.typ) && istLastlaufAktivitaet(a.name) && (a.distanzM ?? 0) >= 2000
  );
  const messungen: LastlaufMessung[] = [];
  if (fuenfKm != null && lastlaeufe.length > 0) {
    const lastStreams = await db
      .select()
      .from(tables.activityStreams)
      .where(inArray(tables.activityStreams.activityId, lastlaeufe.map((l) => l.id)));
    const basisPace = fuenfKm / 5;
    for (const a of lastlaeufe) {
      const kg = extrahiereKg(a.name);
      if (kg == null) continue;
      const s = lastStreams.find((x) => x.activityId === a.id);
      let pace: number | null = null;
      if (s?.zeitS && s.distanzM && s.ele) {
        pace = gapAusStreams(s.zeitS, s.distanzM, s.ele)?.gapPaceSKm ?? null;
      }
      if (pace == null && a.distanzM) {
        pace = a.dauerS / (a.distanzM / 1000);
      }
      if (pace != null) {
        messungen.push({ zusatzlastKg: kg, paceDifferenzSproKm: pace - basisPace });
      }
    }
  }
  const kalibriert = kalibriereZuschlag(messungen);
  if (kalibriert != null) {
    await speichereProfil({ lastZuschlagSproKmPro10kg: kalibriert });
  }

  await db
    .insert(tables.appSettings)
    .values({
      key: "lauf_modell",
      value: { fuenfKmS: fuenfKm, anzahlEfforts: efforts.length, berechnetAm: heute },
    })
    .onConflictDoUpdate({
      target: tables.appSettings.key,
      set: {
        value: { fuenfKmS: fuenfKm, anzahlEfforts: efforts.length, berechnetAm: heute },
      },
    });
}

function extrahiereKg(name: string | null): number | null {
  const m = (name ?? "").match(/(\d{1,2})\s*kg/i);
  return m ? parseInt(m[1], 10) : null;
}

/** Geplante Einheiten automatisch abhaken: Typ + Datum + Dauer-Toleranz ±35 % */
export async function matcheGeplanteEinheiten(): Promise<void> {
  const db = getDb();
  const heute = heuteIso();
  const offene = await db
    .select()
    .from(tables.plannedWorkouts)
    .where(
      and(
        inArray(tables.plannedWorkouts.status, ["geplant", "gepusht"]),
        gte(tables.plannedWorkouts.datum, addTage(heute, -21))
      )
    );
  if (offene.length === 0) return;

  const aktivitaeten = await db
    .select({
      id: tables.activities.id,
      typ: tables.activities.typ,
      startZeit: tables.activities.startZeit,
      dauerS: tables.activities.dauerS,
    })
    .from(tables.activities)
    .where(
      and(
        gte(tables.activities.startZeit, new Date(addTage(heute, -22) + "T00:00:00")),
        isNull(tables.activities.deletedAt)
      )
    );

  const laufPlanTypen = ["lauf_z2", "intervalle", "huegel_intervalle", "langer_lauf", "lastlauf", "probe_ep"];

  for (const p of offene) {
    if (p.typ === "ruhe" || p.typ === "gtg") continue;
    const kandidaten = aktivitaeten.filter((a) => {
      if (isoDatum(new Date(a.startZeit)) !== p.datum) return false;
      const brauchtLauf = laufPlanTypen.includes(p.typ);
      return brauchtLauf ? istLauf(a.typ) : istKraft(a.typ);
    });
    if (kandidaten.length === 0) {
      // Verpasst, wenn Datum > 1 Tag vorbei
      if (tageDiff(p.datum, heute) > 1) {
        await db
          .update(tables.plannedWorkouts)
          .set({ status: "verpasst" })
          .where(eq(tables.plannedWorkouts.id, p.id));
      }
      continue;
    }
    // Dauer-Toleranz, wenn erwartete Dauer bekannt
    const erwartetS = erwarteteDauerS(p.struktur as Record<string, unknown> | null);
    let bester = kandidaten[0];
    if (erwartetS != null) {
      bester = kandidaten.reduce((b, k) =>
        Math.abs(k.dauerS - erwartetS) < Math.abs(b.dauerS - erwartetS) ? k : b
      );
      if (Math.abs(bester.dauerS - erwartetS) / erwartetS > 0.35) {
        continue; // zu weit weg — nicht automatisch abhaken
      }
    }
    await db
      .update(tables.plannedWorkouts)
      .set({ status: "absolviert", matchedActivityId: bester.id })
      .where(eq(tables.plannedWorkouts.id, p.id));
  }
}

function erwarteteDauerS(struktur: Record<string, unknown> | null): number | null {
  if (!struktur || !Array.isArray(struktur.schritte)) return null;
  let summe = 0;
  const addiere = (schritte: unknown[]): void => {
    for (const s of schritte as Record<string, unknown>[]) {
      const wdh = typeof s.wiederholungen === "number" ? s.wiederholungen : 1;
      if (Array.isArray(s.schritte)) {
        for (let i = 0; i < wdh; i++) addiere(s.schritte);
      } else if (s.dauerTyp === "zeit" && typeof s.dauerWert === "number") {
        summe += s.dauerWert;
      } else if (s.dauerTyp === "distanz" && typeof s.dauerWert === "number") {
        summe += (s.dauerWert / 1000) * 360; // grobe 6:00/km-Annahme
      }
    }
  };
  addiere(struktur.schritte);
  return summe > 0 ? summe : null;
}
