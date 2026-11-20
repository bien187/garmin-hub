-- Smart Weight Tracking (Garmin Index S2). Rein additiv und idempotent:
-- läuft auf frischen und auf bereits migrierten Datenbanken durch
-- (CREATE ... IF NOT EXISTS; der Fremdschlüssel entsteht nur zusammen mit
-- seiner Tabelle). Bestehende Tabellen werden nicht verändert.
CREATE TABLE IF NOT EXISTS "gewicht_messungen" (
	"id" text PRIMARY KEY NOT NULL,
	"zeitpunkt" timestamp with time zone NOT NULL,
	"datum" date NOT NULL,
	"gewicht_kg" double precision NOT NULL,
	"bmi" double precision,
	"koerperfett_proz" double precision,
	"koerperwasser_proz" double precision,
	"muskelmasse_kg" double precision,
	"knochenmasse_kg" double precision,
	"viszeralfett" double precision,
	"stoffwechselalter" double precision,
	"physique_rating" double precision,
	"quelle" text,
	"raw" jsonb,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gewicht_bedingungen" (
	"messung_id" text PRIMARY KEY NOT NULL,
	"nuechtern" boolean,
	"vor_fruehstueck" boolean,
	"nach_toilette" boolean,
	"mahlzeit_vor_min" integer,
	"fluessigkeit_vor_min" integer,
	"training_vor_min" integer,
	"bad_sauna" boolean,
	"aktualisiert_am" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gewicht_bedingungen_messung_id_gewicht_messungen_id_fk" FOREIGN KEY ("messung_id") REFERENCES "public"."gewicht_messungen"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gewicht_messungen_datum_idx" ON "gewicht_messungen" USING btree ("datum");
