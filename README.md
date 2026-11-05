<p align="center">
  <img src="public/icons/icon-512.png" width="88" height="88" alt="Garmin-Hub-Logo: türkiser Doppelgipfel auf Nachtblau">
</p>

<h1 align="center">Garmin Hub</h1>
<p align="center"><strong>Deine Garmin-Daten. Dein Ziel. Ein Plan.</strong></p>
<p align="center">Eine persönliche Trainings-App für die Vorbereitung auf die Eignungsprüfung der Schweizer Armee-Grenadiere.</p>

![Garmin Hub auf dem Desktop: Dashboard mit EP-Countdown, Bereitschaft, EP-Notenprognose, Schlaf und Fitness-Kurve](docs/screenshots/desktop-dashboard.png)

Garmin Hub holt Aktivitäten, Gesundheits- und Schlafdaten von Garmin Connect und
wertet sie mit einer regelbasierten Engine aus. Daraus entstehen ein Dashboard, ein
adaptiver Trainingsplan und eine Notenprognose für die Eignungsprüfung (EP). Die EP
findet am **Mittwoch, 18. November 2026** (Tag 1) und am **Donnerstag, 19. November
2026** (Tag 2) statt.

Die App ist ein **persönliches Single-User-Projekt**. Sie läuft komplett im Free Tier
von Vercel und Supabase, nutzt keine bezahlten Dienste und keine Sprachmodelle.
Die Oberfläche ist für das Smartphone gestaltet und lässt sich als PWA installieren.

