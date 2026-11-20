/**
 * Wochenstatistik und Wochenverlauf für das Dashboard — rein, ohne DB.
 *
 * Alle Werte stammen aus echten Aktivitäten. Fehlt eine Grösse (z. B. kein
 * Lauf mit Distanz, kein Puls), ist sie `null` und wird als „nicht
 * verfügbar" angezeigt — nie als 0.
 */

import { addTage, montagVon } from "@/lib/format";
import { istLauf } from "./sport";

export interface StatAktivitaet {
  /** Kalendertag der Aktivität (ISO, Europe/Zurich) */
  datum: string;
  typ: string;
  dauerS: number;
  distanzM: number | null;
  avgHr: number | null;
}

export interface Wochenwerte {
  /** Anzahl Trainingseinheiten (alle Sportarten) */
  einheiten: number;
  /** Trainingszeit aller Einheiten in Sekunden */
  dauerS: number;
  laeufe: number;
  laufKm: number;
  laufDauerS: number;
  /** Ø Pace aller Läufe mit Distanz (Zeit/Distanz), s/km */
  laufPaceSKm: number | null;
  /** Ø Herzfrequenz aller Einheiten mit Puls, zeitgewichtet */
  avgHr: number | null;
}

const runde1 = (n: number) => Math.round(n * 10) / 10;

/** Kennzahlen der Aktivitäten zwischen `von` und `bis` (inklusiv) */
export function wochenwerte(akts: readonly StatAktivitaet[], von: string, bis: string): Wochenwerte {
  const inWoche = akts.filter((a) => a.datum >= von && a.datum <= bis && a.dauerS > 0);
  const laeufe = inWoche.filter((a) => istLauf(a.typ));
  const mitDistanz = laeufe.filter((a) => (a.distanzM ?? 0) > 0);
  const distanzM = mitDistanz.reduce((s, a) => s + (a.distanzM ?? 0), 0);
  const distanzZeitS = mitDistanz.reduce((s, a) => s + a.dauerS, 0);
  const mitPuls = inWoche.filter((a) => a.avgHr != null && a.avgHr > 0);
  const pulsZeit = mitPuls.reduce((s, a) => s + a.dauerS, 0);
  return {
    einheiten: inWoche.length,
    dauerS: Math.round(inWoche.reduce((s, a) => s + a.dauerS, 0)),
    laeufe: laeufe.length,
    laufKm: runde1(laeufe.reduce((s, a) => s + (a.distanzM ?? 0), 0) / 1000),
    laufDauerS: Math.round(laeufe.reduce((s, a) => s + a.dauerS, 0)),
    laufPaceSKm: distanzM >= 500 ? Math.round(distanzZeitS / (distanzM / 1000)) : null,
    avgHr: pulsZeit > 0 ? Math.round(mitPuls.reduce((s, a) => s + (a.avgHr as number) * a.dauerS, 0) / pulsZeit) : null,
  };
}

export interface VerlaufWoche {
  /** Montag der Woche (ISO) */
  woche: string;
  laufKm: number;
  laufMin: number;
  /** Trainingszeit aller Einheiten in Stunden */
  stunden: number;
  einheiten: number;
  laufPaceSKm: number | null;
  avgHr: number | null;
}

/** Die letzten `anzahl` Kalenderwochen (älteste zuerst, letzte = laufende Woche) */
export function wochenVerlauf(akts: readonly StatAktivitaet[], heute: string, anzahl = 12): VerlaufWoche[] {
  const dieseWoche = montagVon(heute);
  const out: VerlaufWoche[] = [];
  for (let i = anzahl - 1; i >= 0; i--) {
    const woche = addTage(dieseWoche, -7 * i);
    const bis = i === 0 ? heute : addTage(woche, 6);
    const w = wochenwerte(akts, woche, bis);
    out.push({
      woche,
      laufKm: w.laufKm,
      laufMin: Math.round(w.laufDauerS / 60),
      stunden: runde1(w.dauerS / 3600),
      einheiten: w.einheiten,
      laufPaceSKm: w.laufPaceSKm,
      avgHr: w.avgHr,
    });
  }
  return out;
}

export interface WochenTag {
  datum: string;
  /** geplante Einheiten des Tages (ohne reine Ruhetage) */
  geplant: { typ: string; titel: string; status: string }[];
  /** absolvierte Aktivitäten des Tages */
  aktivitaeten: { typ: string; dauerS: number }[];
  ruhetag: boolean;
}

/** Mo–So der laufenden Woche: Plan und tatsächliche Aktivitäten je Tag */
export function wochenTage(
  montag: string,
  plan: readonly { datum: string; typ: string; titel: string; status: string }[],
  akts: readonly StatAktivitaet[]
): WochenTag[] {
  return Array.from({ length: 7 }, (_, i) => {
    const datum = addTage(montag, i);
    const tagesPlan = plan.filter((p) => p.datum === datum);
    return {
      datum,
      geplant: tagesPlan.filter((p) => p.typ !== "ruhe").map(({ typ, titel, status }) => ({ typ, titel, status })),
      aktivitaeten: akts.filter((a) => a.datum === datum).map(({ typ, dauerS }) => ({ typ, dauerS })),
      ruhetag: tagesPlan.length > 0 && tagesPlan.every((p) => p.typ === "ruhe"),
    };
  });
}

/** Fortschritt der Woche: erledigte von geplanten Trainingseinheiten (ohne Ruhetage) */
export function wochenFortschritt(
  plan: readonly { typ: string; status: string }[]
): { erledigt: number; geplant: number } {
  const training = plan.filter((p) => p.typ !== "ruhe");
  return { erledigt: training.filter((p) => p.status === "absolviert").length, geplant: training.length };
}
