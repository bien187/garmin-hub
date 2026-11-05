import {
  berechneNote,
  bewerteEp,
  DisziplinId,
  EP_DISZIPLINEN,
} from "./disziplinen";
import { tageDiff } from "@/lib/format";

export interface BenchmarkEintrag {
  datum: string; // ISO
  disziplin: DisziplinId;
  wert: number;
}

export interface DisziplinPrognose {
  disziplin: DisziplinId;
  /** Letzter gemessener Wert */
  aktuellerWert: number | null;
  aktuelleNote: number | null;
  /** Auf das EP-Datum projizierter Wert (Trend, gedämpft) */
  prognoseWert: number | null;
  prognoseNote: number | null;
  /** Trend pro Woche im Wert der Disziplin */
  trendProWoche: number | null;
  anzahlMessungen: number;
  /** Datum der letzten Messung */
  datumLetzte: string | null;
}

export interface EpPrognose {
  disziplinen: Record<DisziplinId, DisziplinPrognose>;
  /** Gesamtschnitt auf Basis der Prognose-Noten */
  schnitt: number | null;
  bestanden: boolean | null;
  ausschluss: DisziplinId[];
  fehlendeDisziplinen: DisziplinId[];
}

/** Lineare Regression wert ~ tage; liefert Steigung pro Tag */
function trendProTag(punkte: { tage: number; wert: number }[]): number {
  const n = punkte.length;
  const mx = punkte.reduce((s, p) => s + p.tage, 0) / n;
  const my = punkte.reduce((s, p) => s + p.wert, 0) / n;
  let zaehler = 0;
  let nenner = 0;
  for (const p of punkte) {
    zaehler += (p.tage - mx) * (p.wert - my);
    nenner += (p.tage - mx) ** 2;
  }
  return nenner === 0 ? 0 : zaehler / nenner;
}

/**
 * EP-Prognose aus manuellen Benchmarks + Trend.
 *
 * Pro Disziplin: letzte Messung = Ist-Stand; Trend aus den letzten bis zu
 * 6 Messungen (max. 90 Tage alt) wird auf das EP-Datum projiziert, aber
 * gedämpft (max. ±20 % des aktuellen Werts) und auf das reglementarische
 * Maximum geklemmt — kein Wunschdenken.
 *
 * `lastlaufModellSekunden`: Prognose der Lauf-Engine (GAP/Riegel + Zuschlag)
 * als zweite Quelle für den Lastlauf; wird mit einem echten Benchmark
 * gemischt (Benchmark 60 %), ersetzt ihn aber nicht.
 */
