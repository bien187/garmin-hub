# CLAUDE.md — garmin-hub („Grenadier HQ")

Single-User-Trainings-Webapp. Spezifikation: `instructions.md`, aktueller Stand: `README.md`.

## Stack

- Next.js 15 (App Router, TypeScript, Turbopack), React 19, Tailwind v4 + shadcn/ui + lucide, Recharts, MapLibre.
- Drizzle ORM auf Supabase Postgres (`lib/db/schema.ts`, Migrationen in `drizzle/`).
- Python-Serverless-Functions in `api/bridge/*.py` (Garmin über `garminconnect==0.2.25` + `garth==0.5.2`, DB über `pg8000`). Gemeinsamer Code in `api/_lib/` (Unterstrich = wird nicht deployt).
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
die Prüfungen ausführen. Vitest allein läuft auch im Desktop-Ordner.

`pnpm db:push` nicht gegen die Produktions-DB laufen lassen (kann destruktive Diffs
vorschlagen). Neue Migrationen additiv halten (`CREATE TABLE IF NOT EXISTS`,
`ADD COLUMN IF NOT EXISTS`).

## Konventionen

- UI-Sprache Deutsch (Schweiz): „ss" statt „ß". Code-Bezeichner ebenfalls deutsch.
- Commit-Messages deutsch: `feat: …`, `fix: …`, `docs: …`, `test: …`.
- Datum als ISO-String `YYYY-MM-DD`, „heute" in Europe/Zurich (`heuteIso()`, `addTage()`, `tageDiff()` in `lib/format.ts`).
- Engine (`lib/engine/`, `lib/ep/`) = reine, deterministische Funktionen ohne DB, mit Vitest-Tests in `__tests__/`.
- Server-Zugriff in `lib/server/*-service.ts`, Route Handler in `app/api/**/route.ts` (Session-Prüfung im Handler zusätzlich zur `middleware.ts`).
- Design-Tokens in `app/globals.css` (`--primary`, `--status-green/yellow/orange/red`, `--muted-foreground`, `--border`). Kachel-Titel: `text-[11px] uppercase tracking-[0.08em]`, Zahlen mit `stat-display` / `stat-mono`. Dark-first, ein Akzent, Ampelfarben nur für Status. Touch-Ziele ≥ 44 px, kein horizontales Scrollen auf 390 px.
- Fehlende Daten als `null` behandeln und im UI als „nicht verfügbar" zeigen, nie als 0 oder geraten.

## Garmin-Hinweise

- Inoffizielle API. Token liegen AES-GCM-verschlüsselt in `garmin_tokens`; `get_client()` nimmt sie wieder auf. Frische Logins vermeiden (Rate-Limits, Captchas, MFA).
- Zwischen Garmin-Requests `_pause()` (≈350 ms). Sync ist chunkweise mit `hasMore` und `sync_state`, Zeitbudget 40 s pro Function-Aufruf.
- Jeder Garmin-Aufruf einzeln in `try/except`: ein fehlender Teil darf nicht den ganzen Tag verwerfen.
- Garmin ordnet eine Nacht dem **Aufwachdatum** zu.
- Echte Antwortformate liegen als Fixtures in `tests/fixtures/garmin/<datum>/` (erzeugt mit `scripts/garmin/dump_sleep.py`, Personendaten entfernt). Feldnamen immer an diesen Fixtures prüfen, nie raten. Beschreibung im README unter „Garmin-Datenformat".
- Debug-Skripte gehören nach `scripts/`, nicht nach `api/` (Vercel deployt jede `.py` unter `api/` als Function).
- Schlafdaten sind sensibel: nie loggen, nie Werte in Fehlermeldungen.
