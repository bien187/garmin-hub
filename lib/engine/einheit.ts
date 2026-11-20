/**
 * Kennzahlen einer geplanten Einheit für die Anzeige — rein, client-sicher.
 *
 * Dauer, Intensität und Zielpace stehen nicht als eigene Spalten in
 * `planned_workouts`, sie folgen aus Typ und Workout-Struktur. Fehlt die
 * Information, liefern die Funktionen `null` statt eines geratenen Werts.
 */

import type { WorkoutSchritt } from "@/lib/garmin/workout-types";
import { istLaufTyp } from "./plan-typen";

/** Lose Struktur, wie sie aus der DB (jsonb) kommt */
export interface StrukturLose {
  sport?: string;
  schritte?: unknown[];
  uebungen?: { name: string; saetze: number; wdh?: number; dauerS?: number; notiz?: string }[];
}

/**
 * Geplante Dauer in Sekunden aus den Lauf-Schritten. Distanz-Schritte werden
 * mit `paceSKm` (Standard 6:00/km) umgerechnet. Ohne Zeit-/Distanzschritte → null.
 */
export function geplanteDauerS(struktur: StrukturLose | null | undefined, paceSKm = 360): number | null {
  if (!struktur || !Array.isArray(struktur.schritte)) return null;
  let summe = 0;
  const addiere = (schritte: unknown[]): void => {
    for (const roh of schritte) {
      const s = roh as WorkoutSchritt;
      const wdh = typeof s.wiederholungen === "number" ? s.wiederholungen : 1;
      if (Array.isArray(s.schritte)) {
        for (let i = 0; i < wdh; i++) addiere(s.schritte);
      } else if (s.dauerTyp === "zeit" && typeof s.dauerWert === "number") {
        summe += s.dauerWert;
      } else if (s.dauerTyp === "distanz" && typeof s.dauerWert === "number") {
        // Distanz-Schritt mit Pace-Ziel: mit dessen Mitte rechnen
        const pace = s.ziel?.typ === "pace" ? (s.ziel.vonSproKm + s.ziel.bisSproKm) / 2 : paceSKm;
        summe += (s.dauerWert / 1000) * pace;
      }
    }
  };
  addiere(struktur.schritte);
  return summe > 0 ? Math.round(summe) : null;
}

/** Schnellste Pace-Vorgabe der Struktur (s/km) als Bereich — null ohne Pace-Ziel */
export function zielPace(struktur: StrukturLose | null | undefined): { von: number; bis: number } | null {
  if (!struktur || !Array.isArray(struktur.schritte)) return null;
  let beste: { von: number; bis: number } | null = null;
  const suche = (schritte: unknown[]): void => {
    for (const roh of schritte) {
      const s = roh as WorkoutSchritt;
      if (Array.isArray(s.schritte)) suche(s.schritte);
      else if (s.ziel?.typ === "pace" && (!beste || s.ziel.bisSproKm < beste.bis)) {
        beste = { von: s.ziel.vonSproKm, bis: s.ziel.bisSproKm };
      }
    }
  };
  suche(struktur.schritte);
  return beste;
}

/** Summe der Distanz-Schritte in Metern (z. B. 5 × 1 km) — null ohne Distanzschritte */
export function geplanteDistanzM(struktur: StrukturLose | null | undefined): number | null {
  if (!struktur || !Array.isArray(struktur.schritte)) return null;
  let summe = 0;
  const addiere = (schritte: unknown[]): void => {
    for (const roh of schritte) {
      const s = roh as WorkoutSchritt;
      const wdh = typeof s.wiederholungen === "number" ? s.wiederholungen : 1;
      if (Array.isArray(s.schritte)) {
        for (let i = 0; i < wdh; i++) addiere(s.schritte);
      } else if (s.dauerTyp === "distanz" && typeof s.dauerWert === "number") {
        summe += s.dauerWert;
      }
    }
  };
  addiere(struktur.schritte);
  return summe > 0 ? summe : null;
}

export type Kategorie = "gym" | "intervalle" | "lauf" | "ruhe" | "sonstiges";

