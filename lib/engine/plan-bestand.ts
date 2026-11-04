/**
 * Was passiert beim Neugenerieren einer Woche mit den bestehenden Einträgen?
 * Reine Funktion — die DB-Schreibzugriffe macht lib/server/plan-service.ts.
 *
 * Regeln:
 *  - `ep`-Einträge bleiben immer unverändert (nie gelöscht, nie überschrieben).
 *  - `absolviert` und alles vor heute bleibt.
 *  - Bereits an Garmin übertragene Einträge (gepusht bzw. mit Garmin-ID)
 *    werden nie gelöscht. Passen sie nicht zur Taper-Regel ihres Tages,
 *    gibt es einen Hinweis („… bitte «Von der Uhr entfernen»").
 *    Liegen sie im Taper mit vollem Umfang auf der Uhr (Kraft/Rumpf ohne
 *    Taper-Anpassung), gibt es einen Hinweis, den Umfang selbst zu kürzen.
 *  - Offene `geplant`-Einträge ohne Garmin-ID ab heute werden ersetzt, wenn
 *    ihr Tag frei (nicht belegt) oder gesperrt ist — wie bisher. Auf belegten
 *    Tagen (ein Eintrag liegt schon auf der Uhr/ist erledigt) bleiben sie vor
 *    dem Taper stehen. Ab dem Taper werden sie immer durch die Taper-Version
 *    des Tages ersetzt — sonst bliebe eine Einheit mit vollem Umfang stehen,
 *    obwohl die Tagesregel z. B. −40 % verlangt.
 */

import type { PlanEinheit } from "./plan";
import { istLaufTyp, LETZTE_BEINEINHEIT, passtZurRegel, taperRegelFuerTag } from "./taper";
import { formatDatumKurz } from "@/lib/format";

export interface BestandsEintrag {
  id: string;
  datum: string;
  typ: string;
  titel: string;
  status: string; // geplant | gepusht | absolviert | verpasst
  garminWorkoutId: number | null;
  /** für die Umfangsprüfung (Taper-Anpassung steht in der Beschreibung) */
  beschreibung?: string | null;
}

export type BestandsAktion = "behalten" | "ersetzen" | "melden";

export interface BestandsEntscheid {
  id: string;
  datum: string;
  aktion: BestandsAktion;
  grund: string;
}

const aufDerUhr = (e: BestandsEintrag) => e.status === "gepusht" || e.garminWorkoutId != null;

/** Tage, die beim Neugenerieren fix bleiben (erledigt, verpasst oder übertragen) */
export function belegteTage(bestehende: BestandsEintrag[]): string[] {
  return [
    ...new Set(
      bestehende.filter((b) => b.status !== "geplant" || b.garminWorkoutId != null).map((b) => b.datum)
    ),
  ];
}

export function entscheideEintrag(
  e: BestandsEintrag,
  ctx: { heute: string; gesperrt: string[]; belegt: string[] }
): BestandsEntscheid {
  const ergebnis = (aktion: BestandsAktion, grund: string): BestandsEntscheid => ({
    id: e.id,
    datum: e.datum,
    aktion,
    grund,
  });
  if (e.typ === "ep") return ergebnis("behalten", "EP-Eintrag ist fix");
  if (e.status === "absolviert") return ergebnis("behalten", "bereits absolviert");
  if (e.datum < ctx.heute) return ergebnis("behalten", "liegt in der Vergangenheit");
  const pruefung = passtZurRegel(e);
  if (aufDerUhr(e)) {
    return pruefung.ok
      ? ergebnis("behalten", "liegt auf der Uhr")
      : ergebnis("melden", pruefung.grund ?? "passt nicht zum Taper");
  }
  if (e.status !== "geplant") return ergebnis("behalten", `Status ${e.status}`);
  if (ctx.gesperrt.includes(e.datum) || !ctx.belegt.includes(e.datum)) {
    return ergebnis("ersetzen", "wird neu geplant");
  }
  if (!pruefung.ok) return ergebnis("ersetzen", pruefung.grund ?? "passt nicht zum Taper");
  const regel = taperRegelFuerTag(e.datum);
  return regel && regel.umfangFaktor < 1
    ? ergebnis("ersetzen", `Taper-Version des Tages (${regel.label})`)
    : ergebnis("behalten", "Tag ist bereits belegt");
}

const UMFANG_TYPEN = ["kraft", "klimmzuege", "liegestuetze", "rumpf"];

/**
 * Liegt eine regelkonforme Kraft-/Rumpfeinheit ohne Taper-Anpassung auf der
 * Uhr, obwohl die Tagesregel weniger Umfang verlangt? (z. B. alter Rumpf am 07.11.)
 * Nur 05.–08.11.: dort wird der normale Plan um ca. 40 % gekürzt (die gekürzten
 * Einheiten tragen „Taper" in der Beschreibung). Ab 09.11. kommen die Einheiten
 * direkt aus der Tagesregel; dort prüft passtZurRegel.
 */
