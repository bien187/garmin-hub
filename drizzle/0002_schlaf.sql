-- Schlaf-Datenmodell (Phase 4). Idempotent: läuft auf frischen und auf
-- bereits migrierten Datenbanken durch (CREATE TABLE IF NOT EXISTS; die
-- Primärschlüssel entstehen nur zusammen mit ihrer Tabelle).
CREATE TABLE IF NOT EXISTS "sleep_epochen" (
	"datum" date NOT NULL,
	"art" text NOT NULL,
	"start" timestamp with time zone NOT NULL,
	"dauer_s" double precision NOT NULL,
	"level" integer NOT NULL,
	CONSTRAINT "sleep_epochen_datum_art_start_pk" PRIMARY KEY("datum","art","start")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sleep_nights" (
	"datum" date PRIMARY KEY NOT NULL,
	"schlaf_start" timestamp with time zone,
	"schlaf_ende" timestamp with time zone,
	"garmin_score" double precision,
	"schlaf_dauer_s" double precision,
	"tief_s" double precision,
	"leicht_s" double precision,
	"rem_s" double precision,
	"wach_s" double precision,
	"anzahl_wachphasen" integer,
	"einschlafzeit_s" double precision,
	"effizienz_proz" double precision,
	"raw" jsonb,
	"hrv_baseline" jsonb,
	"zuletzt_synchronisiert" timestamp with time zone DEFAULT now() NOT NULL,
	"aufbereitet_am" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sleep_zeitreihen" (
	"datum" date NOT NULL,
	"metrik" text NOT NULL,
	"punkte" jsonb NOT NULL,
	"roh_anzahl" integer NOT NULL,
	"roh_aufloesung_s" double precision,
	"quelle" text DEFAULT 'get_sleep_data' NOT NULL,
	CONSTRAINT "sleep_zeitreihen_datum_metrik_pk" PRIMARY KEY("datum","metrik")
);
