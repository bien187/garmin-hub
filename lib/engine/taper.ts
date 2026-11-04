/**
 * Taper-Regeln bis zur EP — reine Funktionen, client-sicher (kein DB-Import).
 *
 * Statt pauschal „EP − 13 Tage" gilt ab dem 05.11.2026 für jeden Tag eine
 * explizite Regel. Der Generator (lib/engine/plan.ts) erzeugt bzw. schwächt
 * die Einheiten danach ab, die Plan-Anpassung verschärft nie darüber hinaus,
 * und der Wochenplan zeigt die Begründung pro Tag an.
 *
 * Annahmen (README „EP-Termin und Taper-Plan"):
 *  - EP Tag 2 = Do 19.11.2026.
 *  - Mo 09.11. ist die letzte schwere Beineinheit, aber OHNE Lastlauf:
 *    Lastläufe sind im Taper ausgeschlossen (spezifischere Regel).
 *  - 20.–22.11. Regeneration, danach kein Plan, bis neue Ziele gesetzt sind.
 */

import type { PlanTyp } from "./plan";
import { EP_DATUM, EP_TAG_2, REGENERATION_BIS, TAPER_START } from "@/lib/ep/konstanten";

/** Höchste erlaubte LAUF-Intensität des Tages („keine" = kein Lauf) */
export type TaperIntensitaet = "z5" | "z4" | "z2" | "locker" | "keine";

export interface TaperRegel {
  datum: string;
  /** Kurzname der Tagesregel, z. B. „Letzte Intensität" */
  label: string;
  maxIntensitaet: TaperIntensitaet;
  /** erlaubte Plan-Typen an diesem Tag */
  erlaubt: PlanTyp[];
  /** Umfang relativ zum normalen Plan (1 = unverändert) */
  umfangFaktor: number;
  /** maximale Laufdauer in Minuten (0 = kein Lauf) */
  maxDauerMin: number;
  /** Klimmzüge, Liegestütze und Rumpf nur submaximal */
  nurSubmaximal: boolean;
  /** keine Kraft für die Beine mehr */
  keineBeinkraft: boolean;
  /** Ein Satz für den Wochenplan — warum der Tag so aussieht */
  begruendung: string;
}

/** Sa 07.11.: letzte Intensitätseinheit vor der EP */
export const LETZTE_INTENSITAET = "2026-11-07";
/** Mo 09.11.: letzte schwere Beineinheit */
export const LETZTE_BEINEINHEIT = "2026-11-09";
/** Di 10.11.: letzter kurzer Lauf mit Zieltempo */
export const LETZTER_ZIELTEMPO_LAUF = "2026-11-10";
/** Do 12.11.: einziger (leichter) Rumpftag der letzten Woche vor der EP */
export const LETZTER_RUMPF_TAG = "2026-11-12";

export const LAUF_TYPEN: readonly string[] = [
  "lauf_z2",
  "intervalle",
  "huegel_intervalle",
  "langer_lauf",
  "lastlauf",
  "probe_ep",
];

export function istLaufTyp(typ: string): boolean {
  return LAUF_TYPEN.includes(typ);
}

const RANG: Record<TaperIntensitaet, number> = { keine: 0, locker: 1, z2: 2, z4: 3, z5: 4 };

const WOCHE_1: PlanTyp[] = [
  "lauf_z2",
  "intervalle",
  "huegel_intervalle",
  "kraft",
  "klimmzuege",
  "liegestuetze",
  "rumpf",
  "gtg",
  "ruhe",
];

/**
 * Tagesregel des Tapers. Vor dem 05.11. → `null` (normaler Plan).
 * Nach dem 22.11. → Regel ohne erlaubte Einheiten (kein Plan nach der EP).
 */