> [!WARNING]
> Garmin Hub verwendet die **inoffizielle Garmin-Connect-API** (`garminconnect` und
> `garth`). Garmin unterstützt diese Anbindung nicht. Die Nutzung erfolgt auf eigenes
> Risiko und ist nur für das eigene Konto gedacht. Mehr dazu unter
> [Sicherheit und Datenschutz](#sicherheit-und-datenschutz).

## Ein Blick in die App

<table>
  <tr>
    <th>Dashboard</th>
    <th>Aktivitäten</th>
    <th>Aktivitätsdetail</th>
  </tr>
  <tr>
    <td><img src="docs/screenshots/mobile-dashboard.png" width="260" alt="Mobiles Dashboard mit EP-Countdown, Bereitschafts-Ampel und Notenprognose"></td>
    <td><img src="docs/screenshots/mobile-aktivitaeten.png" width="260" alt="Aktivitätsliste mit Wochengruppen, Minikarten und Kennzahlen"></td>
    <td><img src="docs/screenshots/mobile-aktivitaet.png" width="260" alt="Detail eines Laufs mit Kennzahlen, Karte und Flyover-Steuerung"></td>
  </tr>
  <tr>
    <th>Routen-Builder</th>
    <th>Trainingsplan</th>
    <th>Körper</th>
  </tr>
  <tr>
    <td><img src="docs/screenshots/mobile-karte.png" width="260" alt="Routen-Builder mit gezeichneter Runde, Heatmap und Höhenprofil"></td>
    <td><img src="docs/screenshots/mobile-plan.png" width="260" alt="Wochenplan mit Taper-Begründungen und den beiden EP-Tagen"></td>
    <td><img src="docs/screenshots/mobile-koerper.png" width="260" alt="Body-Map mit Muskel-Erschöpfung von vorne und hinten"></td>
  </tr>
  <tr>
    <th>EP-Checkliste</th>
    <th>Probe-EP</th>
    <th>Schlaf</th>
  </tr>
  <tr>
    <td><img src="docs/screenshots/mobile-ep-checkliste.png" width="260" alt="Checkliste für EP Tag 1 mit Startzeit, Frühstücksfenster und abhakbaren Punkten"></td>
    <td><img src="docs/screenshots/mobile-probe-ep.png" width="260" alt="Resultat einer Probe-EP mit Note pro Disziplin und Gesamtschnitt"></td>
    <td><img src="docs/screenshots/mobile-schlaf.png" width="260" alt="Schlaf-Detailansicht mit Kopfwerten und Hypnogramm"></td>
  </tr>
</table>

Alle Screenshots stammen aus der laufenden App. Die Daten sind **fiktiv**: Läufe auf
erfundenen Runden in Bern, synthetische Gesundheits- und Schlafwerte. Sie wurden mit
[`scripts/readme/demo-daten.mjs`](scripts/readme/demo-daten.mjs) in einer isolierten
lokalen Datenbank erzeugt. Echte Garmin-Daten kommen in keiner Aufnahme vor.

## Was Garmin Hub kann

| Bereich | Funktionen |
| --- | --- |
| **Dashboard** | EP-Countdown mit Phase, Bereitschafts-Ampel mit Handlungssatz, EP-Notenprognose, Schlaf der letzten Nacht, Fitness-Kurve (CTL/ATL/TSB), Pace bei gleichem Puls, Muskelstatus, Wochenvergleich, All-Time-Summen und Korrelations-Insights. |
| **Aktivitäten** | Liste mit Filter und Minikarten, Detailseite mit 3D-Flyover, Höhenprofil, Splits, Herzfrequenzzonen, GAP, Effizienz und aerober Entkopplung. Krafttrainings mit Satz-Tabelle und belasteten Muskeln. |
| **Karte** | Routen-Builder mit Routing per Klick, Undo/Redo, Rückweg, Rundkurs, Höhenprofil, geschätzter Dauer nach eigener Pace, Heatmap, GPX-Export und Senden auf die Uhr. |
| **Trainingsplan** | Regelbasierter Wochenplan, Anpassung nach jedem Sync, Verfügbarkeit pro Tag, Workout-Generator, Senden auf die Uhr und Rückgängig. |
| **Eignungsprüfung** | Notentabellen aller fünf Disziplinen, Benchmarks mit Sofort-Note, Prognose, Probe-EP-Modus mit 60-bpm-Metronom, Taper-Plan ab 5. November und abhakbare Checkliste für beide EP-Tage. |
| **Körper** | Body-Map mit 16 Muskelgruppen, Rest-Erschöpfung aus Kraft- und Laufeinheiten und systemische Ermüdung (TSB, ACWR, HRV-Trend). |
| **Schlaf** | Kachel im Dashboard und Detailansicht pro Nacht mit Hypnogramm, Phasen, Herzfrequenz, SpO2, Atemfrequenz je Phase, HRV, Stress, Body Battery, Bewegung, Vergleich mit 7 und 30 Tagen und Empfehlungen. |
| **Garmin** | Chunkweiser Sync mit Fortschritt, täglicher Cron, verschlüsselte Token, MFA-Eingabe und Herzfrequenzzonen direkt aus dem Garmin-Konto. |
| **App** | Installierbare PWA, Offline-Fallback auf die zuletzt geladenen Seiten, Dark-first-Design, Login mit einem Passwort. |

### Dashboard und Trainingsbereitschaft

Der Kopf zeigt die verbleibende Zeit bis zur EP und die aktuelle Trainingsphase. Die
Bereitschafts-Ampel fasst Training Readiness, Body Battery, HRV, Schlafscore und
Ruhepuls zusammen und formuliert daraus einen Satz für den Tag. Fitness und
Pace bei gleichem Puls zeigen den Verlauf seit Trainingsstart; ein Umschalter
begrenzt die Ansicht auf 90 Tage oder 6 Monate.

Korrelationen zwischen Metriken erscheinen nur ab |r| ≥ 0.3 und mindestens
15 Wertepaaren. Sie sind ausdrücklich als Korrelation gekennzeichnet, nicht als Ursache.

### Aktivitätsanalyse

![Aktivitätsdetail auf dem Desktop mit Kennzahlen, Karte und Verlauf von Höhe, Herzfrequenz und Pace](docs/screenshots/desktop-aktivitaet.png)

Jede Aktivität hat eine Detailseite mit Dauer, Distanz, Pace, GAP (höhenkorrigiert
nach Minetti), Herzfrequenz, Aufstieg, Kalorien, aerober Entkopplung und VO₂max. Der
**3D-Flyover** fährt die Strecke auf MapLibre mit Terrain ab; Geschwindigkeit,
Scrubber und Live-Werte lassen sich steuern. Die Route ist nach Pace oder Herzfrequenz
eingefärbt, das Höhenprofil ist mit der Karte verbunden.

Aktivitäten lassen sich lokal ausblenden (bei Garmin bleiben sie erhalten) und einzeln
oder gesammelt neu von Garmin laden.

### Routen-Builder und Karten

Der Routen-Builder routet per Klick über die freie BRouter-API. Er zeigt Distanz,
Höhenmeter und eine Dauer auf Basis der eigenen GAP-Pace. Kartentypen: Vektorkarte
(OpenFreeMap), Satellit (Esri World Imagery) und Topo CH (swisstopo). Gespeicherte
Routen lassen sich als Course an Garmin senden; GPX-Export dient als Ausweichweg.

### Adaptiver Trainingsplan

Ein regelbasierter Generator erstellt den Wochenplan aus Rahmenphase, absolvierten
Einheiten, TSB, ACWR, Muskelstatus und Benchmarks. Nach jedem Sync schwächt
`passePlanAn()` offene Einheiten ab, wenn die Belastung es verlangt. Einheiten gehen
über `workout-service` als strukturiertes Workout in den Garmin-Kalender und erscheinen
beim nächsten Uhren-Sync auf der Forerunner 265. „Alle an Garmin senden" überträgt
die Woche gesammelt mit Vorschau und ohne Duplikate; Gym-Einheiten sind standardmässig
ausgenommen. Bereits gesendete Einheiten lassen sich wieder von der Uhr entfernen.
Ziel-Herzfrequenzen kommen aus den Zonen, die im Garmin-Konto hinterlegt sind.

Der Workout-Generator „Heute frei Schnauze" baut aus Distanz oder Dauer und
Anstrengung ein Workout mit den eigenen Paces und zeigt den erwarteten TRIMP sowie die
Wirkung auf die Form (TSB) von morgen.

<table>
  <tr>
    <th>Workout-Generator</th>
    <th>Benchmarks</th>
  </tr>
  <tr>
    <td><img src="docs/screenshots/mobile-generator.png" width="260" alt="Workout-Generator mit gebautem Intervall-Workout und TSB-Vorschau"></td>
    <td><img src="docs/screenshots/mobile-benchmarks.png" width="260" alt="Erfassung von EP-Benchmarks mit Verlauf und Note pro Eintrag"></td>
  </tr>
</table>

### Vorbereitung auf die Eignungsprüfung

Alle fünf Disziplinen sind exakt nach der offiziellen **Notentabelle Eignungsprüfung
EP_AZ SK** hinterlegt ([`lib/ep/disziplinen.ts`](lib/ep/disziplinen.ts)): Marsch 5 km
mit 20 kg, Klimmzüge, Liegestützen in 60 s, seitliche Rumpfkraft (max. 120 s) und
dorsale Rumpfkette (max. 150 s). Aus den erfassten Benchmarks entsteht eine Prognose
pro Disziplin und für den Gesamtschnitt.

| Note | Bewertung | Bedeutung |
| --- | --- | --- |
| 5.00–4.50 | sehr gut | erfüllt die Anforderungen deutlich |
| 4.49–4.00 | gut | erfüllt die Anforderungen |
| 3.99–3.60 | genügend | erfüllt die Mindestanforderungen knapp |
| 3.59–1.00 | ungenügend | erfüllt die Mindestanforderungen nicht |

Die EP gilt als **bestanden**, wenn der Durchschnitt aller Disziplinen mindestens
**genügend (3.60)** ist. Eine 1.0 in einer Disziplin zieht den Schnitt stark nach
unten und wird in der App eigens gewarnt.

Ab dem **5. November** gilt ein expliziter **Taper-Plan** mit einer Regel und einer
Begründung pro Tag: Umfang reduzieren, letzte Intensität am 7. November, nur noch
lockere Läufe in der letzten Woche. Die beiden **EP-Tage** sind fest im Plan, werden
nie überschrieben und nie an die Uhr gesendet. Ein Tipp auf einen EP-Tag öffnet die
**Checkliste** mit Startzeit, Frühstücksfenster und abhakbaren Punkten.
Details: [EP-Termin, Taper-Plan und Checkliste](docs/EP-UND-TAPER.md).

![Wochenplan auf dem Desktop mit Taper-Begründung pro Tag und den beiden EP-Tagen](docs/screenshots/desktop-plan.png)

### Körper- und Muskelanalyse

Die Body-Map zeigt die geschätzte Rest-Erschöpfung von 16 Muskelgruppen aus Kraft-
und Laufeinheiten mit muskelspezifischem exponentiellem Abbau. Das Modell ist eine
Heuristik und in der App so gekennzeichnet. Der Plan-Generator meidet harte Einheiten
für stark belastete Muskelgruppen. Gym-Einheiten ohne verwertbare Übungsdetails lassen
sich manuell einem Template zuweisen (Push, Pull, Beine, Ganzkörper, Core).

Ein Tipp auf einen Muskel öffnet ein Detail mit Rest-Erschöpfung, der Zeit bis zur
vollen Belastbarkeit, einem Verlauf über 14 Tage und den Einheiten, die beigetragen haben.

<img src="docs/screenshots/mobile-muskel-detail.png" width="300" alt="Muskel-Detail für den Quadrizeps mit Rest-Erschöpfung, Verlauf und Beiträgen der letzten Einheiten">

### Schlaf

![Schlaf-Detailansicht auf dem Desktop mit Kopfwerten, Hypnogramm und Phasenverteilung](docs/screenshots/desktop-schlaf.png)

<details>
  <summary>Herzfrequenz und SpO2 in der Nacht ansehen</summary>

<img src="docs/screenshots/mobile-schlaf-verlauf.png" width="300" alt="Herzfrequenz und Sauerstoffsättigung in der Nacht mit Phasenhintergrund, Minimum, Maximum und Schwellen">

</details>

Die Detailansicht zeigt jede Nacht vollständig: Hypnogramm, Phasenverteilung mit
Richtwerten, Herzfrequenz, Sauerstoffsättigung mit Schwellen bei 90 und 92 %,
Atemfrequenz je Schlafphase, HRV gegen das persönliche Garmin-Band, Stress, Body
Battery sowie Bewegung und Unruhe. Alle Zeitachsen sind synchronisiert. Fehlende Daten
stehen ausdrücklich als „nicht verfügbar" da.

Die Analyse vergleicht jede Kernmetrik mit dem 7- und 30-Tage-Mittel und gibt
regelbasierte Empfehlungen für Training und EP. Alle Werte sind Schätzungen der Uhr
und kein medizinischer Befund. Details: [Schlaf](docs/SCHLAF.md).

### Garmin-Synchronisation

Der Sync läuft inkrementell und in Chunks, damit er die 60 Sekunden einer Vercel-Function
nicht überschreitet. Jeder Aufruf verarbeitet höchstens 12 Aktivitäten, 7
Gesundheitstage oder 15 Schlafnächte und meldet `hasMore`. Der Sync-Knopf ruft weiter
auf, bis alles da ist, und zeigt den Fortschritt. Zwischen den Garmin-Anfragen liegen
etwa 350 ms Pause.

Ein **täglicher Cron** (05:00 UTC) synchronisiert Aktivitäten, Herzfrequenzzonen und
die letzten Gesundheitstage. Danach berechnet `recomputeAll()` Fitness, Muskelstatus,
Laufmodell und Schlafaufbereitung neu.

### Offline-Funktionen und PWA

Die App lässt sich auf iOS und Android installieren. Der Service Worker
([`public/sw.js`](public/sw.js)) cacht die App-Shell und statische Assets; Seiten
laden zuerst aus dem Netz und fallen offline auf den zuletzt geladenen Stand zurück.
Kartenkacheln werden bewusst nicht gecacht. Sync, Workout-Push und Routen-Push
brauchen eine Verbindung.

## Sicherheit und Datenschutz

Garmin Hub greift über die **inoffizielle Garmin-Connect-API** auf das eigene Konto zu.

- **Nicht offiziell unterstützt.** Garmin kann die Schnittstelle jederzeit ändern oder sperren. Die Nutzung erfolgt auf eigenes Risiko.
- **Nur ein Konto.** Die App ist als persönliches Single-User-Projekt gebaut. Sie hat ein einziges App-Passwort und keine Benutzerverwaltung.
- **Zugangsdaten schützen.** `GARMIN_EMAIL` und `GARMIN_PASSWORD` liegen nur als Umgebungsvariablen auf dem Server. Der Browser spricht nie direkt mit Garmin.
- **Verschlüsselte Token.** Nach dem ersten Login speichert die Python-Bridge die garth-Token AES-GCM-verschlüsselt in `garmin_tokens` ([`api/_lib/crypto.py`](api/_lib/crypto.py)). Der Schlüssel `TOKEN_ENC_KEY` liegt nur in der Umgebung.
- **Rate-Limits beachten.** Häufige frische Logins können bei Garmin Rate-Limits, Captchas oder MFA auslösen. Deshalb werden die Token wiederverwendet, und die App begrenzt Sync (240 pro 10 Min), Push (60 pro 10 Min) und Login (8 pro 15 Min).
- **Keine Secrets im Repository.** `.env.local` ist in `.gitignore`. Zugangsdaten, Token und Schlüssel gehören nie in GitHub, auch nicht in Issues oder Screenshots.

Weitere Schutzmassnahmen im Code:

- Middleware schützt alle Seiten und Routen ausser Login, Cron und Bridge. Route-Handler prüfen die Session zusätzlich.
- Login mit zeitkonstantem Passwortvergleich und signiertem HttpOnly-Cookie (30 Tage, `jose`).
- Die Bridge akzeptiert nur Anfragen mit `x-internal-key`; der Cron nur mit `Authorization: Bearer $CRON_SECRET`.
- CSP mit Nonce, HSTS, `X-Frame-Options: DENY`, Referrer- und Permissions-Policy, `noindex`.
- Schlafdaten gelten als sensibel: Werte erscheinen weder in Logs noch in Fehlermeldungen.

Für einen eigenen Betrieb sind zusätzlich nötig: starke, zufällige Werte für alle
Secrets, ein starkes `APP_PASSWORD` und in Vercel die **Deployment Protection** für
Preview-Deployments, sonst sind Preview-URLs öffentlich erreichbar.

## Lokal starten

### Voraussetzungen

| Werkzeug | Version | Wofür |
| --- | --- | --- |
| Node.js | 20 LTS oder neuer (Next.js 15 braucht mindestens 18.18) | Next.js-App |
| pnpm | 9 | Paketverwaltung (`pnpm-lock.yaml`) |
| Python | 3.10 oder neuer (Vercel nutzt 3.12) | Garmin-Bridge |
| PostgreSQL | 16 empfohlen, z. B. ein kostenloses Supabase-Projekt, dazu `psql` | Datenbank |
| Vercel CLI | aktuell, mit Login | Bridge lokal (`vercel dev`) und Deployment |
| Garmin-Connect-Konto | normales Konto, kein Developer-Zugang nötig | Datenquelle |

### Schritt für Schritt

1. Repository klonen und Abhängigkeiten installieren:

   ```sh
   git clone https://github.com/bien187/garmin-hub.git
   cd garmin-hub
   pnpm install
   ```

2. Umgebungsvariablen anlegen und ausfüllen (siehe [nächster Abschnitt](#umgebungsvariablen-und-externe-dienste)):

   ```sh
   cp .env.example .env.local
   ```

3. Datenbankschema anwenden. Die drei Migrationen laufen der Reihe nach auf einer
   leeren Datenbank:

   ```sh
   psql "$DATABASE_URL" -f drizzle/0000_init.sql
   psql "$DATABASE_URL" -f drizzle/0001_whole_wasp.sql
   psql "$DATABASE_URL" -f drizzle/0002_schlaf.sql
   ```

   Für eine neue, leere Datenbank funktioniert alternativ `pnpm db:push`. Gegen eine
   bestehende Produktionsdatenbank nicht verwenden, weil Drizzle dabei destruktive
   Änderungen vorschlagen kann.

4. Next.js-App starten:

   ```sh
   pnpm dev
   ```

   Öffne [localhost:3000](http://localhost:3000) und melde dich mit `APP_PASSWORD` an.

5. Für den Garmin-Sync auch die Python-Bridge starten. `pnpm dev` startet sie **nicht**.
   Mit der Vercel CLI laufen Next.js und Python zusammen:

   ```sh
   vercel link   # einmalig, Projekt verknüpfen
   vercel dev
   ```

   Die Vercel CLI braucht dafür [uv](https://docs.astral.sh/uv/) im `PATH`. Danach auf
   dem Dashboard **Sync** drücken. Verlangt Garmin einen MFA-Code, erscheint ein
   Hinweis; der Code wird unter **Einstellungen → Garmin-Verbindung** eingegeben.

### Was ohne externe Dienste läuft

| Komponente | Lokal ohne Internet | Braucht externe Dienste |
| --- | --- | --- |
| Oberfläche, Engine, Plan, Auswertungen | ja, mit einer lokalen PostgreSQL-Datenbank | – |
| Garmin-Sync, Workout- und Routen-Push | – | Garmin Connect, Python-Bridge |
| Kartenkacheln, Terrain, Routing | – | OpenFreeMap, AWS Terrain Tiles, Esri, swisstopo, BRouter |
| Täglicher Sync | – | Vercel Cron |

Ohne Bridge zeigen Sync und Garmin-Status einen sauberen Fehlerhinweis statt eines
Absturzes. Ohne `DATABASE_URL` rendert die App leere Zustände.

### Produktionsbuild

```sh
pnpm build
pnpm start
```

Die PWA-Installation ausserhalb von `localhost` braucht HTTPS.

## Umgebungsvariablen und externe Dienste

Alle Variablen stehen mit Beispielwerten in [`.env.example`](.env.example).

| Variable | Zweck | Erzeugen |
| --- | --- | --- |
| `GARMIN_EMAIL`, `GARMIN_PASSWORD` | Login bei Garmin Connect | eigenes Konto |
| `APP_PASSWORD` | Login in die App | starkes Passwort |
| `SESSION_SECRET` | Signatur des Session-Cookies | `openssl rand -hex 32` |
| `INTERNAL_API_KEY` | Shared Secret zwischen Next.js und Bridge | `openssl rand -hex 32` |
| `DATABASE_URL` | PostgreSQL, bei Supabase der Transaction Pooler (Port 6543) | Supabase-Dashboard |
| `TOKEN_ENC_KEY` | AES-GCM-Schlüssel für die Garmin-Token, genau 64 Hex-Zeichen | `openssl rand -hex 32` |
| `CRON_SECRET` | Schützt `/api/cron/daily` | `openssl rand -hex 16` |
| `BRIDGE_URL` | Optional: Adresse der Bridge, wenn sie nicht auf derselben Domain läuft | – |

Die Python-Bridge weicht beim Supabase-Pooler automatisch auf den Session-Port 5432
aus, weil `pg8000` keine Prepared Statements über den Transaction Pooler unterstützt.

Externe Dienste, alle kostenlos und ohne API-Schlüssel ausser den eigenen Konten:
Garmin Connect, Supabase, Vercel, OpenFreeMap, AWS Terrain Tiles (Terrarium), Esri
World Imagery, swisstopo WMTS und BRouter.

## Datenbank und Migrationen

Das Schema steht in [`lib/db/schema.ts`](lib/db/schema.ts) (Drizzle ORM), die
Migrationen in [`drizzle/`](drizzle). Neue Migrationen entstehen mit
`pnpm db:generate` und sollen additiv bleiben (`CREATE TABLE IF NOT EXISTS`).

| Bereich | Tabellen |
| --- | --- |
| Garmin-Rohdaten | `activities`, `activity_streams`, `strength_sets`, `daily_health` |
| Schlaf | `sleep_nights`, `sleep_epochen`, `sleep_zeitreihen` |
| Berechnet | `computed_daily`, `muscle_state` |
| Training | `planned_workouts`, `courses`, `ep_benchmarks` |
| Betrieb | `garmin_tokens`, `sync_state`, `app_settings`, `rate_limits` |

Beim Erst-Import holt der Sync die komplette Aktivitätshistorie, 365 Tage
Gesundheitsdaten und 365 Nächte Schlaf. Die Schlafnächte bereitet ein TypeScript-Parser
nach dem Sync in Phasen und Minuten-Zeitreihen auf.

## Deployment

1. Kostenloses Supabase-Projekt anlegen und die Migrationen anwenden.
2. Projekt bei Vercel anlegen (`vercel`) und alle Umgebungsvariablen im Dashboard setzen.
3. Produktion deployen:

   ```sh
   vercel --prod
   ```

4. Deployment Protection für Preview-Deployments aktivieren.
5. App öffnen, anmelden und den ersten Sync starten.

Der Cron steht in [`vercel.json`](vercel.json) (`0 5 * * *` auf `/api/cron/daily`);
Vercel sendet dabei automatisch `Authorization: Bearer $CRON_SECRET`.

> [!IMPORTANT]
> Vercel Hobby erlaubt höchstens **12 Serverless Functions** pro Deployment. Next.js
> bündelt die Routen zu 7 Functions, die Bridge ist eine einzige Function
> ([`api/bridge/index.py`](api/bridge/index.py)). Neue Bridge-Aktionen gehören in
> `AKTIONEN` in [`api/_lib/bridge_aktionen.py`](api/_lib/bridge_aktionen.py), nicht in
> neue Dateien unter `api/`.

## Technik

| Ebene | Umsetzung |
| --- | --- |
| App | Next.js 15 App Router, React 19, TypeScript strict, Turbopack |
| Oberfläche | Tailwind CSS 4, shadcn/ui (Radix UI), Lucide, framer-motion |
| Diagramme | Recharts |
| Karten | MapLibre GL, Turf, OpenFreeMap, AWS Terrain Tiles, BRouter |
| Daten | PostgreSQL (Supabase), Drizzle ORM, postgres.js, Zod |
| Garmin-Bridge | Python, `garminconnect` 0.2.25, `garth` 0.5.2, `pg8000`, `cryptography` |
| Auth | Passwort-Login, signiertes Cookie mit `jose` |
| Hosting | Vercel Hobby mit Cron, PWA mit Service Worker |
| Prüfungen | Vitest, ESLint, TypeScript, Playwright für Screenshots und Layout-Checks |

## Architektur

```mermaid
flowchart LR
  Uhr[Forerunner 265] -->|Bluetooth| GC[Garmin Connect]
  GC <-->|inoffizielle API, garth-Token| Bridge[Python-Bridge<br>api/bridge]
  Cron[Vercel Cron 05:00 UTC] --> Next
  Knopf[Sync-Knopf] --> Next
  Next[Next.js Route Handler] -->|x-internal-key| Bridge
  Bridge -->|pg8000| DB[(PostgreSQL)]
  Next -->|recomputeAll| Engine[Engine lib/engine]
  Engine --> DB
  DB -->|Drizzle| UI[Dashboard, Plan, Körper, Schlaf]
  UI -->|Workout und Course| Next
```

Die Oberfläche rendert nie direkt gegen Garmin, sondern immer aus der eigenen
Datenbank. Nur drei Aktionen sprechen live mit Garmin: Sync, Workout-Push und
Routen-Push. Die Engine besteht aus reinen, deterministischen Funktionen und berechnet
nach jedem Sync die abgeleiteten Werte. Ausführlich: [Architektur und
Sync-Strategie](docs/ARCHITEKTUR.md).

## Projektstruktur

```text
app/                  Seiten (Dashboard, Aktivitäten, Karte, Plan, Körper, Schlaf) und API-Routen
api/bridge/index.py   Python-Bridge zu Garmin Connect (eine Vercel-Function)
api/_lib/             Garmin-Client, Sync-Logik, Verschlüsselung, Bridge-Aktionen
components/           UI nach Bereichen (dashboard, activities, map, plan, body, schlaf)
lib/engine/           Engine: TRIMP, Fitness, GAP, Riegel, Muskeln, Plan, Taper, Schlaf
lib/ep/               EP-Disziplinen, Notentabellen, Prognose, Phasen, Checkliste
lib/server/           Datenbankzugriff und Dienste für die Seiten
lib/db/               Drizzle-Schema und Verbindung
drizzle/              SQL-Migrationen
public/               Icons, Manifest und Service Worker
scripts/              Werkzeuge (Icons, Garmin-Dump, README-Screenshots, Layout-Checks)
tests/fixtures/       Echte Garmin-Antworten ohne Personendaten für Parser-Tests
docs/                 Weitere Dokumentation und Screenshots
```

## Tests

```sh
pnpm test                 # Vitest
npx tsc --noEmit          # Typecheck
pnpm lint                 # ESLint
pnpm build                # Produktionsbuild
python scripts/garmin/test_schlaf_sync.py   # Schlaf-Sync der Bridge offline gegen Fixtures
```

Stand 5. November 2026: **301 Vitest-Tests** sind grün, dazu Typecheck, Lint (ohne
Fehler) und Produktionsbuild. Die Tests decken die Engine ab: TRIMP, CTL/ATL/TSB, GAP,
Riegel, Notentabellen, Prognose, Muskelabbau, Plan, Taper, Verfügbarkeit,
EP-Checkliste sowie Schlaf-Parser und Schlaf-Analyse. Parser und Analyse laufen gegen
echte Garmin-Antworten aus [`tests/fixtures/garmin`](tests/fixtures/garmin), aus denen
Profil- und Geräte-IDs entfernt sind. Das Python-Testskript braucht die Pakete aus
`requirements.txt`.

### Screenshots neu aufnehmen

Die Aufnahmen in `docs/screenshots` entstehen mit fiktiven Daten in einer lokalen
Datenbank, zum Beispiel einem Docker-Container:

```sh
docker run -d --name ghq-demo-db -e POSTGRES_PASSWORD=demo -e POSTGRES_DB=ghq_demo \
  -p 127.0.0.1:55432:5432 postgres:16
export DEMO_DATABASE_URL=postgres://postgres:demo@127.0.0.1:55432/ghq_demo
for f in drizzle/000*.sql; do psql "$DEMO_DATABASE_URL" -f "$f"; done
node scripts/readme/demo-daten.mjs
```

Danach die App mit `DATABASE_URL=$DEMO_DATABASE_URL` bauen und mit `pnpm start -p 3999`
starten, das Dashboard einmal öffnen (berechnet Fitness, Muskeln und Schlaf) und die
Plan-Wochen generieren. Dann:

```sh
GHQ_URL=http://127.0.0.1:3999 GHQ_PASSWORT=… node scripts/readme/screenshots.mjs
```

Das Skript speichert 17 Aufnahmen; mit `GHQ_NUR=mobile-plan,desktop-plan` nur ausgewählte.
Das Seed-Skript schreibt nur in lokale Datenbanken und bricht bei jedem anderen Host ab.

## Weitere Dokumentation

| Dokument | Inhalt |
| --- | --- |
| [ARCHITEKTUR.md](docs/ARCHITEKTUR.md) | Datenfluss, Python-Hosting und Sync-Strategie |
| [ENGINE.md](docs/ENGINE.md) | Formeln der Analyse-Engine |
| [EP-UND-TAPER.md](docs/EP-UND-TAPER.md) | EP-Termin, Taper-Regeln pro Tag und EP-Checkliste |
| [SCHLAF.md](docs/SCHLAF.md) | Schlaf-Datenmodell, Sync, Backfill, Analyse-Regeln und Ansichten |
| [GARMIN-DATENFORMAT.md](docs/GARMIN-DATENFORMAT.md) | Felder, Zeitformate und Auflösungen der Garmin-Schlafantworten |
| [ANNAHMEN.md](docs/ANNAHMEN.md) | Dokumentierte Annahmen und bewusst kurze Zeitfenster |
| [instructions.md](instructions.md) | Ursprüngliche Spezifikation des Projekts |
| [CLAUDE.md](CLAUDE.md) | Befehle, Konventionen und Hinweise für die Weiterentwicklung |

## Bekannte Grenzen

- **Inoffizielle API.** Ändert Garmin Endpunkte oder Login, kann der Sync ausfallen, bis die Bibliotheken nachziehen. Für Courses dient GPX-Export als Ausweichweg.
- **Single User.** Ein Konto, ein Passwort, keine Mandantentrennung.
- **Bridge lokal nur mit Vercel CLI.** `pnpm dev` startet die Python-Bridge nicht.
- **Schätzungen.** Muskelmodell, Notenprognose und Schlafwerte sind Modelle bzw. Uhr-Schätzungen, keine Messungen oder Diagnosen.
- **Kraft-Workouts.** Das Garmin-Workout-Format bildet nicht jede Satzstruktur ab; Übungen landen als beschriftete Schritte auf der Uhr.
- **Hellmodus.** Die App ist Dark-first; die Farben für den Hellmodus existieren, ein Umschalter in der Oberfläche fehlt.
- **Vercel Hobby.** Function-Laufzeit 60 Sekunden, höchstens 12 Functions, nur tägliche Crons.

Garmin Hub ist ein unabhängiges, privates Projekt ohne Verbindung zu Garmin Ltd. oder
zur Schweizer Armee. „Garmin" und „Forerunner" sind Marken der Garmin Ltd.
