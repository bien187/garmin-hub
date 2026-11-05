import {
  bigint,
  boolean,
  date,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/** Garmin-Aktivitäten (Rohdaten + wichtigste Summenwerte) */
export const activities = pgTable("activities", {
  id: bigint("id", { mode: "number" }).primaryKey(), // Garmin-Activity-ID
  typ: text("typ").notNull(), // z.B. running, trail_running, strength_training
  name: text("name"),
  startZeit: timestamp("start_zeit", { withTimezone: true }).notNull(),
  dauerS: doublePrecision("dauer_s").notNull(),
  distanzM: doublePrecision("distanz_m"),
  hmAuf: doublePrecision("hm_auf"),
  hmAb: doublePrecision("hm_ab"),
  avgHr: doublePrecision("avg_hr"),
  maxHr: doublePrecision("max_hr"),
  avgPace: doublePrecision("avg_pace"), // s/km
  kalorien: doublePrecision("kalorien"),
  avgKadenz: doublePrecision("avg_kadenz"),
  trainingseffektAerob: doublePrecision("trainingseffekt_aerob"),
  trainingseffektAnaerob: doublePrecision("trainingseffekt_anaerob"),
  vo2maxWert: doublePrecision("vo2max_wert"),
  geraet: text("geraet"),
  polyline: text("polyline"), // encoded polyline
  raw: jsonb("raw"),
  // Soft-Delete: gesetzt = im Hub ausgeblendet. Der Garmin-Sync-Upsert
  // fasst diese Spalte nie an → gelöschte Aktivitäten kommen nicht zurück
  // (die Zeile selbst ist die Ausschlussliste).
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  // Zeitpunkt des letzten Garmin-Abgleichs (Sync/Resync)
  syncedAt: timestamp("synced_at", { withTimezone: true }),
  // Manuell zugewiesenes Muskel-Template (überschreibt die abgeleitete
  // Belastung — z.B. für Gym-Einheiten ohne Übungsdetails). Bleibt beim
  // Resync erhalten, da nicht Teil des Garmin-Upserts.
  manualMuscleTemplate: text("manual_muscle_template"),
});

/** Zeitreihen-Streams pro Aktivität (für Flyover + Detailanalysen) */
export const activityStreams = pgTable("activity_streams", {
  activityId: bigint("activity_id", { mode: "number" }).primaryKey(),
  /** Parallele Arrays gleicher Länge */
  zeitS: jsonb("zeit_s").$type<number[]>(),
  lat: jsonb("lat").$type<(number | null)[]>(),
  lng: jsonb("lng").$type<(number | null)[]>(),
  ele: jsonb("ele").$type<(number | null)[]>(),
  hr: jsonb("hr").$type<(number | null)[]>(),
  paceSKm: jsonb("pace_s_km").$type<(number | null)[]>(),
  kadenz: jsonb("kadenz").$type<(number | null)[]>(),
  distanzM: jsonb("distanz_m").$type<(number | null)[]>(),
});

/** Krafttrainings-Sätze (aus get_activity_exercise_sets) */
export const strengthSets = pgTable("strength_sets", {
  id: text("id").primaryKey(), // `${activityId}-${index}`
  activityId: bigint("activity_id", { mode: "number" }).notNull(),
  uebungName: text("uebung_name").notNull(), // Garmin-Exercise-Key
  saetze: integer("saetze").notNull().default(1),
  wdh: integer("wdh"),
  gewichtKg: doublePrecision("gewicht_kg"),
  dauerS: doublePrecision("dauer_s"),
  muskelgruppen: jsonb("muskelgruppen").$type<string[]>(),
});

/** Tägliche Gesundheitsdaten */
export const dailyHealth = pgTable("daily_health", {
  datum: date("datum").primaryKey(),
  ruhepuls: doublePrecision("ruhepuls"),
  hrvLetzteNacht: doublePrecision("hrv_letzte_nacht"),
  hrvStatus: text("hrv_status"),
  schlafDauerS: doublePrecision("schlaf_dauer_s"),
  schlafScore: doublePrecision("schlaf_score"),
  tiefschlafS: doublePrecision("tiefschlaf_s"),
  remS: doublePrecision("rem_s"),
  stressAvg: doublePrecision("stress_avg"),
  bodyBatteryMin: doublePrecision("body_battery_min"),
  bodyBatteryMax: doublePrecision("body_battery_max"),
  schritte: integer("schritte"),
  trainingReadiness: doublePrecision("training_readiness"),
  raw: jsonb("raw"),
});

/** Von der Engine materialisierte Tageswerte */
export const computedDaily = pgTable("computed_daily", {
  datum: date("datum").primaryKey(),
  trimpGesamt: doublePrecision("trimp_gesamt").notNull().default(0),
  ctl: doublePrecision("ctl").notNull().default(0),
  atl: doublePrecision("atl").notNull().default(0),
  tsb: doublePrecision("tsb").notNull().default(0),
  acwr: doublePrecision("acwr"),
  laufKm: doublePrecision("lauf_km").notNull().default(0),
  hm: doublePrecision("hm").notNull().default(0),
  effizienzIndex: doublePrecision("effizienz_index"),
  // Höhenkorrigierte Pace bei Referenzpuls + Zeit im Pulsfenster (das
  // Gewicht, mit dem der Tag in die Wochenauswertung eingeht)
  paceRefHrSKm: doublePrecision("pace_ref_hr_s_km"),
  paceRefHrSekunden: doublePrecision("pace_ref_hr_sekunden"),
});

/** Muskel-Restbelastung pro Tag (materialisiert) */
export const muscleState = pgTable(
  "muscle_state",
  {
    datum: date("datum").notNull(),
    muskelId: text("muskel_id").notNull(),
    restbelastungProzent: doublePrecision("restbelastung_prozent").notNull(),
  },
  (t) => [primaryKey({ columns: [t.datum, t.muskelId] })]
);

/** Geplante Trainingseinheiten */
export const plannedWorkouts = pgTable("planned_workouts", {
  id: text("id").primaryKey(), // uuid
  datum: date("datum").notNull(),
  phase: integer("phase").notNull(),
  typ: text("typ").notNull(), // lauf_z2, intervalle, langer_lauf, lastlauf, huegel, kraft, klimmzuege, rumpf, liegestuetze, ruhe, probe_ep, ep (fixer EP-Tag)
  titel: text("titel").notNull(),
  beschreibung: text("beschreibung"),
  struktur: jsonb("struktur"), // WorkoutStruktur (lib/garmin/workout-json.ts)
  erwarteterTrimp: doublePrecision("erwarteter_trimp"),
  garminWorkoutId: bigint("garmin_workout_id", { mode: "number" }),
  garminScheduleId: bigint("garmin_schedule_id", { mode: "number" }),
  // Explizites Flag statt Namens-Matching: false = nicht an Garmin senden
  // (z.B. Gym-Einheiten). Pro Einheit in der UI umschaltbar.
  syncToGarmin: boolean("sync_to_garmin").notNull().default(true),
  status: text("status").notNull().default("geplant"), // geplant | gepusht | absolviert | verpasst
  matchedActivityId: bigint("matched_activity_id", { mode: "number" }),
});

/** Gespeicherte Routen (Routen-Builder) */
export const courses = pgTable("courses", {
  id: text("id").primaryKey(), // uuid
  name: text("name").notNull(),
  geojson: jsonb("geojson").notNull(),
  distanzM: doublePrecision("distanz_m").notNull(),
  hmAuf: doublePrecision("hm_auf").notNull().default(0),
  hmAb: doublePrecision("hm_ab").notNull().default(0),
  garminCourseId: bigint("garmin_course_id", { mode: "number" }),
  erstelltAm: timestamp("erstellt_am", { withTimezone: true }).notNull().defaultNow(),
});

/** Manuell erfasste EP-Testresultate */
export const epBenchmarks = pgTable("ep_benchmarks", {
  id: text("id").primaryKey(), // uuid
  datum: date("datum").notNull(),
  disziplin: text("disziplin").notNull(), // lastlauf | klimmzuege | liegestuetze | rumpf_seitlich | rumpf_dorsal
  wert: doublePrecision("wert").notNull(), // Sekunden bzw. Wiederholungen
  notiz: text("notiz"),
});

/** Verschlüsselte garth-Token */
export const garminTokens = pgTable("garmin_tokens", {
  id: text("id").primaryKey().default("default"),
  tokenEnc: text("token_enc").notNull(), // AES-GCM: base64(nonce|ciphertext)
  aktualisiert: timestamp("aktualisiert", { withTimezone: true }).notNull().defaultNow(),
});

/** Sync-Fortschritt pro Datentyp */
export const syncState = pgTable("sync_state", {
  key: text("key").primaryKey(), // activities | health | sleep | log
  value: jsonb("value").notNull(),
  aktualisiert: timestamp("aktualisiert", { withTimezone: true }).notNull().defaultNow(),
});

/** App-Einstellungen (Profil etc.) als Key-Value */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
});

