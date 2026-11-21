# CLAUDE.md — garmin-hub („Garmin Hub · Personal Fitness & Running Performance")

Single-User-Fitness-Webapp (Laufleistung, Ausdauer, allgemeine Fitness).
Spezifikation: `instructions.md`, aktueller Stand: `README.md`.

## Stack

- Next.js 15 (App Router, TypeScript, Turbopack), React 19, Tailwind v4 + shadcn/ui + lucide, Recharts, MapLibre.
- Drizzle ORM auf Supabase Postgres (`lib/db/schema.ts`, Migrationen in `drizzle/`).
- EINE Python-Serverless-Function `api/bridge/index.py` (Aktion per `?aktion=`, Logik in `api/_lib/bridge_aktionen.py`; Garmin über `garminconnect==0.2.25` + `garth==0.5.2`, DB über `pg8000`). Gemeinsamer Code in `api/_lib/` (Unterstrich = wird nicht deployt).
- Vercel Hobby, alles Free Tier. Keine bezahlten Dienste, keine API-Keys, keine LLM-Aufrufe.

## Befehle

```bash
pnpm dev            # Next.js lokal (ohne Python-Bridge)
vercel dev          # inkl. Python-Functions
pnpm test           # Vitest
npx tsc --noEmit    # Typecheck
pnpm lint           # ESLint
pnpm build          # Produktions-Build
pnpm db:generate    # Drizzle-Migration aus schema.ts erzeugen
```

**Achtung iCloud:** Liegt das Repo im iCloud-synchronisierten `~/Desktop`, bleiben
Massen-Lesezugriffe (tsc, eslint, next build) gelegentlich minutenlang in `read()`
hängen. Dann das Repo ohne `node_modules`/`.next`/`.git` per `rsync` in einen Ordner
ausserhalb von iCloud spiegeln, dort `pnpm install --offline --frozen-lockfile` und
die Prüfungen ausführen. Vitest allein läuft auch im Desktop-Ordner. Ausgelagerte Dateien
(`ls -lO` zeigt `dataless`) lassen sich mit `brctl download <pfad>` gezielt zurückholen.

`pnpm db:push` nicht gegen die Produktions-DB laufen lassen (kann destruktive Diffs
vorschlagen). Neue Migrationen additiv halten (`CREATE TABLE IF NOT EXISTS`,
`ADD COLUMN IF NOT EXISTS`).

## Konventionen

- UI-Sprache Deutsch (Schweiz): „ss" statt „ß". Code-Bezeichner ebenfalls deutsch.
- Commit-Messages deutsch: `feat: …`, `fix: …`, `docs: …`, `test: …`.
- Datum als ISO-String `YYYY-MM-DD`, „heute" in Europe/Zurich (`heuteIso()`, `addTage()`, `tageDiff()` in `lib/format.ts`).
- Engine (`lib/engine/`) = reine, deterministische Funktionen ohne DB, mit Vitest-Tests in `__tests__/`.
- Trainingsplan: fester Rhythmus Mo Gym · Di Intervalle · Mi Zone 2 · Do Gym · Fr Ruhe · Sa/So frei
  (`lib/engine/plan.ts`), 4-Wochen-Block ab `PROGRAMM_START` (`lib/engine/block.ts`). Planwochen
  davor sind Archiv (neutral, schreibgeschützt). Keine Noten-, Prüfungs- oder EP-Logik mehr;
  `ep_benchmarks` bleibt nur als Altbestand in der DB.
