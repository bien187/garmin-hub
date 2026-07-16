CREATE TABLE "activities" (
	"id" bigint PRIMARY KEY NOT NULL,
	"typ" text NOT NULL,
	"name" text,
	"start_zeit" timestamp with time zone NOT NULL,
	"dauer_s" double precision NOT NULL,
	"distanz_m" double precision,
	"hm_auf" double precision,
	"hm_ab" double precision,
	"avg_hr" double precision,
	"max_hr" double precision,
	"avg_pace" double precision,
	"kalorien" double precision,
	"avg_kadenz" double precision,
	"trainingseffekt_aerob" double precision,
	"trainingseffekt_anaerob" double precision,
	"vo2max_wert" double precision,
	"geraet" text,
	"polyline" text,
	"raw" jsonb
);
--> statement-breakpoint
CREATE TABLE "activity_streams" (
	"activity_id" bigint PRIMARY KEY NOT NULL,
	"zeit_s" jsonb,
	"lat" jsonb,
	"lng" jsonb,
	"ele" jsonb,
	"hr" jsonb,
	"pace_s_km" jsonb,
	"kadenz" jsonb,
	"distanz_m" jsonb
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "computed_daily" (
	"datum" date PRIMARY KEY NOT NULL,
	"trimp_gesamt" double precision DEFAULT 0 NOT NULL,
	"ctl" double precision DEFAULT 0 NOT NULL,
	"atl" double precision DEFAULT 0 NOT NULL,
	"tsb" double precision DEFAULT 0 NOT NULL,
	"acwr" double precision,
	"lauf_km" double precision DEFAULT 0 NOT NULL,
	"hm" double precision DEFAULT 0 NOT NULL,
	"effizienz_index" double precision
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"geojson" jsonb NOT NULL,
	"distanz_m" double precision NOT NULL,
	"hm_auf" double precision DEFAULT 0 NOT NULL,
	"hm_ab" double precision DEFAULT 0 NOT NULL,
	"garmin_course_id" bigint,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_health" (
	"datum" date PRIMARY KEY NOT NULL,
	"ruhepuls" double precision,
	"hrv_letzte_nacht" double precision,
	"hrv_status" text,
	"schlaf_dauer_s" double precision,
	"schlaf_score" double precision,
	"tiefschlaf_s" double precision,
	"rem_s" double precision,
	"stress_avg" double precision,
	"body_battery_min" double precision,
	"body_battery_max" double precision,
	"schritte" integer,
	"training_readiness" double precision,
	"raw" jsonb
);
--> statement-breakpoint
CREATE TABLE "ep_benchmarks" (
	"id" text PRIMARY KEY NOT NULL,
	"datum" date NOT NULL,
	"disziplin" text NOT NULL,
	"wert" double precision NOT NULL,
	"notiz" text
);
--> statement-breakpoint
CREATE TABLE "garmin_tokens" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"token_enc" text NOT NULL,
	"aktualisiert" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "muscle_state" (
	"datum" date NOT NULL,
	"muskel_id" text NOT NULL,
	"restbelastung_prozent" double precision NOT NULL,
	CONSTRAINT "muscle_state_datum_muskel_id_pk" PRIMARY KEY("datum","muskel_id")
);
--> statement-breakpoint
CREATE TABLE "planned_workouts" (
	"id" text PRIMARY KEY NOT NULL,
	"datum" date NOT NULL,
	"phase" integer NOT NULL,
	"typ" text NOT NULL,
	"titel" text NOT NULL,
	"beschreibung" text,
	"struktur" jsonb,
	"erwarteter_trimp" double precision,
	"garmin_workout_id" bigint,
	"status" text DEFAULT 'geplant' NOT NULL,
	"matched_activity_id" bigint
);
--> statement-breakpoint
CREATE TABLE "strength_sets" (
	"id" text PRIMARY KEY NOT NULL,
	"activity_id" bigint NOT NULL,
	"uebung_name" text NOT NULL,
	"saetze" integer DEFAULT 1 NOT NULL,
	"wdh" integer,
	"gewicht_kg" double precision,
	"dauer_s" double precision,
	"muskelgruppen" jsonb
);
--> statement-breakpoint
CREATE TABLE "sync_state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"aktualisiert" timestamp with time zone DEFAULT now() NOT NULL
);