/** Grobe Kategorie für Icon und Farbe */
export function kategorie(typ: string): Kategorie {
  if (typ === "intervalle" || typ === "huegel_intervalle") return "intervalle";
  if (istLaufTyp(typ)) return "lauf";
  if (typ === "kraft" || typ === "klimmzuege") return "gym";
  if (typ === "ruhe") return "ruhe";
  return "sonstiges";
}

export interface Intensitaet {
  /** 0 = Ruhe, 1 = locker, 2 = mittel, 3 = hoch */
  stufe: 0 | 1 | 2 | 3;
  label: string;
}

/** Intensität nach Typ (Kraft zählt als mittel) */
export function intensitaet(typ: string): Intensitaet | null {
  switch (typ) {
    case "ruhe":
      return { stufe: 0, label: "Erholung" };
    case "lauf_z2":
    case "langer_lauf":
      return { stufe: 1, label: "Locker · Zone 2" };
    case "kraft":
    case "klimmzuege":
      return { stufe: 2, label: "Kraft" };
    case "intervalle":
    case "huegel_intervalle":
      return { stufe: 3, label: "Hoch · Intervalle" };
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* Lesbare Beschreibung der Struktur                                   */
/* ------------------------------------------------------------------ */

const ART: Record<string, string> = {
  aufwaermen: "Einlaufen",
  auslaufen: "Auslaufen",
  intervall: "Belastung",
  erholung: "Pause",
};

function dauerText(s: WorkoutSchritt): string {
  if (s.dauerTyp === "zeit" && typeof s.dauerWert === "number") {
    if (s.dauerWert < 120) return `${Math.round(s.dauerWert)} s`;
    const min = s.dauerWert / 60;
    return Number.isInteger(min) ? `${min} Min` : `${Math.floor(min)}:${String(Math.round((min % 1) * 60)).padStart(2, "0")} Min`;
  }
  if (s.dauerTyp === "distanz" && typeof s.dauerWert === "number") {
    return s.dauerWert >= 1000 ? `${(s.dauerWert / 1000).toLocaleString("de-CH")} km` : `${Math.round(s.dauerWert)} m`;
  }
  return "";
}

function paceText(sKm: number): string {
  const m = Math.floor(sKm / 60);
  const s = Math.round(sKm % 60);
  return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, "0")}`;
}

function zielText(s: WorkoutSchritt): string {
  if (s.ziel?.typ === "pace") return `${paceText(s.ziel.vonSproKm)}–${paceText(s.ziel.bisSproKm)} /km`;
  if (s.ziel?.typ === "hr") return `${s.ziel.vonBpm}–${s.ziel.bisBpm} bpm`;
  return "";
}

function schrittText(s: WorkoutSchritt): string {
  if (Array.isArray(s.schritte)) {
    const innen = s.schritte.map(schrittText).filter(Boolean).join(" · ");
    return `${s.wiederholungen ?? 1} × (${innen})`;
  }
  const teile = [ART[s.art] ?? s.art, dauerText(s), zielText(s)].filter(Boolean);
  if (s.art === "intervall" && !s.ziel && s.notiz) teile.push(s.notiz);
  return teile.join(" ");
}

/** Struktur als kurze Zeilen: Lauf-Schritte oder Kraftübungen */
export function strukturZeilen(struktur: StrukturLose | null | undefined): string[] {
  if (!struktur) return [];
  if (Array.isArray(struktur.uebungen) && struktur.uebungen.length) {
    return struktur.uebungen.map((u) => {
      const menge = u.wdh != null ? `${u.saetze} × ${u.wdh}` : u.dauerS != null ? `${u.saetze} × ${u.dauerS} s` : `${u.saetze} Sätze`;
      return `${u.name} · ${menge}${u.notiz ? ` — ${u.notiz}` : ""}`;
    });
  }
  if (Array.isArray(struktur.schritte)) {
    return (struktur.schritte as WorkoutSchritt[]).map(schrittText).filter(Boolean);
  }
  return [];
}
