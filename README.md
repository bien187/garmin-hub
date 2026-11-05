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
  **EP-Tagen** 18./19.11. (eigene Farbe/Icon, nie an die Uhr). Tippen auf
  einen EP-Tag öffnet die **EP-Checkliste** (Startzeit, Frühstück-Fenster,
  abhakbar, gespeichert).
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
- **Schlafdaten (sensibel):** keine Schlafwerte in Logs oder Fehlermeldungen
  (Python wie TypeScript melden höchstens Datum und Fehlertyp, DB-Fehlertexte
  werden verworfen). Zugriff nur über Routen hinter der Login-Middleware
  (`middleware.ts`) bzw. die Bridge mit `x-internal-key`.

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
HF-Zonen), nach `health` der Schlaf-Backfill `schlaf` (siehe „Schlaf:
Datenmodell, Sync und Backfill"). Nach dem Sync materialisiert `recomputeAll()` alle abgeleiteten
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

Die Migrationen ab `0001` sind idempotent (`IF NOT EXISTS`), laufen also
auch auf Datenbanken durch, die bisher per `db:push` gepflegt wurden.
`0002_schlaf.sql` legt `sleep_nights`, `sleep_epochen` und
`sleep_zeitreihen` an.

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
Gesundheitsdaten + 365 Nächte Schlaf-Historie, angezeigt als
„Schlaf-Historie x/366"). Verlangt Garmin MFA, erscheint eine Meldung — Code unter
**Einstellungen → Garmin-Verbindung** eingeben.

## Lokale Entwicklung

```bash
pnpm dev            # Next.js (Python-Bridge läuft lokal NICHT mit)
vercel dev          # inkl. Python-Functions (empfohlen zum Bridge-Testen)
pnpm test           # Vitest (Engine, EP-Notentabellen, Prognose, Plan, Schlaf-Parser)
python scripts/garmin/test_schlaf_sync.py   # Schlaf-Sync (Python) offline gegen die Fixtures
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

### EP-Checkliste

- **Inhalt** in `lib/ep/checkliste.ts` (rein, client-sicher): je EP-Tag eine
  eigene Liste mit den Gruppen Vorabend / Morgens / Vor Ort / Danach. Tag 2
  hat eigene IDs (`t2-…`) und angepasste Texte (Vorabend = Abend nach Tag 1:
  Erholung, Essen, Tasche für Tag 2). Ernährungsvorschläge stehen gesammelt in
  `ERNAEHRUNG` und lassen sich dort anpassen. Die Punkt-IDs sind der Schlüssel
  des Abhakzustands — Texte dürfen sich ändern, IDs nicht.
- **Startzeit** (Standard 08:00) je Tag; daraus das Frühstück-Fenster
  Startzeit −3 h bis −2 h (`fruehstueckFenster`, bei Startzeiten vor 03:00 mit
  Hinweis „Vortag"). **Fortschritt** „x von y" zählt nur IDs, die in der Liste
  existieren, jede einmal (`fortschritt`).
- **Persistenz:** `app_settings` unter `ep_checkliste_<datum>` mit
  `{ abgehakt: string[], startzeit: "HH:MM" }`, keine Migration.
  `GET /api/ep-checkliste?datum=…` und `PUT /api/ep-checkliste`
  (`{ datum, abgehakt, startzeit }`, zod-validiert, Session-Prüfung im
  Handler). Nur 18.11. und 19.11. sind erlaubt (sonst 400); unbekannte IDs
  und Duplikate werden beim Speichern und Lesen verworfen.
- **UI** (`components/plan/ep-checkliste.tsx`): Tippen auf den EP-Eintrag im
  Wochenplan öffnet ein Bottom-Sheet mit der Checkliste statt der
  aufklappbaren Eintragsansicht (Status „Erledigt" ist dort weiterhin
  setzbar). Ganze Zeile tippbar (≥ 44 px), Abhaken wird sofort angezeigt und
  im Hintergrund gespeichert (immer der vollständige Stand, nacheinander;
  Startzeit-Änderungen gesammelt nach 0.6 s). Schlägt Speichern fehl, bleibt
  der lokale Stand erhalten (auch nach Schliessen/erneutem Öffnen des Sheets
  in derselben Sitzung) und lässt sich per „Erneut speichern" senden. Die
  Sende-Schlange gilt pro EP-Tag für die ganze Seite: Wird das Sheet während
  eines laufenden Speicherns geschlossen und wieder geöffnet, übernimmt es
  diesen Vorgang (kein Fehlerhinweis, keine parallelen PUTs).
- **Annahmen:**
  - Kein Rate-Limit: die übrigen reinen DB-Schreibrouten (z. B.
    `PATCH /api/plan/[id]`, `/api/settings`) haben auch keins; Rate-Limits
    gibt es nur für Login und Garmin-Aufrufe.
  - Die Startzeit gilt je EP-Tag separat (Tag 2 kann anders beginnen).
  - Inhalte sind allgemeine Vorschläge ohne medizinische Aussagen; der
    Hinweis steht auch unter der Liste.
  - `SheetShell` blendet sich jetzt auch aus, wenn `open` von aussen auf
    `false` gesetzt wird (Schliessen-/Abbrechen-Knopf). Vorher blieb das
    Sheet in diesem Fall sichtbar; das betraf auch das bestehende
    „Abbrechen" im Sammel-Senden und im Lösch-Bestätigungs-Sheet.

### Schlaf: Datenmodell, Sync und Backfill

**Aufgabenteilung.** Die Python-Bridge bleibt dünn: Sie speichert pro Nacht
die Garmin-Direktwerte und die Rohantwort in `sleep_nights`. Die
Aufbereitung in Segmente und Zeitreihen macht genau ein TypeScript-Parser
(`lib/engine/schlaf-parser.ts`, reine Funktion, getestet mit den echten
Fixtures), aufgerufen von `lib/server/sleep-service.ts`. So gibt es keinen
doppelten Parser, und die Detailseite muss später nicht ~170 KB Roh-JSON
lesen.

**Tabellen** (Migration `drizzle/0002_schlaf.sql`):

| Tabelle | Inhalt |
|---|---|
| `sleep_nights` (PK `datum` = Aufwachdatum) | `schlaf_start`/`schlaf_ende` (echte UTC-Instants aus `sleepStart/EndTimestampGMT`; Anzeige später in Europe/Zurich, die verschobenen `…Local`-Werte werden nicht gespeichert), `garmin_score` (`sleepScores.overall.value`), `schlaf_dauer_s` (`sleepTimeSeconds`, ohne Wach), `tief_s`/`leicht_s`/`rem_s`/`wach_s`, abgeleitet: `anzahl_wachphasen`, `einschlafzeit_s`, `effizienz_proz`; `raw` (get_sleep_data kompakt), `hrv_baseline` (`get_hrv_data().hrvSummary` mit `baseline`, `lastNightAvg`, `weeklyAvg`, `status`), `zuletzt_synchronisiert`, `aufbereitet_am` |
| `sleep_epochen` (PK `datum, art, start`) | `art` `phase` (Level 0 Tief, 1 Leicht, 2 REM), `wach` (Level 3) oder `bewegung` (unruhige Momente, Level = Garmin-`value` 1–3); `start` (UTC), `dauer_s`. Eine Zeile pro Phasenwechsel, gleiche Nachbarn zusammengefasst |
| `sleep_zeitreihen` (PK `datum, metrik`) | `metrik` `hr`, `spo2`, `atemfrequenz`, `hrv`, `stress`, `body_battery`, `bewegung`; `punkte` = `[[sekunden_seit_schlaf_start, wert], …]` als Minutenmittel (max. 1 Punkt/min, negative Sekunden = vor dem Einschlafen), `roh_anzahl`, `roh_aufloesung_s` (Median-Abstand), `quelle` |

**Sync.** `_health_tag()` (täglicher Health-Sync) ruft `get_sleep_data` und
`get_hrv_data` ohnehin auf und upsertet daraus zusätzlich `sleep_nights`.
Der Health-Sync schreibt immer mindestens die letzten 2 Tage neu (Start =
min(lastDate, gestern)), damit nachträglich eintreffende Nachtdaten
ankommen. Danach bereitet `/api/sync` die gemeldeten Nächte sofort auf;
`recomputeAll()` (Finalize/Cron) holt bis zu 30 offene Reste nach. Offen ist
eine Nacht, solange `aufbereitet_am` NULL oder älter als
`zuletzt_synchronisiert` ist. Beim Neu-Aufbereiten werden Epochen und
Zeitreihen der Nacht in einer Transaktion ersetzt.

**Backfill.** Neuer Sync-Typ `schlaf` mit eigenem `sync_state`-Key `sleep`:
Cursor rückwärts von heute bis heute − 365 Tage (366 Nächte), pro Aufruf
höchstens 15 Nächte bzw. 30 s (der Rest der 60 s bleibt für die Aufbereitung
in Next), je Nacht `get_sleep_data` + `get_hrv_data` mit Pausen. Antwort mit
`fortschritt: {erledigt, gesamt}` und `schlafDaten` (nur Datumsstrings).
Ist der Backfill durch, antwortet die Bridge sofort mit `hasMore: false`,
ohne Garmin-Login. Der tägliche Cron startet den Backfill nicht (nur
`zonen`, `activities`, `health`). Der Sync-Button loopt nach `health` die
Phase `schlaf` und zeigt „Schlaf-Historie x/y".

**Annahmen und Definitionen:**
- Fehlende Werte sind NULL, nie 0. Leere Nacht (kein `dailySleepDTO`,
  `sleepTimeSeconds` NULL oder 0) → keine Zeile; eine bestehende Zeile bleibt
  unangetastet. `hrv_baseline` wird nicht mit NULL überschrieben, wenn
  `get_hrv_data` einmal ausfällt.
- `raw` = vollständige `get_sleep_data`-Antwort als kompaktes JSON (echte
  Nächte ≈170 KB). Über 1 MB werden die grössten Listen weggelassen
  (zuerst `sleepMovement`) und in `raw._gekuerzt` vermerkt.
- Ersatzreihen: Fehlt in `get_sleep_data` eine Reihe, obwohl
  `dailySleepDTO` einen Mittelwert dafür hat (bzw. `bodyBatteryChange` für
  Body Battery), wird der Tages-Endpunkt geholt (`get_heart_rates`,
  `get_spo2_data` → nur Stundenmittel, `get_respiration_data`,
  `get_all_day_stress`, `get_body_battery`), auf das Schlaffenster gefiltert
  und als `raw.zusatz[metrik] = [[ms_utc, wert], …]` mit `raw.zusatz.quellen`
  und Hinweis abgelegt (Tages-Endpunkte liefern erst ab lokal 00:00). HRV
  kommt ersatzweise aus `get_hrv_data().hrvReadings` (kein Zusatzaufruf). Ohne
  Mittelwert-Beleg kein Zusatzaufruf (Rate-Limit). Bei den echten Fixtures
  fehlt nichts.
- Lücken: `null` und negative Platzhalter (`-1`, `-2`) werden verworfen; bei
  HF, SpO2, Atmung und HRV zusätzlich 0 (physiologisch unmöglich). Bei
  Stress, Body Battery und Bewegung ist 0 ein echter Wert. Fehlt eine Reihe
  ganz, fehlt die Metrik (keine Zeile mit Nullen).
- Minutenmittel: Eimer = volle Minuten ab `schlaf_start`, Punkt bei
  `minute × 60` s, Wert auf 2 Nachkommastellen. `roh_anzahl` = gültige
  Rohpunkte vor der Reduktion.
- `anzahl_wachphasen` = Anzahl Wach-Segmente (Level 3, nach dem
  Zusammenfassen) zwischen dem ersten und dem letzten Schlafsegment. Garmins
  `dailySleepDTO.awakeCount` zählt offenbar strenger (in beiden echten
  Nächten 0 trotz je 4 Wach-Segmenten); er bleibt in `raw` verfügbar.
- `einschlafzeit_s` = Dauer eines Wach-Segments ganz am Anfang der Nacht;
  beginnt die Nacht direkt mit Schlaf (wie in beiden Fixtures), ist sie
  nicht ableitbar → NULL.
- `effizienz_proz` = `sleepTimeSeconds` / (`schlaf_ende` − `schlaf_start`)
  × 100 (ohne `sleepTimeSeconds`: Summe der Schlafsegmente).
- Unruhige Momente haben bei Garmin nur einen Zeitpunkt; als Dauer werden
  60 s angenommen.
- Backfill: Nächte, deren Zeile schon nach dem Aufwachtag synchronisiert
  wurde, gelten als final und werden ohne Garmin-Aufruf übersprungen. Ein
  Fehler bei einer einzelnen Nacht (Abruf oder Speichern) überspringt nur
  diese (Datum in `sync_state.sleep.fehlgeschlagen`). Nach dem Durchlauf
  werden diese Nächte genau einmal erneut versucht; erst dann gilt der
  Backfill als fertig. Was dann noch scheitert, steht in
  `sync_state.sleep.endgueltigFehlgeschlagen`. Rate-Limit- oder Login-Fehler
  (401, 403, 429) und fehlende Schlaf-Tabellen brechen den Chunk ab, ohne
  den Cursor weiterzuschieben.
- Ersatzreihen aus den Tages-Endpunkten werden nur geholt, wenn die Reihe in
  `get_sleep_data` fehlt UND `dailySleepDTO` einen Mittelwert für die Metrik
  meldet (also tatsächlich gemessen wurde). Das schont das Rate-Limit;
  Abweichung vom Wortlaut des Auftrags (dort: immer, wenn die Reihe fehlt). Ein
  Fehler im Schlaf-Backfill blockiert im Sync-Button die Neuberechnung nicht.

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

## Schlaf-Analyse (lib/engine/schlaf.ts)

Reine Funktionen auf dem normalisierten Format (ohne DB), getestet mit beiden
echten Fixtures und Randfällen (`lib/engine/__tests__/schlaf.test.ts`). API:
`GET /api/schlaf/<datum>` (Aufwachdatum; keine Daten → `detail: null`).
Alle Werte sind Uhr-Schätzungen; Richtwerte sind keine Diagnose.

| Bereich | Regel |
|---|---|
| Zusammenfassung | Dauer = `sleepTimeSeconds`; Bettzeit = Ende − Start; Effizienz = Schlafzeit / Bettzeit; Einschlafen/Aufwachen = erstes/letztes Schlafsegment (Uhrzeit Europe/Zurich); Wachphasen = Wach-Segmente zwischen erstem und letztem Schlafsegment |
| Phasen | Minuten aus den Garmin-Summen; Tief/Leicht/REM in % der Schlafzeit, Wach in % der Bettzeit. Richtwerte = Garmins persönliche Zielbereiche (`sleepScores.*Percentage.optimalStart/End`), sonst allgemeine Werte (Tief 16–33 %, Leicht 30–64 %, REM 21–31 %) |
| Herzfrequenz | Min/Mittel/Max mit Zeitpunkt; Nachtabfall = Mittel der ersten 30 Min nach dem Einschlafen gegen Mittel ±30 Min um die Nachtmitte; tiefste HF im Tiefschlaf |
| SpO2 | Mittel, Minimum, Minuten < 90 % und < 92 %, Abfälle = zusammenhängende Läufe unter der Schwelle (Lücke > 3 Min trennt) |
| Atemfrequenz | Mittel/Min/Max/Standardabweichung; Mittel je Phase über die Zuordnung jedes Messpunkts zum Phasensegment |
| HRV | Mittel/Min/Max, Einordnung unter/im/über dem ausgeglichenen Bereich (`balancedLow`–`balancedUpper` aus `get_hrv_data`) |
| Stress, Body Battery | Mittel/Max; Body Battery Start, Ende, Aufladung |
| Bewegung | Bewegungsphasen = zusammenhängende Minuten mit `activityLevel` > 2 innerhalb der Schlafzeit; unruhige Momente aus `sleepRestlessMoments` |
| Baseline | 7- und 30-Tage-Mittel OHNE den betrachteten Tag, nur Nächte mit Wert; unter ±3 % = „gleich"; Bewertung je Metrik (HRV hoch = gut, Ruhepuls hoch = schlecht, Atemfrequenz neutral). Für die Vergleichsnächte zählen Garmins Nachtwerte (`avgOvernightHrv`, `averageRespirationValue`, `lowestSpO2Value`, `restingHeartRate`) |
| Regel-Bewertung | Eigene, transparente Punkte (Dauer 40, Effizienz 20, Tiefschlaf 15, REM 15, Wachphasen 10), separat vom Garmin-Score, nie als Ersatz |
| Datenqualität | Rohpunkte / erwartete Punkte (Bettzeit ÷ nominale Auflösung), ≥ 80 % gut, sonst lückenhaft, 0 % = nicht verfügbar |
| Empfehlungen (max. 3) | EP-Tag bzw. Taper-Phase → Schlaf hat Vorrang; < 7 h in drei Nächten in Folge → harte Einheit verschieben; HRV unter dem Bereich → Intensität senken; Tiefschlaf < 75 % des 30-Tage-Mittels (≥ 5 Nächte) → kein Lastlauf, keine schwere Beineinheit |
| Warnhinweis | SpO2 ≥ 2× bzw. ≥ 5 Min unter 90 %, oder Atemfrequenz ≥ 30-Tage-Mittel + 3 Atemzüge/min bei ≥ 60 % der Nacht (≥ 5 Vergleichsnächte). Text: kein medizinischer Befund, bei Beschwerden ärztlich abklären |

## Schlaf-Kachel im Dashboard

Kachel „Schlaf letzte Nacht" (`components/dashboard/schlaf-kachel.tsx`): letzte
Nacht mit Aufwachdatum ≤ heute (sonst mit Datum gekennzeichnet), Dauer,
Bettzeit, Effizienz, Garmin-Score mit Ampel (oder „–"), Mini-Hypnogramm,
Phasen-Balken mit Minuten und Prozent, Vergleich gegen das 7-Tage-Mittel,
Verlauf der Schlafdauer der letzten 14 Nächte (gestrichelt = 7 h) und ein Satz
Fazit. Die ganze Kachel verlinkt auf `/schlaf/<datum>`. Eigene
Suspense-Grenze mit Skeleton, damit das Dashboard nicht wartet. Ohne Daten:
„Noch keine Schlafdaten. Nach dem nächsten Sync verfügbar."

**Abweichung:** Der im Auftrag genannte Dashboard-Edit-Modus (d92cde1) wurde in
97ea34f wieder entfernt; die Kachel ist deshalb fest neben der Fitness-Kurve
eingeordnet. Phasenfarben: neue Tokens `--schlaf-tief/-leicht/-rem/-wach`
(dunkel und hell) in `app/globals.css`, Blau-Familie, getrennt vom Akzent
`--primary`, vom EP-Token und von den Ampelfarben.
