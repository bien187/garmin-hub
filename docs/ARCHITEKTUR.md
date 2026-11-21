# Architektur und Sync-Strategie

Ausführliche Beschreibung von Datenfluss, Python-Hosting und Synchronisation. Überblick im [README](../README.md#architektur).

## Architektur

```
Garmin-Uhr ──BT──> Garmin Connect Cloud
                        │  (inoffizielle API, garth-Token aus DB)
                        ▼
     Python Function   /api/bridge?aktion=…  ← Vercel Cron (05:00 UTC) + Sync-Button
                        │  schreibt (pg8000)
                        ▼
              Supabase Postgres (Rohdaten + berechnete Metriken)
                        │  liest (Drizzle)
                        ▼
     Next.js Server Components / Route Handlers (Engine in TypeScript)
                        │
                        ▼
                PWA-Frontend (mobile-first)
```

Die Webapp rendert nie direkt gegen Garmin. Nur drei Aktionen sprechen live
mit Garmin: Sync (inkl. Wägungen der Waage), Workout-Push, Course-Push.

**Entscheidung Python-Hosting:** Die Python-Functions liegen im selben
Vercel-Projekt im Root-Ordner `api/bridge/` (Vercel unterstützt gemischte
Runtimes neben Next.js offiziell). Namenskonflikte mit Next-Routen sind
durch das Präfix `/api/bridge/*` ausgeschlossen; Next-eigene Handler leben
unter `/app/api/*`. Ein separates FastAPI-Projekt (Plan B aus dem Auftrag)
war dadurch nicht nötig. Die Bridge akzeptiert nur Requests mit dem Header
`x-internal-key` (Shared Secret).

**Eine Python-Function statt sieben:** Vercel Hobby erlaubt höchstens 12
Serverless Functions pro Deployment. Next.js bündelt seine Routen zu 7
Functions (gruppiert nach `maxDuration`); mit den früher 7 Bridge-Dateien waren
es 14, und die Builds seit dem 30.09.2026 scheiterten daran. Alle Aktionen
(`sync`, `mfa`, `push_course`, `push_workout`, `unpush_workout`,
`resync_activity`, `status`) laufen deshalb über `api/bridge/index.py` mit
`?aktion=<name>`; die Logik steht in `api/_lib/bridge_aktionen.py`.
`bridgeFetch()` übersetzt die bisherigen Pfade `/api/bridge/<name>`
automatisch. Ergebnis: 7 + 1 = 8 Functions. Neue Bridge-Aktionen gehören in
`AKTIONEN`, nie in eine neue Datei unter `api/`.

**Sync-Strategie:** inkrementell + idempotent. `sync_state` merkt sich
Fortschritt pro Datentyp; ein Aufruf verarbeitet ≤ 12 Aktivitäten bzw.
≤ 7 Gesundheits-Tage (je 300–500 ms Pause zwischen Garmin-Requests,
40-s-Zeitbudget) und liefert `hasMore`. Frontend/Cron loopen, bis alles da
ist — so überlebt auch der Erst-Import der kompletten Historie die
Vercel-Timeouts. Vorab läuft der Typ `zonen` (ein einzelner Request für die
HF-Zonen), nach `health` die Wägungen `gewicht` (neue Messungen der letzten
14 Tage plus ein Backfill in 90-Tage-Blöcken bis 5 Jahre zurück, Cursor in
`sync_state.gewicht`, siehe [GEWICHT.md](GEWICHT.md)) und der
Schlaf-Backfill `schlaf` (siehe „Schlaf: Datenmodell, Sync und Backfill"). Nach dem Sync materialisiert `recomputeAll()` alle abgeleiteten
Werte (`computed_daily`, Aerobic-Performance-Analyse neuer Läufe,
`muscle_state`, Lauf-Modell, Workout-Matching).

**Aerobic Performance** (Nachfolger von „Pace bei Puls"): Jeder Lauf wird
einmal aus seinen Zeitreihen in stabile 5-Minuten-Abschnitte zerlegt; das
kompakte Ergebnis liegt im Cache `app_settings["aerobe_analyse"]`
(`lib/server/aerob-service.ts`), mit Zeitbudget für den Backfill aller
historischen Läufe. Individuelles Modell, Normierung auf den Referenzpuls,
Zone 2 Efficiency und der rollierende 28-Tage-Trend entstehen bei jedem
Aufruf frisch in der reinen Engine. Der Referenzpuls (bisher 148 bpm) steht in
`app_settings["pace_ref_hr"]` und wird nicht mehr automatisch verschoben.
Details: [AEROBE-LEISTUNG.md](AEROBE-LEISTUNG.md).
