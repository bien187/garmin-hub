-- Nachzug zum Stand des Schemas. Der bisherige Weg war `pnpm db:push`,
-- deshalb sind Teile davon auf bestehenden Datenbanken schon vorhanden —
-- alle Schritte sind idempotent, damit die Datei auf frischen wie auf
-- gewachsenen Datenbanken durchläuft.
CREATE TABLE IF NOT EXISTS "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "manual_muscle_template" text;--> statement-breakpoint
ALTER TABLE "computed_daily" ADD COLUMN IF NOT EXISTS "pace_ref_hr_s_km" double precision;--> statement-breakpoint
ALTER TABLE "computed_daily" ADD COLUMN IF NOT EXISTS "pace_ref_hr_sekunden" double precision;--> statement-breakpoint
ALTER TABLE "planned_workouts" ADD COLUMN IF NOT EXISTS "garmin_schedule_id" bigint;--> statement-breakpoint
ALTER TABLE "planned_workouts" ADD COLUMN IF NOT EXISTS "sync_to_garmin" boolean DEFAULT true NOT NULL;