export function berechneEpPrognose(
  benchmarks: BenchmarkEintrag[],
  heute: string,
  epDatum: string,
  lastlaufModellSekunden?: number | null
): EpPrognose {
  const ids = Object.keys(EP_DISZIPLINEN) as DisziplinId[];
  const disziplinen = {} as Record<DisziplinId, DisziplinPrognose>;
  const prognoseNoten: Partial<Record<DisziplinId, number>> = {};

  for (const id of ids) {
    const d = EP_DISZIPLINEN[id];
    const eintraege = benchmarks
      .filter((b) => b.disziplin === id && tageDiff(b.datum, heute) <= 90)
      .sort((a, b) => a.datum.localeCompare(b.datum))
      .slice(-6);

    let aktuellerWert: number | null =
      eintraege.length > 0 ? eintraege[eintraege.length - 1].wert : null;
    let prognoseWert: number | null = null;
    let trendWoche: number | null = null;

    if (eintraege.length >= 2 && aktuellerWert != null) {
      const basis = eintraege[0].datum;
      const punkte = eintraege.map((e) => ({
        tage: tageDiff(basis, e.datum),
        wert: e.wert,
      }));
      const steigung = trendProTag(punkte);
      trendWoche = steigung * 7;
      const tageBisEp = Math.max(0, tageDiff(heute, epDatum));
      const roh = aktuellerWert + steigung * tageBisEp;
      // Dämpfung: maximal ±20 % Veränderung gegenüber dem Ist-Stand
      const grenze = Math.abs(aktuellerWert) * 0.2;
      prognoseWert = Math.min(
        aktuellerWert + grenze,
        Math.max(aktuellerWert - grenze, roh)
      );
    } else if (aktuellerWert != null) {
      prognoseWert = aktuellerWert;
    }

    // Lastlauf: Engine-Modellwert einmischen
    if (id === "lastlauf" && lastlaufModellSekunden != null) {
      if (prognoseWert == null) {
        prognoseWert = lastlaufModellSekunden;
        if (aktuellerWert == null) aktuellerWert = null;
      } else {
        prognoseWert = 0.6 * prognoseWert + 0.4 * lastlaufModellSekunden;
      }
    }

    if (prognoseWert != null && d.maxWert != null) {
      prognoseWert = Math.min(prognoseWert, d.maxWert);
    }
    if (prognoseWert != null && d.einheit === "wiederholungen") {
      prognoseWert = Math.round(prognoseWert * 10) / 10;
    }

    const prognose: DisziplinPrognose = {
      disziplin: id,
      aktuellerWert,
      aktuelleNote:
        aktuellerWert != null ? berechneNote(id, aktuellerWert) : null,
      prognoseWert,
      prognoseNote:
        prognoseWert != null
          ? berechneNote(
              id,
              d.einheit === "wiederholungen"
                ? Math.floor(prognoseWert)
                : prognoseWert
            )
          : null,
      trendProWoche: trendWoche,
      anzahlMessungen: eintraege.length,
      datumLetzte: eintraege.length ? eintraege[eintraege.length - 1].datum : null,
    };
    disziplinen[id] = prognose;
    if (prognose.prognoseNote != null) {
      prognoseNoten[id] = prognose.prognoseNote;
    }
  }

  const ergebnis = bewerteEp(prognoseNoten);
  return {
    disziplinen,
    schnitt: ergebnis.schnitt,
    bestanden: ergebnis.bestanden,
    ausschluss: ergebnis.ausschluss,
    fehlendeDisziplinen: ids.filter((id) => prognoseNoten[id] == null),
  };
}

/**
 * Aktueller EP-Stand ohne Prognose: pro Disziplin genau der zuletzt erfasste
 * Wert und seine Note laut offizieller Tabelle — kein Trend, kein Lauf-Modell,
 * keine Altersgrenze. So zeigt die Notenanzeige nur selbst gemessene, reale
 * Werte. Disziplinen ohne Eintrag bleiben leer; der Schnitt läuft über die
 * vorhandenen, „bestanden" gibt es erst mit allen fünf.
 */
export function aktuellerEpStand(benchmarks: BenchmarkEintrag[]): EpPrognose {
  const ids = Object.keys(EP_DISZIPLINEN) as DisziplinId[];
  const disziplinen = {} as Record<DisziplinId, DisziplinPrognose>;
  const noten: Partial<Record<DisziplinId, number>> = {};
  for (const id of ids) {
    const eintraege = benchmarks
      .filter((b) => b.disziplin === id)
      .sort((a, b) => a.datum.localeCompare(b.datum));
    const letzte = eintraege[eintraege.length - 1] ?? null;
    const note = letzte ? berechneNote(id, letzte.wert) : null;
    disziplinen[id] = {
      disziplin: id,
      aktuellerWert: letzte?.wert ?? null,
      aktuelleNote: note,
      prognoseWert: letzte?.wert ?? null,
      prognoseNote: note,
      trendProWoche: null,
      anzahlMessungen: eintraege.length,
      datumLetzte: letzte?.datum ?? null,
    };
    if (note != null) noten[id] = note;
  }
  const ergebnis = bewerteEp(noten);
  return {
    disziplinen,
    schnitt: ergebnis.schnitt,
    bestanden: ergebnis.bestanden,
    ausschluss: ergebnis.ausschluss,
    fehlendeDisziplinen: ids.filter((id) => noten[id] == null),
  };
}
