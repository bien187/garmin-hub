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
  Handlungssatz, CTL/ATL/TSB-Fitness-Kurve **seit Trainingsstart**,
  ACWR-Warnung, EP-Notenprognose-Widget, Mini-Body-Map, Wochenvergleich,
  Korrelations-Insights über die gesamte Historie (z. B. Schlaf →
  Laufökonomie) — nur |r| ≥ 0.3, n ≥ 15, klar als Korrelation gelabelt;
  **Fortschrittskurve „Pace bei gleichem Puls"** seit Trainingsstart
  (höhenkorrigierte Median-Pace bei Zone-2-Mitte, je Woche — steigende
  Linie = wachsende Grundlage) und **All-Time-Summen** (km, Hm, Stunden,
  Aktivitäten, längster Lauf). Die Verlaufs-Charts haben einen
  Zeitraum-Umschalter (90 Tage · 6 Mon. · Alles, Standard „Alles") und ab
  mehr als 120 Tagen Monatsticks.
- **Aktivitäten**: Liste mit Filter + Infinite Scroll + Polyline-Minikarten;
  Detailseite mit **3D-Flyover** (MapLibre + Terrarium-Terrain, Kamera folgt
  der Strecke, 1×/4×/10×, Scrubber, Live-km/Pace/HR/Höhe), **Schlussfahrt
  auf die Gesamtstrecke**, **Aufnahmeprofil je Sportart** (Wanderung 40 s,
  enger Zoom und feinere Auflösung; Lauf 30 s; Rad mit höherem Tempolimit),
  **umschaltbarer Kartentyp** (Vektorkarte · Satellit · Topo CH), Route
  eingefärbt nach HR oder Pace, Höhenprofil mit Karten-Hover-Sync, Splits,
  HR-Zonen, GAP (Minetti), EF, aerobe Entkopplung; bei Krafttrainings
  Satz-Tabelle + belastete Muskeln.
- **Karte**: Strava-artiger **Routen-Builder** (BRouter-Routing per Klick,
  Undo/Redo, Wegpunkte verschieben, Rückweg, Rundkurs, Luftlinien-Fallback),
  Live-Distanz/Hm/**Dauer auf Basis der eigenen GAP-Pace**, Höhenprofil,
  2D/3D-Toggle, **Kartentyp-Umschalter** (Vektorkarte · Satellit · Topo CH),
  Heatmap aller Aktivitäten, Speichern + **Push auf die Uhr**
  (`course-service`) + GPX-Export als Fallback.
- **Plan**: adaptiver Wochenplan (regelbasierter Generator), **Workout-Push
  auf die FR 265** über `workout-service/workout` + `schedule` (landet beim
  nächsten Uhren-Sync automatisch auf der Uhr), Workout-Generator „Heute
  frei Schnauze" mit TSB-Vorschau, EP-Benchmark-Erfassung mit Sofort-Note,
  **Probe-EP-Modus** (geführt, alle 5 Disziplinen) und **60-bpm-Metronom**
  (Web Audio). **Taper-Plan ab 05.11.** mit Begründung pro Tag und fixen
  **EP-Tagen** 18./19.11. (eigene Farbe/Icon, nie an die Uhr).
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
- **HF-Zonen aus Garmin**: Der Sync holt die im Konto hinterlegten Zonen
  (`biometric-service/heartRateZones`, sportspezifisch) und legt sie in
  `app_settings` ab. Plan, Workout-Ziele, Zonenverteilung der Aktivitäten
  und die HFmax für TRIMP rechnen danach mit **denselben Grenzen wie die
  Uhr** — ein „Zone-2-Lauf" aus dem Plan trifft damit auch die Zone 2, die
  Garmin in der Aktivität ausweist. Karvonen bleibt nur Fallback, solange
  noch keine Zonen synchronisiert wurden (Status + Knopf „Von Garmin holen"
  unter Einstellungen).
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
Vitest (129 Tests für Engine/EP/Zonen).

**Alles Free Tier:** Vercel Hobby, Supabase Free, OpenFreeMap, AWS Terrain
Tiles, Esri World Imagery, swisstopo WMTS, BRouter — keinerlei bezahlte Keys.

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
Vercel-Timeouts. Vorab läuft der Typ `zonen` (ein einzelner Request für die
HF-Zonen). Nach dem Sync materialisiert `recomputeAll()` alle abgeleiteten
Werte (`computed_daily` inkl. Pace bei Referenzpuls, `muscle_state`,
Lauf-Modell, Workout-Matching).

Die Pace-bei-Referenzpuls-Kurve wird über ein gleitendes 120-Tage-Fenster
gerechnet und per `COALESCE` upgeserted — ältere Wochen behalten damit
ihren Wert, statt bei jedem Lauf neu (und teuer) aus den Streams zu
entstehen. Ändert sich der Referenzpuls, rechnet der nächste Lauf einmalig
400 Tage nach.

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

- **EP-Datum:** fix Mi 18.11.2026 (Tag 1) und Do 19.11.2026 (Tag 2) in
  `lib/ep/konstanten.ts`, nicht mehr editierbar — Details unter
  „EP-Termin und Taper-Plan".
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

### Verlaufs-Graphen seit Trainingsstart

- **Trainingsstart** = erster Tag in `computed_daily` (die Tagesserie in
  `compute.ts` beginnt am Tag der ersten Aktivität), aber nie vor
  `min(start_zeit)` der nicht gelöschten `activities`
  (`trainingsstartAus` in `lib/engine/fortschritt.ts`): `computed_daily` wird
  nur per Upsert geschrieben, nach dem Löschen der ersten Einheit blieben
  davor veraltete Zeilen stehen und würden sonst dauerhaft angezeigt. Er wird
  bei jedem Aufruf aus den Daten bestimmt, nicht gespeichert (echte DB:
  27.06.2026). Dashboard und Insights nutzen dieselbe Regel.
- **Dashboard** (`lib/server/dashboard-service.ts`) liefert Fitness
  (CTL/ATL/TSB) und die Wochen der Pace-bei-Puls-Kurve vom Trainingsstart bis
  heute. Bei ~130–400 Tagen ist die Payload unkritisch und wird nicht
  ausgedünnt.
- **Zeitraum-Umschalter** (`lib/engine/zeitachse.ts`, rein und getestet):
  filtert clientseitig auf den gelieferten Punkten, ohne weitere Requests;
  Bezug ist das letzte Datum der Reihe (= heute). Angeboten werden nur
  Zeiträume, die sich von „Alles" unterscheiden — beginnt das Training erst
  nach der 6-Monats-Grenze, entfällt „6 Mon." (aktuell: „90 Tage · Alles");
  bleibt nur „Alles", verschwindet der Umschalter. Reihenfolge nach Länge
  (90 Tage · 6 Mon. · Alles). Die Auswahl wird nicht gespeichert.
  Kartentitel und Datumsspanne im Untertitel folgen dem gewählten Zeitraum
  („Fitness · seit Trainingsstart" bzw. „· letzte 90 Tage"); der Zustand
  liegt dazu in `ZeitraumBereich` um die ganze Karte.
- **Achse:** Spannweite > 120 Tage → ein Tick je Monat (deutsche Kürzel
  Jan … Dez, bei Jahreswechsel „Jan 27"), gesetzt auf den ersten Datenpunkt
  eines Monats, sofern er in dessen ersten sieben Tagen liegt (ein
  angebrochener Startmonat bekommt kein Etikett direkt neben dem nächsten).
  Sonst Tagesticks wie bisher.
- **Lücken** bleiben leer: Wochen ohne passende Messung sind `null`, die
  Linie wird nicht verbunden (`connectNulls={false}`), nichts interpoliert.
  CTL/ATL/TSB hat keine Lücken — Ruhetage haben TRIMP 0 und sind echter
  Abbau, keine fehlenden Daten.
- **Insights** (`app/api/insights/route.ts`): Tagesreihe ab Trainingsstart
  statt 90 Tage. Ältere `daily_health`-Tage bleiben aussen vor, weil jedes
  Korrelationspaar eine Trainingsmetrik braucht. Der EF-Trend-Tipp
  vergleicht damit das erste und letzte Drittel seit Trainingsstart.
  Schwellen unverändert (|r| ≥ 0.3, n ≥ 15). Waden-Erschöpfung stammt aus
  `muscle_state`, das je Recompute die letzten 60 Tage materialisiert
  (ältere Zeilen bleiben per Upsert erhalten).
- **Bewusst bei kurzen Fenstern geblieben**, weil sie aktuelle Zustände
  statt Verläufe zeigen:
  - EP-Prognose (`lib/ep/prognose.ts`): Benchmarks max. 90 Tage alt — ältere
    Leistungen sagen über den EP-Tag wenig aus.
  - ACWR 7:28 und Wochenvergleich (diese Woche vs. Vorwoche).
  - Körper-Tab (`app/api/body/route.ts`): Muskel-Sparklines 14 Tage
    (Erschöpfung klingt mit τ = 30–48 h ab, ältere Werte sind 0) und
    HRV-Trend 7 Tage.
  - Aktivitätsliste: Filter Gesamt / 30 T / 90 T war schon „Gesamt" als
    Standard.
  - Rechenfenster in `compute.ts` (Pace bei Referenzpuls 120 Tage per
    `COALESCE`-Upsert, Lauf-Modell 42 Tage, Workout-Matching 21 Tage):
    betreffen die Berechnung, nicht die Anzeige; die Pace-Werte älterer Tage
    bleiben gespeichert. Ändert sich der Referenzpuls, werden alle
    gespeicherten Pace-Werte verworfen und die letzten 400 Tage neu
    gerechnet — bei einer längeren Historie bleiben die Wochen davor leer,
    statt still Werte mit dem alten Referenzpuls zu zeigen.

### EP-Termin und Taper-Plan

- **Termin fix:** `EP_DATUM = 2026-11-18` (Tag 1), `EP_TAG_2 = 2026-11-19`,
  `TAPER_START = 2026-11-05` in `lib/ep/konstanten.ts`. Das Feld im
  Profil-Formular ist entfernt (nur noch Anzeige „EP: Mi 18.11.2026 (fix)"),
  `/api/settings` ignoriert `epDatum`, und `ladeProfil()` verwirft einen in der
  DB gespeicherten Altwert. Countdown, Phasen, Restwochen und Prognose lesen
  nur noch die Konstante; der Countdown zählt bis Tag 1 und zeigt an den
  beiden EP-Tagen „EP – Tag 1" bzw. „EP – Tag 2" („EP absolviert" erst ab
  dem 20.11.).
- **Phasen:** Phase 3 „Spezifisch" bis 04.11., Phase 4 „Taper" 05.11.–19.11.
  (kein „EP − 13 Tage" mehr). Nach dem 19.11. bleibt `aktuellePhase` bei
  Phase 4 (es gibt bewusst keine fünfte Phase); der Countdown zeigt ab dem
  20.11. „EP absolviert", der Plan folgt den Regeln „nach der EP" (unten).
- **Tagesregeln** (`taperRegelFuerTag(datum)` in `lib/engine/taper.ts`, rein,
  client-sicher; Felder `maxIntensitaet` = höchste Laufintensität,
  `erlaubt`, `umfangFaktor`, `maxDauerMin`, `nurSubmaximal`,
  `keineBeinkraft`, `begruendung`):

  | Datum | Regel | Lauf max. | Inhalt im Plan |
  |---|---|---|---|
  | Do 05.–Fr 06.11. | Umfang −40 % | Z5, 45 Min | normaler Plan abgeschwächt (Läufe ×0.6, Sätze ×0.6), keine Steigerung |
  | Sa 07.11. | Letzte Intensität | Z5, 45 Min | Probe-EP/Lastlauf → „Letzte Intensität 5×2 Min" |
  | So 08.11. | locker | Z2, 45 Min | Ganzkörper reduziert, Beine nur leicht |
  | Mo 09.11. | Letzte schwere Beineinheit | kein Lauf | Gym Ganzkörper mit Beinen, **kein Lastlauf** |
  | Di 10.11. | Letzter Zieltempo-Lauf | Z4, 40 Min | 12 Min ein, 3×5 Min Z4, 5 Min aus (15 Min Z4) |
  | Mi 11.–So 15.11. | Nur Z2 | Z2, 30 Min | Z2 30/25 Min flach (11./14.), GtG submaximal, Do 12.11. Klimmzüge/Liegestütze submaximal + Rumpf leicht, sonst Ruhe; keine Beinkraft, keine neuen Übungen |
  | Mo 16.11. | Spazieren + Mobilität | kein Lauf | 20 Min Spazieren + Mobilität |
  | Di 17.11. | Frei oder locker | 20 Min | optional 20 Min locker |
  | Mi 18.11. | EP – Tag 1 | — | nur der EP-Eintrag |
  | Do 19.11. | EP – Tag 2 | — | nur der EP-Eintrag |
  | Fr 20.–So 22.11. | Regeneration | kein Lauf | Spazieren |
  | ab Mo 23.11. | Nach der EP | — | kein Plan |

- **Generator:** `generiereWochenplan` baut das Wochenskelett wie bisher und
  wendet danach für Tage ≥ 05.11. die Tagesregel an (05.–08.11.
  abschwächen/ersetzen, ab 09.11. Einheiten direkt aus der Regel). Nach dem
  Verteilen auf verfügbare Tage prüft `erzwingeTaperGrenzen` erneut
  (verschobene Läufe werden zu Z2 gekappt oder entfallen). Einträge ab 05.11.
  werden mit Phase 4 gespeichert.
- **Bestehende Einträge** (`planeBestand` in `lib/engine/plan-bestand.ts`,
  rein und getestet): `ep` und `absolviert` bleiben immer, Vergangenes
  ebenso. Offene `geplant`-Einträge ohne Garmin-ID werden wie bisher auf
  freien bzw. gesperrten Tagen ersetzt. Auf belegten Tagen (ein Eintrag liegt
  schon auf der Uhr) bleiben sie vor dem Taper stehen; ab 05.11. werden sie
  immer durch die Taper-Version des Tages ersetzt (sonst bliebe z. B. am
  05.11. „Klimmzüge schwer" mit 5 Sätzen statt der Variante mit 3 Sätzen
  stehen). Den Ersatz liefert die generierte Woche, ohne Typen, die schon auf
  der Uhr liegen, und ohne zweiten Lauf (echte DB: Probe-EP am 07.11. neben
  dem gepushten Rumpf → „Letzte Intensität"). Gepushte Einträge werden nie
  gelöscht; widersprechen sie dem Taper, steht in den Wochenhinweisen
  „… liegt bereits auf der Uhr und passt nicht zum Taper — bitte «Von der
  Uhr entfernen» und neu planen". Liegt am 05.–08.11. eine Kraft- oder
  Rumpfeinheit ohne Taper-Kürzung auf der Uhr (z. B. der Rumpf am 05./07.11.),
  gibt es den Hinweis, den Umfang selbst um ca. 40 % zu kürzen.
- **EP-Einträge:** `typ = "ep"`, „EP – Tag 1"/„EP – Tag 2", ohne Struktur,
  `syncToGarmin = false`. Der Generator legt sie idempotent an (existiert
  schon einer, bleibt er unverändert) und löscht sie nie. EP-Tage lassen sich
  im Terminplan nicht sperren; es wird nichts auf sie verschoben. Serverseitig
  lehnt `POST /api/plan/[id]/push` (auch für das Sammel-Senden) sie ab,
  `PATCH` erlaubt nur den Status (nie „gepusht"/Garmin-Sync, kein
  Umtypisieren), `DELETE` antwortet 409. Die laufende Plan-Anpassung
  (`berechneAnpassungen`/`passePlanAn`) fasst sie nie an, das
  Workout-Matching markiert sie weder als absolviert noch als verpasst.
  Im Wochenplan: eigene Farbe (`--ep`, hell + dunkel) und Pokal-Icon.
- **Plan-Anpassung im Taper:** ersetzt nie über die Tagesregel hinaus — ein
  lockerer Ersatzlauf ist höchstens so lang wie `maxDauerMin`, an Tagen ohne
  erlaubten Lauf wird daraus ein Ruhetag.
- **Annahmen:**
  - EP Tag 2 = Do 19.11.2026.
  - Widerspruch im Auftrag: Mo 09.11. nennt „Lastlauf" als letzte schwere
    Beineinheit, B3 schliesst Lastläufe im Taper aus. Entscheid: 09.11. ist
    Gym Ganzkörper mit Beinen, **kein Lastlauf** (die spezifischere Regel).
  - Der Auftrag nennt „Di 05.11."; der 05.11.2026 ist ein Donnerstag. Die
    Regel „Umfang −40 %" gilt Do 05.–So 08.11.
  - Rumpf in der letzten Woche nur am 12.11. (auch nicht am 10.11.).
  - Nach der EP: 20.–22.11. Regeneration (Spazieren), danach kein Plan, bis
    neue Ziele gesetzt sind. Wird die EP-Woche (16.11.) oder eine spätere Woche
    neu generiert, entfernt das auch alle veralteten `geplant`-Zeilen ohne
    Garmin-ID nach dem 22.11. (bzw. nach dem Ende der generierten Woche) und
    die Wochenhinweise/Anpassungsprotokolle dieser Wochen. Wochen ab dem 23.11.
    zeigen ohne Einträge „Kein Trainingsplan nach der EP" statt «Woche
    generieren».
  - Die echte DB wird durch diesen Code nicht automatisch umgeplant; die
    Wochen 02.11., 09.11. und 16.11. müssen einmal neu generiert werden (die
    Woche 16.11. räumt dabei die alten Einträge bis 13.12. mit ab).

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

### Aktuelle Übersicht und Terminplanung

Die Fortschrittsübersicht reicht bis zum heutigen Datum (Europe/Zurich), einschliesslich der laufenden Woche. Fehlende Messwochen bleiben leer; der letzte Messstand wird angezeigt. Beim Öffnen nach einem Tageswechsel werden die gespeicherten Trainingsdaten neu berechnet. Die Ansicht aktualisiert sich bei Rückkehr und jede Minute; neue Garmin-Daten kommen weiterhin über den täglichen oder manuellen Sync.

Unter der EP-Prognose lassen sich über «Einträge verwalten / löschen» Fehleinträge entfernen. Die Prognose wird anschliessend neu geladen.

Im Wochenplan lässt sich die Verfügbarkeit für einzelne Daten speichern. Montag, Donnerstag und Sonntag bleiben wie im bestehenden Generator feste Gymtage (inklusive dessen Entlastungs-/Taper-Regeln). Flexible Einheiten werden auf verfügbare Tage verteilt, höchstens ein Lauf pro Tag, mit Abstand zwischen harten Einheiten. Reicht die Zeit nicht, entfallen Einheiten mit Hinweis. Vergangene und absolvierte Einheiten werden nicht neu angelegt. Bereits an Garmin übertragene Tage bleiben erhalten; vor dem Sperren solcher Tage müssen deren offenen Einheiten über «Von der Uhr entfernen» zurückgeholt werden. Verfügbarkeit und Plan werden gemeinsam in einer Transaktion gespeichert; keine Datenbankmigration erforderlich.

## Garmin-Datenformat (Schlaf)

Abgeleitet aus echten Antworten (garminconnect 0.2.25, Forerunner 265), abgelegt als
Fixtures unter `tests/fixtures/garmin/<datum>/` (Nächte 28.10. und 04.11.2026, erzeugt
mit `scripts/garmin/dump_sleep.py`, Profil- und Geräte-IDs auf `0` gesetzt).

**Hauptquelle ist `get_sleep_data(datum)`.** Die Nacht hängt am Aufwachdatum. Die
Tages-Endpunkte (`get_spo2_data`, `get_respiration_data`, `get_all_day_stress`,
`get_heart_rates`, `get_body_battery`) beginnen um lokal 00:00 und decken den Teil
der Nacht vor Mitternacht nicht ab. Sie liefern für die Nacht nichts, was
`get_sleep_data` nicht schon vollständig enthält. `get_hrv_data` ergänzt das
persönliche Baseline-Band.

| Schlüssel in `get_sleep_data` | Inhalt | Zeitformat | Auflösung |
|---|---|---|---|
| `dailySleepDTO` | Zusammenfassung: `sleepTimeSeconds`, `deep/light/rem/awakeSleepSeconds`, `awakeCount`, `averageSpO2Value`, `lowestSpO2Value`, `averageRespirationValue`, `lowest/highestRespirationValue`, `avgHeartRate`, `avgSleepStress`, `sleepScores` (`overall.value`, `deep/light/remPercentage` mit `optimalStart/End`), `sleepNeed` | `sleepStart/EndTimestampGMT` in ms (UTC); `…Local` = ms mit lokalem Offset verschoben | – |
| `sleepLevels` | Phasen-Segmente `{startGMT, endGMT, activityLevel}` | ISO ohne Zone, UTC (`"2026-11-03T21:40:17.0"`) | je Phasenwechsel |
| `sleepMovement` | Bewegung `{startGMT, endGMT, activityLevel}` (0–≈8, Fliesskomma) | ISO ohne Zone, UTC | 60 s, beginnt ≈1 h vor und endet ≈1 h nach dem Schlaf |
| `sleepRestlessMoments` | Unruhige Momente `{value 1–3, startGMT}`; Summe der `value` = `restlessMomentsCount` | ms UTC | Ereignisse |
| `sleepHeartRate` | HF `{value, startGMT}` | ms UTC | 120 s |
| `wellnessEpochSPO2DataDTOList` | SpO2 `{epochTimestamp, spo2Reading, readingConfidence, epochDuration}` | ISO ohne Zone, UTC | 60 s |
| `wellnessSpO2SleepSummaryDTO` | `averageSPO2`, `lowestSPO2`, `averageSpO2HR` | ISO UTC | – |
| `wellnessEpochRespirationDataDTOList` | Atemfrequenz `{startTimeGMT, respirationValue}` (Atemzüge/min) | ms UTC | ≈120 s |
| `wellnessEpochRespirationAveragesList` | Stundenmittel `{epochEndTimestampGmt, respirationAverageValue, …High/LowValue}`; `-2` = kein Wert | ms UTC | 1 h |
| `sleepStress` | Stress `{value, startGMT}` | ms UTC | 180 s |
| `sleepBodyBattery` | Body Battery `{value, startGMT}` | ms UTC | 180 s |
| `hrvData` | HRV `{value, startGMT}` in ms (identisch mit `get_hrv_data().hrvReadings`) | ms UTC | 300 s |
| `breathingDisruptionData` | Abschnitte `{value 0/1, startGMT, endGMT}`; Bedeutung von Garmin nicht dokumentiert, dazu `dailySleepDTO.breathingDisruptionSeverity` | ms UTC | Abschnitte |
| `avgOvernightHrv`, `hrvStatus`, `bodyBatteryChange`, `restingHeartRate` | Nacht-Kennzahlen | – | – |

**Phasen-Codes** (`sleepLevels.activityLevel`), geprüft über die Summe der Segmente
gegen `dailySleepDTO`: `0` = Tief, `1` = Leicht, `2` = REM, `3` = Wach.

**HRV-Baseline** aus `get_hrv_data(datum).hrvSummary.baseline`: `balancedLow`,
`balancedUpper` (ausgeglichener Bereich), `lowUpper`, dazu `weeklyAvg`, `lastNightAvg`,
`lastNight5MinHigh`, `status`.

Nicht vorhanden in den geprüften Nächten: Hauttemperatur (`skinTempDataExists: false`),
Einschlafdauer (kein eigenes Feld; wird aus dem ersten Nicht-Wach-Segment abgeleitet,
wenn möglich).