function vollerUmfangAufUhr(e: BestandsEintrag, d: BestandsEntscheid): number | null {
  if (d.aktion !== "behalten" || !aufDerUhr(e) || e.status === "absolviert" || e.typ === "ep") return null;
  if (!UMFANG_TYPEN.includes(e.typ) || /taper/i.test(e.beschreibung ?? "")) return null;
  const regel = taperRegelFuerTag(e.datum);
  if (!regel || e.datum >= LETZTE_BEINEINHEIT || regel.umfangFaktor <= 0 || regel.umfangFaktor >= 1) return null;
  return Math.round((1 - regel.umfangFaktor) * 100);
}

export interface BestandsPlan {
  entscheide: BestandsEntscheid[];
  /** IDs, die gelöscht werden */
  loeschen: string[];
  /** neu anzulegende Einheiten */
  einfuegen: PlanEinheit[];
  /** zusätzliche Wochenhinweise (regelwidrige Einträge auf der Uhr) */
  hinweise: string[];
}

/**
 * @param neu        geplante Einheiten nach dem Verteilen (nur freie Tage ab heute)
 * @param generiert  vollständige, Taper-konforme Woche (auch für belegte Tage) —
 *                   daraus kommt der Ersatz für regelwidrige Einträge auf belegten Tagen
 */
export function planeBestand(inp: {
  bestehende: BestandsEintrag[];
  neu: PlanEinheit[];
  generiert: PlanEinheit[];
  heute: string;
  gesperrt: string[];
  belegt?: string[];
}): BestandsPlan {
  const belegt = inp.belegt ?? belegteTage(inp.bestehende);
  const entscheide = inp.bestehende.map((e) =>
    entscheideEintrag(e, { heute: inp.heute, gesperrt: inp.gesperrt, belegt })
  );
  const aktion = new Map(entscheide.map((d) => [d.id, d]));
  const loeschen = entscheide.filter((d) => d.aktion === "ersetzen").map((d) => d.id);

  const hinweise: string[] = [];
  for (const e of inp.bestehende) {
    const d = aktion.get(e.id)!;
    if (d.datum < inp.heute) continue;
    if (d.aktion === "melden") {
      hinweise.push(
        `«${e.titel}» (${formatDatumKurz(e.datum)}) liegt bereits auf der Uhr und passt nicht zum Taper (${d.grund}) — bitte «Von der Uhr entfernen» und neu planen.`
      );
      continue;
    }
    const minus = vollerUmfangAufUhr(e, d);
    if (minus != null) {
      hinweise.push(
        `«${e.titel}» (${formatDatumKurz(e.datum)}) liegt mit vollem Umfang auf der Uhr — im Taper ca. −${minus} % (weniger Sätze bzw. kürzer halten), nichts steigern. Oder «Von der Uhr entfernen» und neu planen.`
      );
    }
  }

  /* EP-Einträge idempotent: nie doppelt, ein bestehender bleibt unverändert */
  const epVorhanden = new Set(inp.bestehende.filter((e) => e.typ === "ep").map((e) => e.datum));
  const einfuegen = inp.neu.filter((e) => !(e.typ === "ep" && epVorhanden.has(e.datum)));
  for (const ep of inp.generiert.filter((e) => e.typ === "ep")) {
    if (ep.datum < inp.heute || epVorhanden.has(ep.datum)) continue;
    if (einfuegen.some((e) => e.typ === "ep" && e.datum === ep.datum)) continue;
    einfuegen.push(ep);
  }

  /* Ersatz auf belegten Tagen, auf denen ein regelwidriger Eintrag wegfällt */
  const ersatzTage = new Set(
    entscheide
      .filter(
        (d) =>
          d.aktion === "ersetzen" &&
          belegt.includes(d.datum) &&
          !inp.gesperrt.includes(d.datum) &&
          d.datum >= inp.heute
      )
      .map((d) => d.datum)
  );
  for (const datum of ersatzTage) {
    const bleibt = inp.bestehende.filter(
      (e) => e.datum === datum && aktion.get(e.id)?.aktion !== "ersetzen"
    );
    const typen = new Set(bleibt.map((e) => e.typ));
    let hatLauf = bleibt.some((e) => istLaufTyp(e.typ));
    for (const e of inp.generiert.filter((g) => g.datum === datum)) {
      if (e.typ === "ep" || typen.has(e.typ)) continue;
      if (e.typ === "ruhe" && bleibt.length > 0) continue;
      if (istLaufTyp(e.typ) && hatLauf) continue;
      if (!passtZurRegel(e).ok) continue;
      if (einfuegen.some((v) => v.datum === datum && v.typ === e.typ)) continue;
      einfuegen.push(e);
      typen.add(e.typ);
      if (istLaufTyp(e.typ)) hatLauf = true;
    }
  }

  return {
    entscheide,
    loeschen,
    einfuegen: einfuegen.sort((a, b) => a.datum.localeCompare(b.datum)),
    hinweise,
  };
}
