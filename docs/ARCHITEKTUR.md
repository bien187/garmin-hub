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
mit Garmin: Sync, Workout-Push, Course-Push.

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
HF-Zonen), nach `health` der Schlaf-Backfill `schlaf` (siehe „Schlaf:
Datenmodell, Sync und Backfill"). Nach dem Sync materialisiert `recomputeAll()` alle abgeleiteten
Werte (`computed_daily` inkl. Pace bei Referenzpuls, `muscle_state`,
Lauf-Modell, Workout-Matching).

Die Pace-bei-Referenzpuls-Kurve wird über ein gleitendes 120-Tage-Fenster
gerechnet und per `COALESCE` upgeserted — ältere Wochen behalten damit
ihren Wert, statt bei jedem Lauf neu (und teuer) aus den Streams zu
entstehen. Ändert sich der Referenzpuls, rechnet der nächste Lauf einmalig
400 Tage nach.
