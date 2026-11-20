/**
 * Gesundheitsübersicht des Dashboards — rein, client-sicher (ohne DB).
 *
 * Einstufungen folgen den Garmin-Bereichen (Training Readiness, Body
 * Battery, Stress). Trends vergleichen den heutigen Wert mit dem Mittel der
 * sieben Vortage — nur mit echten Werten; fehlt etwas, ist es `null`.
 */

import { addTage } from "@/lib/format";

export interface TagesGesundheit {
  datum: string;
  readiness: number | null;
  bodyBatteryMax: number | null;
  bodyBatteryMin: number | null;
  ruhepuls: number | null;
  hrv: number | null;
  hrvStatus: string | null;
  stress: number | null;
  schlafScore: number | null;
}

export type Ton = "gut" | "mittel" | "tief" | "neutral";

export interface Einstufung {
  label: string;
  ton: Ton;
}

/** Training Readiness (0–100) nach Garmin: Optimal · Hoch · Moderat · Niedrig · Sehr niedrig */
export function readinessStufe(wert: number | null): Einstufung | null {
  if (wert == null) return null;
  if (wert >= 95) return { label: "Optimal", ton: "gut" };
  if (wert >= 75) return { label: "Hoch", ton: "gut" };
  if (wert >= 50) return { label: "Moderat", ton: "mittel" };
  if (wert >= 25) return { label: "Niedrig", ton: "tief" };
  return { label: "Sehr niedrig", ton: "tief" };
}

/** Body Battery (0–100) nach Garmin: Hoch · Mittel · Niedrig · Sehr niedrig */
export function bodyBatteryStufe(wert: number | null): Einstufung | null {
  if (wert == null) return null;
  if (wert >= 76) return { label: "Hoch", ton: "gut" };
  if (wert >= 51) return { label: "Mittel", ton: "mittel" };
  if (wert >= 26) return { label: "Niedrig", ton: "tief" };
  return { label: "Sehr niedrig", ton: "tief" };
}

/** Durchschnittlicher Stress (0–100) nach Garmin: Ruhe · Niedrig · Mittel · Hoch */
export function stressStufe(wert: number | null): Einstufung | null {
  if (wert == null) return null;
  if (wert <= 25) return { label: "Ruhe", ton: "gut" };
  if (wert <= 50) return { label: "Niedrig", ton: "gut" };
  if (wert <= 75) return { label: "Mittel", ton: "mittel" };
  return { label: "Hoch", ton: "tief" };
}

const HRV_STATUS: Record<string, Einstufung> = {
  BALANCED: { label: "Ausgeglichen", ton: "gut" },
  UNBALANCED: { label: "Unausgeglichen", ton: "mittel" },
  LOW: { label: "Niedrig", ton: "tief" },
  POOR: { label: "Schlecht", ton: "tief" },
};

/** HRV-Status von Garmin in Worten (unbekannte Werte unverändert, ohne Wertung) */
export function hrvStufe(status: string | null): Einstufung | null {
  if (!status) return null;
  return HRV_STATUS[status.toUpperCase()] ?? { label: status.toLowerCase(), ton: "neutral" };
}

export type Feld = "readiness" | "bodyBatteryMax" | "ruhepuls" | "hrv" | "stress";

export interface Trend {
  /** heutiger Wert */
  wert: number | null;
  /** Mittel der sieben Vortage (mindestens drei Werte) */
  mittel7: number | null;
  /** wert − mittel7, gerundet */
  diff: number | null;
}

/** Heutiger Wert gegen das Mittel der sieben Vortage (ohne heute) */
export function trend(verlauf: readonly TagesGesundheit[], heute: string, feld: Feld): Trend {
  const tag = verlauf.find((t) => t.datum === heute);
  const wert = tag?.[feld] ?? null;
  const ab = addTage(heute, -7);
  const vorher = verlauf
    .filter((t) => t.datum >= ab && t.datum < heute)
    .map((t) => t[feld])
    .filter((v): v is number => v != null);
  const mittel7 = vorher.length >= 3 ? vorher.reduce((s, v) => s + v, 0) / vorher.length : null;
  return {
    wert,
    mittel7: mittel7 != null ? Math.round(mittel7) : null,
    diff: wert != null && mittel7 != null ? Math.round(wert - mittel7) : null,
  };
}

export interface Bereitschaft {
  ampel: "gruen" | "gelb" | "rot" | null;
  satz: string;
}

/**
 * Zusammenfassende Einschätzung für den Tag aus Readiness, Body Battery,
 * HRV-Status und Schlafscore (Regeln wie bisher in der Bereitschafts-Ampel).
 */
export function bereitschaft(d: {
  readiness: number | null;
  bodyBatteryMax: number | null;
  hrvStatus: string | null;
  schlafScore: number | null;
}): Bereitschaft {
  const ampeln: ("gruen" | "gelb" | "rot")[] = [];
  if (d.readiness != null) ampeln.push(d.readiness >= 60 ? "gruen" : d.readiness >= 35 ? "gelb" : "rot");
  if (d.bodyBatteryMax != null) ampeln.push(d.bodyBatteryMax >= 70 ? "gruen" : d.bodyBatteryMax >= 45 ? "gelb" : "rot");
  if (d.hrvStatus != null) {
    const s = d.hrvStatus.toUpperCase();
    ampeln.push(s === "BALANCED" ? "gruen" : s === "UNBALANCED" ? "gelb" : "rot");
  }
  if (d.schlafScore != null) ampeln.push(d.schlafScore >= 75 ? "gruen" : d.schlafScore >= 55 ? "gelb" : "rot");
  if (ampeln.length === 0) return { ampel: null, satz: "Noch keine Gesundheitsdaten für heute — nach dem nächsten Sync verfügbar." };
  const rot = ampeln.filter((a) => a === "rot").length;
  const gelb = ampeln.filter((a) => a === "gelb").length;
  if (rot >= 2 || (rot >= 1 && gelb >= 2)) {
    return { ampel: "rot", satz: "Heute eher ruhig: Intervalle gegen einen lockeren Lauf tauschen oder den Ruhetag vorziehen." };
  }
  if (rot >= 1 || gelb >= 2) {
    return { ampel: "gelb", satz: "Locker trainieren geht — eine harte Einheit besser verschieben." };
  }
  return { ampel: "gruen", satz: "Gute Voraussetzungen — auch eine harte Einheit ist heute machbar." };
}