/** Fixed-Window-Rate-Limits (Brute-Force-Schutz Login, Garmin-Schonung) */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(), // z.B. "login", "sync", "push"
  count: integer("count").notNull().default(0),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ Schlaf
 * Garmin ordnet eine Nacht dem Aufwachdatum zu („letzte Nacht" = heute).
 * Die Python-Bridge schreibt nur sleep_nights (Garmin-Direktwerte + raw);
 * lib/server/sleep-service.ts bereitet raw einmal pro Sync in
 * sleep_epochen/sleep_zeitreihen auf (Parser: lib/engine/schlaf-parser.ts).
 * Fehlende Werte sind NULL, nie 0.
 */

/** Eine Nacht: Garmin-Zusammenfassung, abgeleitete Kennzahlen, Rohantwort */
export const sleepNights = pgTable("sleep_nights", {
  datum: date("datum").primaryKey(), // Aufwachdatum
  // Echte UTC-Instants aus sleepStart/EndTimestampGMT; Anzeige in Europe/Zurich
  schlafStart: timestamp("schlaf_start", { withTimezone: true }),
  schlafEnde: timestamp("schlaf_ende", { withTimezone: true }),
  garminScore: doublePrecision("garmin_score"), // sleepScores.overall.value
  schlafDauerS: doublePrecision("schlaf_dauer_s"), // sleepTimeSeconds (ohne Wach)
  tiefS: doublePrecision("tief_s"),
  leichtS: doublePrecision("leicht_s"),
  remS: doublePrecision("rem_s"),
  wachS: doublePrecision("wach_s"),
  // Abgeleitet beim Aufbereiten (Definitionen im README „Datenmodell Schlaf")
  anzahlWachphasen: integer("anzahl_wachphasen"),
  einschlafzeitS: doublePrecision("einschlafzeit_s"),
  effizienzProz: doublePrecision("effizienz_proz"),
  raw: jsonb("raw"), // get_sleep_data kompakt (≤ ~1 MB) + optional zusatz
  hrvBaseline: jsonb("hrv_baseline"), // get_hrv_data().hrvSummary
  zuletztSynchronisiert: timestamp("zuletzt_synchronisiert", { withTimezone: true })
    .notNull()
    .defaultNow(),
  // = zuletzt_synchronisiert der aufbereiteten raw-Version; kleiner/NULL → offen
  aufbereitetAm: timestamp("aufbereitet_am", { withTimezone: true }),
});

/** Schlafphasen-, Wach- und Unruhe-Segmente (eine Zeile pro Phasenwechsel) */
export const sleepEpochen = pgTable(
  "sleep_epochen",
  {
    datum: date("datum").notNull(),
    art: text("art").notNull(), // phase | wach | bewegung
    start: timestamp("start", { withTimezone: true }).notNull(),
    dauerS: doublePrecision("dauer_s").notNull(),
    // phase: 0 Tief, 1 Leicht, 2 REM · wach: 3 · bewegung: Unruhe 1–3
    level: integer("level").notNull(),
  },
  (t) => [primaryKey({ columns: [t.datum, t.art, t.start] })]
);

/** Nacht-Zeitreihen, auf Minutenmittel reduziert */
export const sleepZeitreihen = pgTable(
  "sleep_zeitreihen",
  {
    datum: date("datum").notNull(),
    metrik: text("metrik").notNull(), // hr | spo2 | atemfrequenz | hrv | stress | body_battery | bewegung
    // [sekunden_seit_schlaf_start, wert], max. 1 Punkt pro Minute; negative
    // Sekunden = vor dem Einschlafen (Bewegung beginnt ≈1 h früher)
    punkte: jsonb("punkte").$type<[number, number][]>().notNull(),
    rohAnzahl: integer("roh_anzahl").notNull(), // gültige Rohpunkte vor der Reduktion
    rohAufloesungS: doublePrecision("roh_aufloesung_s"), // Median-Abstand der Rohpunkte
    // get_sleep_data oder der Tages-Endpunkt, aus dem die Reihe ersatzweise stammt
    quelle: text("quelle").notNull().default("get_sleep_data"),
  },
  (t) => [primaryKey({ columns: [t.datum, t.metrik] })]
);
