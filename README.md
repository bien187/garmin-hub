# Garmin Hub

Persönliche Single-User-Trainings-Webapp: synchronisiert alle Garmin-Daten
über die **inoffizielle Garmin-Connect-API**, wertet sie mit einer
**regelbasierten sportwissenschaftlichen Engine** aus (keine LLM-Aufrufe,
keine laufenden Kosten) und bereitet gezielt auf die **Eignungsprüfung (EP)
der Schweizer Armee-Grenadiere** (Mitte November 2026) vor.

> ⚠️ **Inoffizielle API:** Diese App loggt sich mit deinen normalen
> Garmin-Zugangsdaten ein (Libraries `garminconnect` + `garth`). Das ist
> von Garmin nicht offiziell unterstützt — Nutzung auf eigenes Risiko und
> ausschliesslich für den persönlichen Account. Zu häufige Logins können
> Rate-Limits/Captchas auslösen; deshalb werden die OAuth-Token
> AES-GCM-verschlüsselt in der DB gecacht (~1 Jahr gültig).

## Features

- **Dashboard**: EP-Countdown + aktuelle Phase, Readiness-Ampel
  (Training Readiness, Body Battery, HRV, Schlaf, Ruhepuls) mit
  Handlungssatz, CTL/ATL/TSB-Fitness-Kurve (90 Tage), ACWR-Warnung,
  EP-Notenprognose-Widget, Mini-Body-Map, Wochenvergleich, Korrelations-
  Insights (z. B. Schlaf → Laufökonomie) — nur |r| ≥ 0.3, n ≥ 15, klar als
  Korrelation gelabelt.
- **Aktivitäten**: Liste mit Filter + Infinite Scroll + Polyline-Minikarten;
  Detailseite mit **3D-Flyover** (MapLibre + Terrarium-Terrain, Kamera folgt
  der Strecke, 1×/4×/10×, Scrubber, Live-km/Pace/HR/Höhe), Route eingefärbt
  nach HR oder Pace, Höhenprofil mit Karten-Hover-Sync, Splits, HR-Zonen,
  GAP (Minetti), EF, aerobe Entkopplung; bei Krafttrainings Satz-Tabelle +
  belastete Muskeln.
