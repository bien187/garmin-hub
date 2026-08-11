/**
 * Herzfrequenz-Zonen — pure, client-sicher (kein DB-Import).
 *
 * Grundsatz: Massgeblich sind die Zonen, die auf der Uhr stehen. Garmin
 * rechnet sie je nach Einstellung aus %HFmax, %HFR oder der Laktatschwelle
 * und führt sie zusätzlich SPORTSPEZIFISCH (Laufen hat oft andere Grenzen
 * als der Standard). Rechnet die App stattdessen eigenständig nach Karvonen,
 * meint „Zone 2" im Trainingsplan einen anderen Bereich als „Zone 2" in der
 * gespeicherten Aktivität — genau die Diskrepanz, die hier verschwindet.
 *
 * Karvonen bleibt nur der Fallback, solange noch keine Garmin-Zonen
 * synchronisiert wurden.
 */

import { hrZonen, type Profil } from "./profil-typen";

export type ZonenQuelle = "garmin" | "karvonen";

export interface ZonenGrenze {
  von: number;
  bis: number;
}

export interface ZonenGrenzen {
  z1: ZonenGrenze;
  z2: ZonenGrenze;
  z3: ZonenGrenze;
  z4: ZonenGrenze;
  z5: ZonenGrenze;
}

export interface ZonenSatz extends ZonenGrenzen {
  quelle: ZonenQuelle;
  /** Garmin-Sportschlüssel, aus dem die Zonen stammen (z.B. RUNNING) */
  sport: string;
  /** HFmax, auf der die Zonen beruhen */
  hfMax: number;
  /** Laktatschwellen-HF, falls Garmin sie kennt */
  lthr: number | null;
}

/** Eine Sport-Zeile aus /biometric-service/heartRateZones */
export interface GarminZonenSport {
  sport: string;
  zone1Floor: number | null;
  zone2Floor: number | null;
  zone3Floor: number | null;
  zone4Floor: number | null;
  zone5Floor: number | null;
  maxHeartRateUsed: number | null;
  restingHrUsed: number | null;
  lactateThresholdHeartRate: number | null;
}

/** Ablageformat in app_settings["garmin_hr_zonen"] */
export interface GarminZonenDaten {
  aktualisiert: string;
  sportarten: GarminZonenSport[];
}

/** Garmin-Sportschlüssel zum Garmin-Aktivitätstyp (activityType.typeKey) */
export function sportKeyFuerTyp(typ: string | null | undefined): string {
  const t = (typ ?? "").toLowerCase();
  if (t.includes("running") || t.includes("hiking") || t.includes("walking")) {
    return "RUNNING";
  }
  if (t.includes("cycling") || t.includes("biking")) return "CYCLING";
  if (t.includes("swimming")) return "SWIMMING";
  return "DEFAULT";
}

function gueltig(s: GarminZonenSport): boolean {
  const floors = [s.zone1Floor, s.zone2Floor, s.zone3Floor, s.zone4Floor, s.zone5Floor];
  if (floors.some((f) => f == null || !isFinite(f) || f <= 0)) return false;
  // streng aufsteigend
  for (let i = 1; i < floors.length; i++) {
    if ((floors[i] as number) <= (floors[i - 1] as number)) return false;
  }
  return true;
}

/**
 * Zonen für einen Sport aus den Garmin-Rohdaten. Fällt auf DEFAULT zurück,
 * wenn der Sport keine eigenen Zonen hat (so verhält sich auch die Uhr).
 */
export function zonenAusGarmin(
  daten: GarminZonenDaten | null | undefined,
  sportKey = "DEFAULT"
): ZonenSatz | null {
  const sportarten = daten?.sportarten ?? [];
  const treffer =
    sportarten.find((s) => s.sport?.toUpperCase() === sportKey && gueltig(s)) ??
    sportarten.find((s) => s.sport?.toUpperCase() === "DEFAULT" && gueltig(s)) ??
    sportarten.find(gueltig);
  if (!treffer) return null;

  const f = [
    treffer.zone1Floor as number,
    treffer.zone2Floor as number,
    treffer.zone3Floor as number,
    treffer.zone4Floor as number,
    treffer.zone5Floor as number,
  ].map(Math.round);
  const hfMax = Math.round(
    treffer.maxHeartRateUsed && treffer.maxHeartRateUsed > f[4]
      ? treffer.maxHeartRateUsed
      : f[4] + 15
  );

  return {
    z1: { von: f[0], bis: f[1] - 1 },
    z2: { von: f[1], bis: f[2] - 1 },
    z3: { von: f[2], bis: f[3] - 1 },
    z4: { von: f[3], bis: f[4] - 1 },
    z5: { von: f[4], bis: hfMax },
    quelle: "garmin",
    sport: (treffer.sport ?? "DEFAULT").toUpperCase(),
    hfMax,
    lthr: treffer.lactateThresholdHeartRate ?? null,
  };
}

/** Karvonen-Fallback als vollwertiger ZonenSatz */
export function zonenAusProfil(p: Pick<Profil, "ruhepuls" | "hfMax">): ZonenSatz {
  return {
    ...hrZonen(p),
    quelle: "karvonen",
    sport: "DEFAULT",
    hfMax: p.hfMax,
    lthr: null,
  };
}

/**
 * Die tatsächlich gültigen Zonen: Garmin schlägt Karvonen, sportspezifisch
 * schlägt DEFAULT. `typ` ist der Garmin-Aktivitätstyp (optional).
 */
export function aktiveZonen(
  profil: Pick<Profil, "ruhepuls" | "hfMax">,
  garmin: GarminZonenDaten | null | undefined,
  typ?: string | null
): ZonenSatz {
  return zonenAusGarmin(garmin, sportKeyFuerTyp(typ)) ?? zonenAusProfil(profil);
}

/** Mitte einer Zone — Referenzpuls für „gleicher Puls"-Vergleiche */
export function zonenMitte(z: ZonenGrenze): number {
  return Math.round((z.von + z.bis) / 2);
}