export function taperRegelFuerTag(datum: string): TaperRegel | null {
  if (datum < TAPER_START) return null;

  const regel = (r: Omit<TaperRegel, "datum">): TaperRegel => ({ datum, ...r });

  if (datum < LETZTE_INTENSITAET) {
    return regel({
      label: "Taper: Umfang −40 %",
      maxIntensitaet: "z5",
      erlaubt: WOCHE_1,
      umfangFaktor: 0.6,
      maxDauerMin: 45,
      nurSubmaximal: false,
      keineBeinkraft: false,
      begruendung:
        "Taper beginnt: Umfang ca. −40 %, keine Steigerung. Die Form ist aufgebaut — jetzt wird Ermüdung abgebaut. Kein Lastlauf, keine Probe-EP, kein Lauf über 45 Min.",
    });
  }
  if (datum === LETZTE_INTENSITAET) {
    return regel({
      label: "Letzte Intensität",
      maxIntensitaet: "z5",
      erlaubt: WOCHE_1,
      umfangFaktor: 0.6,
      maxDauerMin: 45,
      nurSubmaximal: false,
      keineBeinkraft: false,
      begruendung:
        "Letzte Intensitätseinheit vor der EP: Intervalle bzw. Hügel kurz, Umfang −40 %. Keine Probe-EP und kein Lastlauf mehr — die kosten jetzt mehr Frische, als sie bringen.",
    });
  }
  if (datum < LETZTE_BEINEINHEIT) {
    return regel({
      label: "Taper: locker",
      maxIntensitaet: "z2",
      erlaubt: ["lauf_z2", "kraft", "klimmzuege", "liegestuetze", "rumpf", "gtg", "ruhe"],
      umfangFaktor: 0.6,
      maxDauerMin: 45,
      nurSubmaximal: false,
      keineBeinkraft: false,
      begruendung:
        "Nach der letzten Intensität nur locker, Umfang −40 %. Beine schonen — die letzte schwere Beineinheit folgt am Montag.",
    });
  }
  if (datum === LETZTE_BEINEINHEIT) {
    return regel({
      label: "Letzte schwere Beineinheit",
      maxIntensitaet: "keine",
      erlaubt: ["kraft", "liegestuetze", "gtg", "ruhe"],
      umfangFaktor: 0.7,
      maxDauerMin: 0,
      nurSubmaximal: false,
      keineBeinkraft: false,
      begruendung:
        "Letzte schwere Beineinheit: Ganzkörper mit Beinen, moderat schwer, nie bis zum Versagen. Danach keine Kraft mehr für die Beine. Kein Lastlauf im Taper.",
    });
  }
  if (datum === LETZTER_ZIELTEMPO_LAUF) {
    return regel({
      label: "Letzter Zieltempo-Lauf",
      maxIntensitaet: "z4",
      erlaubt: ["intervalle", "lauf_z2", "gtg", "ruhe"],
      umfangFaktor: 0.5,
      maxDauerMin: 40,
      nurSubmaximal: true,
      keineBeinkraft: true,
      begruendung:
        "Letzter kurzer Lauf mit Zieltempo: max. 20 Min Z4, mit Einlaufen. Ein Reiz fürs Renngefühl, keine Ermüdung.",
    });
  }
  if (datum < "2026-11-16") {
    const rumpfTag = datum === LETZTER_RUMPF_TAG;
    return regel({
      label: rumpfTag ? "Nur Z2 · Rumpf leicht" : "Nur Z2",
      maxIntensitaet: "z2",
      erlaubt: rumpfTag
        ? ["lauf_z2", "klimmzuege", "liegestuetze", "rumpf", "gtg", "ruhe"]
        : ["lauf_z2", "klimmzuege", "liegestuetze", "gtg", "ruhe"],
      umfangFaktor: 0.5,
      maxDauerMin: 30,
      nurSubmaximal: true,
      keineBeinkraft: true,
      begruendung:
        "Nur Z2, max. 30 Min, flach — kein Bergablauf, kein Lastlauf, keine neuen Übungen. Klimmzüge und Liegestütze nur submaximal" +
        (rumpfTag ? ", Rumpf heute leicht (einziger Rumpftag der Woche)." : ", kein Rumpf."),
    });
  }
  if (datum === "2026-11-16") {
    return regel({
      label: "Spazieren + Mobilität",
      maxIntensitaet: "locker",
      erlaubt: ["ruhe"],
      umfangFaktor: 0.2,
      maxDauerMin: 0,
      nurSubmaximal: true,
      keineBeinkraft: true,
      begruendung:
        "Zwei Tage vor der EP: 20 Min Spazieren und Mobilität, sonst nichts. Schlaf, Elektrolyte, Kohlenhydrate.",
    });
  }
  if (datum < EP_DATUM) {
    return regel({
      label: "Frei oder locker",
      maxIntensitaet: "locker",
      erlaubt: ["lauf_z2", "ruhe"],
      umfangFaktor: 0.2,
      maxDauerMin: 20,
      nurSubmaximal: true,
      keineBeinkraft: true,
      begruendung:
        "Vortag der EP: frei oder max. 20 Min locker. Früh schlafen, Material bereitlegen.",
    });
  }
  if (datum === EP_DATUM || datum === EP_TAG_2) {
    const tag1 = datum === EP_DATUM;
    return regel({
      label: tag1 ? "EP – Tag 1" : "EP – Tag 2",
      maxIntensitaet: "keine",
      erlaubt: ["ep"],
      umfangFaktor: 0,
      maxDauerMin: 0,
      nurSubmaximal: true,
      keineBeinkraft: true,
      begruendung: tag1
        ? "Eignungsprüfung Tag 1. Kein Training vor der Prüfung."
        : "Eignungsprüfung Tag 2. Kein zusätzliches Training — zwischen den Tagen nur erholen.",
    });
  }
  if (datum <= REGENERATION_BIS) {
    return regel({
      label: "Regeneration",
      maxIntensitaet: "locker",
      erlaubt: ["ruhe"],
      umfangFaktor: 0.2,
      maxDauerMin: 0,
      nurSubmaximal: true,
      keineBeinkraft: true,
      begruendung:
        "Nach der EP: Regeneration, Spazieren 20–30 Min. Kein Training, bis die Beine wieder frisch sind.",
    });
  }
  return regel({
    label: "Nach der EP",
    maxIntensitaet: "keine",
    erlaubt: [],
    umfangFaktor: 0,
    maxDauerMin: 0,
    nurSubmaximal: true,
    keineBeinkraft: true,
    begruendung: "Kein Trainingsplan nach der EP, bis neue Ziele gesetzt sind.",
  });
}

