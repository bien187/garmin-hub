/** Interne, neutrale Workout-Struktur — wird für Garmin-Push in deren JSON übersetzt */

export type SchrittArt =
  | "aufwaermen"
  | "intervall"
  | "erholung"
  | "auslaufen"
  | "wiederholung";

export interface PaceZiel {
  typ: "pace";
  /** langsamere Grenze, s/km */
  vonSproKm: number;
  /** schnellere Grenze, s/km */
  bisSproKm: number;
}

export interface HrZiel {
  typ: "hr";
  vonBpm: number;
  bisBpm: number;
}

export interface WorkoutSchritt {
  art: SchrittArt;
  dauerTyp: "zeit" | "distanz" | "offen";
  /** Sekunden bzw. Meter */
  dauerWert?: number;
  ziel?: PaceZiel | HrZiel;
  wiederholungen?: number;
  schritte?: WorkoutSchritt[];
  notiz?: string;
}

export interface KraftUebung {
  name: string;
  saetze: number;
  wdh?: number;
  dauerS?: number;
  gewichtKg?: number;
  notiz?: string;
}

export interface WorkoutStruktur {
  name: string;
  sport: "laufen" | "kraft";
  schritte?: WorkoutSchritt[];
  uebungen?: KraftUebung[];
  /** Für Rumpf-Einheiten: Metronom in der App nutzen */
  metronom?: boolean;
}