- **Karte**: Strava-artiger **Routen-Builder** (BRouter-Routing per Klick,
  Undo/Redo, Wegpunkte verschieben, Rückweg, Rundkurs, Luftlinien-Fallback),
  Live-Distanz/Hm/**Dauer auf Basis der eigenen GAP-Pace**, Höhenprofil,
  2D/3D-Toggle, Heatmap aller Aktivitäten, Speichern + **Push auf die Uhr**
  (`course-service`) + GPX-Export als Fallback.
- **Plan**: adaptiver Wochenplan (regelbasierter Generator), **Workout-Push
  auf die FR 265** über `workout-service/workout` + `schedule` (landet beim
  nächsten Uhren-Sync automatisch auf der Uhr), Workout-Generator „Heute
  frei Schnauze" mit TSB-Vorschau, EP-Benchmark-Erfassung mit Sofort-Note,
  **Probe-EP-Modus** (geführt, alle 5 Disziplinen) und **60-bpm-Metronom**
  (Web Audio).
- **Körper**: SVG-Body-Map (16 Muskelgruppen, vorne/hinten) mit
  Rest-Erschöpfung aus Kraft- **und** Laufeinheiten (exponentieller Abbau,
  muskelspezifisches τ), Bottom-Sheet mit Beiträgen + Sparkline,
  Systemik-Karte (TSB/ACWR/HRV-Trend).
- **PWA**: installierbar, Dark-first, Offline-Fallback auf letzte Daten.
- **Aktivitäts-Verwaltung**: **Löschen** (lokaler Soft-Delete, bleibt bei
  Garmin; kommt nach Sync nicht zurück; Swipe-to-Delete + Undo-Toast) und
  **Aktualisieren** (einzeln oder „letzte 30 Tage" gesammelt; frische Streams
  + Sätze von Garmin, manuell gepflegte Felder bleiben erhalten).
- **Plan → Garmin (Sammel-Push)**: „Alle an Garmin senden" mit Vorschau,
  explizitem `syncToGarmin`-Flag pro Einheit (kein Namens-Matching; Gym
  ausgeschlossen, per Switch umschaltbar), idempotent (keine Duplikate) und
  **rückgängig machbar** (entfernt Workout + Kalendereintrag bei Garmin).
- **Muskel-Template**: Gym-Einheiten ohne verwertbare Übungsdetails kann man
  manuell ein Template zuweisen (Push/Pull/Beine/Ganzkörper/Core); die
  Zuweisung überschreibt die Ableitung und übersteht den Resync.

## Sicherheit

- CSP + HSTS + X-Frame-DENY + Referrer-/Permissions-Policy (Kamera/Mikro aus),
  `noindex`.
- App-Login: zeitkonstanter Vergleich, signiertes HttpOnly-Cookie.
- DB-gestütztes Rate-Limiting: Login 8/15 min, Sync 240/10 min, Push 60/10 min.
- Handler-seitige Session-Prüfung zusätzlich zur Middleware; Garmin-Zugriff
  nur serverseitig; garth-Token AES-GCM-verschlüsselt in der DB.
- **In Vercel manuell aktivieren:** Deployment Protection für Preview-Deploys
  (sonst sind Preview-URLs öffentlich).

## Tech-Stack

Next.js 15 (App Router, TypeScript) · Tailwind v4 + shadcn/ui + lucide ·
Recharts · MapLibre GL (OpenFreeMap Liberty + AWS Terrarium Terrain, kein
API-Key) · BRouter Web-API · Supabase Postgres + Drizzle ORM ·
Python-Serverless-Functions (garminconnect/garth, pg8000) · jose-Cookie-Auth ·
Vitest (79 Tests für Engine/EP).

**Alles Free Tier:** Vercel Hobby, Supabase Free, OpenFreeMap, AWS Terrain
Tiles, BRouter — keinerlei bezahlte Keys.

## Architektur

```
Garmin-Uhr ──BT──> Garmin Connect Cloud
                        │  (inoffizielle API, garth-Token aus DB)
                        ▼
     Python Functions  /api/bridge/*   ← Vercel Cron (05:00 UTC) + Sync-Button
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

**Sync-Strategie:** inkrementell + idempotent. `sync_state` merkt sich
Fortschritt pro Datentyp; ein Aufruf verarbeitet ≤ 12 Aktivitäten bzw.
≤ 7 Gesundheits-Tage (je 300–500 ms Pause zwischen Garmin-Requests,
40-s-Zeitbudget) und liefert `hasMore`. Frontend/Cron loopen, bis alles da
ist — so überlebt auch der Erst-Import der kompletten Historie die
Vercel-Timeouts. Nach dem Sync materialisiert `recomputeAll()` alle
abgeleiteten Werte (`computed_daily`, `muscle_state`, Lauf-Modell,
Workout-Matching).

## Setup

### 1. Supabase

1. Kostenloses Projekt auf [supabase.com](https://supabase.com) anlegen.
2. Connection String kopieren: **Transaction Pooler** (Port 6543).

### 2. ENV

`.env.example` → `.env.local` kopieren und füllen:

| Variable | Zweck |
|---|---|
| `GARMIN_EMAIL` / `GARMIN_PASSWORD` | Garmin-Connect-Zugangsdaten |
| `APP_PASSWORD` | Login-Passwort der App |
| `SESSION_SECRET` | `openssl rand -hex 32` |
| `INTERNAL_API_KEY` | `openssl rand -hex 32` — Next ↔ Python |
| `DATABASE_URL` | Supabase Pooler-URL |
| `TOKEN_ENC_KEY` | `openssl rand -hex 32` (exakt 64 Hex-Zeichen) |
| `CRON_SECRET` | `openssl rand -hex 16` — schützt den Cron-Endpoint |

### 3. Datenbank-Schema

```bash
pnpm db:push        # oder: Migrationen aus ./drizzle anwenden
```

### 4. Deployment (Vercel)

```bash
vercel              # Projekt anlegen, ENV-Variablen im Dashboard setzen
vercel --prod
```

Der tägliche Cron (`0 5 * * *` → `/api/cron/daily`) ist in `vercel.json`
konfiguriert (Hobby-Plan erlaubt tägliche Crons); Vercel sendet dabei
automatisch `Authorization: Bearer $CRON_SECRET`.

### 5. Erst-Import

App öffnen → einloggen → **Sync** auf dem Dashboard. Der Fortschrittsbalken
loopt durch die Chunks (komplette Aktivitäts-Historie + 365 Tage
Gesundheitsdaten). Verlangt Garmin MFA, erscheint eine Meldung — Code unter
**Einstellungen → Garmin-Verbindung** eingeben.

## Lokale Entwicklung

```bash
pnpm dev            # Next.js (Python-Bridge läuft lokal NICHT mit)
vercel dev          # inkl. Python-Functions (empfohlen zum Bridge-Testen)
pnpm test           # Vitest (Engine, EP-Notentabellen, Prognose, Plan)
node scripts/gen-icons.mjs   # PWA-Icons neu generieren
```

Ohne `DATABASE_URL` rendert die App mit leeren Zuständen; ohne Bridge
zeigen Sync/Garmin-Status einen sauberen Fehlerbanner statt zu crashen.

## Getroffene Annahmen (dokumentationspflichtig laut Auftrag)

- **EP-Datum:** Standard 14.11.2026 („Mitte November"), editierbar unter
  Einstellungen; alle Phasen/Countdowns hängen daran.
- **Notentabellen:** Zwischen den bekannten Stützpunkten aus dem Auftrag
  wird linear interpoliert (z. B. Lastlauf 33:00→4.6, 36:00→4.0); exakte
  Zwischennoten des offiziellen Rasters können minim abweichen.
- **Prognose-Dämpfung:** Trends werden auf ±20 % des Ist-Werts gedeckelt
  und auf reglementarische Maxima (120 s/150 s) geklemmt.
- **Health-Backfill:** 365 Tage (in `api/_lib/sync_logic.py` änderbar).
- **Course-Push:** Das JSON-Schema von `POST /course-service/course` ist
  inoffiziell; sollte Garmin es ändern, dient der GPX-Export als Fallback
  (manueller Import in Garmin Connect Web).
- **Kraft-Workout-Push:** Das Workout-Format bildet keine vollständige
  Satzstruktur für alle Übungen ab — Übungen landen als beschriftete
  Schritte auf der Uhr; Rumpf-Einheiten nutzen zusätzlich das In-App-
  Metronom.
- **Muskelmodell:** Heuristik (im UI gekennzeichnet); Lastläufe werden über
  den Aktivitätsnamen erkannt („Lastlauf", „Ruck", „Weste" bzw. „… kg").
- **Wochenindex** für den Entlastungsrhythmus zählt ab Mo, 13.07.2026.
- **Flyover-Kamera:** MapLibre besitzt keine FreeCamera-API (Mapbox-only);
  der Verfolger-Effekt ist mit `jumpTo` + geglättetem Bearing entlang eines
  `bezier-spline`-Kamerapfads umgesetzt.

## Engine-Formeln (lib/engine, vollständig unit-getestet)

- Banister-TRIMP `Dauer × HRr × 0.64 × e^(1.92·HRr)`, Session-RPE-Fallback
- CTL (τ=42 d) / ATL (τ=7 d) / TSB; ACWR 7:28 mit Ampel
- EF = (m/min)/HR (nur Läufe > 20 min, < 50 Hm); aerobe Entkopplung Pw:HR
- GAP über Minetti-Polynom `C(i) = 155.4i⁵ − 30.4i⁴ − 43.3i³ + 46.3i² + 19.5i + 3.6`
- Riegel `T2 = T1 × (D2/D1)^1.06` + Best-Effort-Erkennung (rollende Fenster)
- Lastlauf-Zuschlag ~8.5 s/km pro 10 kg + Stiefel-Malus, auto-kalibriert
  per Ursprungs-Regression sobald echte Lastläufe vorliegen
- Muskel-Erholung `Rest(t) = Σ Lᵢ·e^(−Δt/τ)` (Waden 30 h, kleine
  Oberkörpermuskeln 36 h, grosse Gruppen 48 h; τ×1.3 nach sehr hoher Last)
- Pearson-Korrelationen für Insights (|r| ≥ 0.3, n ≥ 15)