/* ------------------------------------------------------------------ */
/* Prüfung einzelner Einheiten gegen die Tagesregel                    */
/* ------------------------------------------------------------------ */

/** Laufminuten aus dem Titel („Z2-Lauf 30 Min") — null, wenn keine Angabe */
export function minutenAusTitel(titel: string): number | null {
  const m = titel.match(/(\d{2,3})\s*Min/i);
  return m ? parseInt(m[1], 10) : null;
}

/** Laufintensität einer Einheit nach Typ (und bei Intervallen nach Titel) */
export function laufIntensitaet(e: { typ: string; titel: string }): TaperIntensitaet {
  switch (e.typ) {
    case "lauf_z2":
    case "langer_lauf":
      return "z2";
    case "intervalle":
    case "huegel_intervalle":
      return /\bZ4\b|Zieltempo/i.test(e.titel) ? "z4" : "z5";
    case "lastlauf":
    case "probe_ep":
      return "z5";
    default:
      return "keine";
  }
}

export interface RegelPruefung {
  ok: boolean;
  /** kurzer Grund, warum die Einheit nicht zur Tagesregel passt */
  grund?: string;
}

/**
 * Passt eine (bestehende oder neue) Einheit zur Taper-Regel ihres Tages?
 * Ohne Regel (vor dem Taper) passt alles.
 */
export function passtZurRegel(
  e: { datum: string; typ: string; titel: string },
  regel: TaperRegel | null = taperRegelFuerTag(e.datum)
): RegelPruefung {
  if (!regel) return { ok: true };
  if (!(regel.erlaubt as string[]).includes(e.typ)) {
    if (e.typ === "probe_ep") return { ok: false, grund: "keine Probe-EP im Taper" };
    if (e.typ === "lastlauf") return { ok: false, grund: "kein Lastlauf im Taper" };
    if (regel.erlaubt.includes("ep")) return { ok: false, grund: "am EP-Tag kein Training" };
    return { ok: false, grund: `an diesem Tag nicht vorgesehen (${regel.label})` };
  }
  if (istLaufTyp(e.typ)) {
    const min = minutenAusTitel(e.titel);
    if (min != null && min > regel.maxDauerMin) {
      return { ok: false, grund: `länger als ${regel.maxDauerMin} Min` };
    }
    const int = laufIntensitaet(e);
    if (e.typ !== "lauf_z2" && RANG[int] > RANG[regel.maxIntensitaet]) {
      return { ok: false, grund: "zu intensiv für den Taper-Tag" };
    }
  }
  if (
    regel.nurSubmaximal &&
    ["klimmzuege", "liegestuetze", "rumpf"].includes(e.typ) &&
    /schwer|\bmax/i.test(e.titel)
  ) {
    return { ok: false, grund: "nur noch submaximal" };
  }
  if (regel.keineBeinkraft && e.typ === "kraft" && /bein|ganzkörper/i.test(e.titel)) {
    return { ok: false, grund: "keine Beinkraft mehr" };
  }
  return { ok: true };
}