- Server-Zugriff in `lib/server/*-service.ts`, Route Handler in `app/api/**/route.ts` (Session-Prüfung im Handler zusätzlich zur `middleware.ts`).
- Design „Understated Performance" (Tokens in `app/globals.css`): Hintergrund `#151B26`,
  Fläche `--card`, erhöhte Fläche `--surface`/`--surface-2`, Akzente nur mit Bedeutung —
  Salbei `--primary` (Fortschritt, aktiv), Blau `--blau` (Erholung, Schlaf), gedecktes Orange
  `--coral` (Laufen, Intensität); `--status-green/yellow/orange/red` nur für Status. Keine
  Schatten, kein Glow, keine Verläufe, keine Lime-Flächen, keine verschachtelten Karten, kaum
  Animation. Gliederung über `Abschnitt` (Titel + feine Trennlinie) bzw. `KachelKopf`
  (`components/ui/kachel.tsx`), Zahlen mit `stat-display` / `stat-mono`, sparsam `Pill`,
  `Ring`/`Balken`, Icons über `SportIcon`/`EinheitIcon`. Schrift Geist. Dashboard = Gesundheits-
  übersicht, „Nächstes Training" nur im Plan. Grids mit `grid-cols-1` (sonst sprengen
  `truncate`-Texte die Spalte). Touch-Ziele ≥ 44 px, kein horizontales Scrollen auf 390 px.
- Öffentliche Demo unter `/demo` (ohne Login, nur fiktive Daten aus `public/demo/daten/`, erzeugt mit `pnpm demo:daten`). Geteilte Komponenten verlinken intern über `AppLink`/`useAppPfad()` (`components/basis-pfad.tsx`), „jetzt" über `jetztMs()`/`heuteIso()` — nie `Date.now()` direkt in Komponenten. Die Demo ist nur lesend: neue GET-Aufrufe der UI in `lib/demo/api.ts` beantworten, schreibende Aktionen mit `useIstDemo()` sperren.
- Fehlende Daten als `null` behandeln und im UI als „nicht verfügbar" zeigen, nie als 0 oder geraten.
- Aerobic Performance (Entwicklung → Nachfolger von „Pace bei Puls"): Abschnitts-Analyse je Lauf im
  Cache `app_settings["aerobe_analyse"]` (`lib/server/aerob-service.ts`; Regeländerung →
  `ABSCHNITT_VERSION` erhöhen), Modell/Normierung/Trend rein in `lib/engine/aerobe-*.ts`. Details:
  `docs/AEROBE-LEISTUNG.md`.

## Garmin-Hinweise

- Inoffizielle API. Token liegen AES-GCM-verschlüsselt in `garmin_tokens`; `get_client()` nimmt sie wieder auf. Frische Logins vermeiden (Rate-Limits, Captchas, MFA).
- Zwischen Garmin-Requests `_pause()` (≈350 ms). Sync ist chunkweise mit `hasMore` und `sync_state`, Zeitbudget 40 s pro Function-Aufruf.
- Jeder Garmin-Aufruf einzeln in `try/except`: ein fehlender Teil darf nicht den ganzen Tag verwerfen.
- Garmin ordnet eine Nacht dem **Aufwachdatum** zu.
- Echte Antwortformate liegen als Fixtures in `tests/fixtures/garmin/<datum>/` (erzeugt mit `scripts/garmin/dump_sleep.py`, Personendaten entfernt). Feldnamen immer an diesen Fixtures prüfen, nie raten. Beschreibung im README unter „Garmin-Datenformat".
- Debug-Skripte gehören nach `scripts/`, nicht nach `api/` (Vercel deployt jede `.py` unter `api/` als Function).
- **Vercel Hobby: max. 12 Serverless Functions.** Next belegt 7 (Gruppen nach `maxDuration`), die Bridge 1. Keine neuen `.py`-Dateien unter `api/` und keine neuen `maxDuration`-Werte ohne Not; neue Bridge-Aktionen in `AKTIONEN` eintragen.
- Schlaf- und Gewichtsdaten sind sensibel: nie loggen, nie Werte in Fehlermeldungen.
- Gewicht: Sync-Typ `gewicht` (`sync_gewicht`, `get_weigh_ins`), Tabellen `gewicht_messungen`
  (nur Sync schreibt, Werte nie verändern) und `gewicht_bedingungen` (Messprotokoll). Score und
  Trend in `lib/engine/gewicht.ts` — keine Kilogramm-Korrekturen. Details: `docs/GEWICHT.md`.
