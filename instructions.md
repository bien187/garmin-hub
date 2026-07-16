# PROMPT FÜR CLAUDE CODE — Projekt „GRENADIER HQ"

## 1. Auftrag & Kontext

Baue eine vollständige, produktionsreife **Single-User-Trainings-Webapp** für mich (Ben, 19, 185 cm, 88 kg, Lenzburg AG, Schweiz). Die App synchronisiert **alle meine Garmin-Daten** über die **inoffizielle Garmin-Connect-API** (Login mit meinen normalen Garmin-Zugangsdaten — ich habe KEINEN Zugang zum offiziellen Garmin Developer Program), wertet sie mit einer **regelbasierten sportwissenschaftlichen Engine** aus (keine LLM-Aufrufe, keine laufenden KI-Kosten) und bereitet mich gezielt auf die **Eignungsprüfung (EP) der Schweizer Armee-Grenadiere Mitte November 2026** vor (heute ist der 16. Juli 2026, es bleiben ca. 17–18 Wochen).

Die App muss Dinge können, die Garmin Connect selbst nicht bietet. Nutzerkritik an Garmin Connect (Foren/Reviews), die diese App explizit adressieren soll: wichtige Daten sind seit dem v5-Redesign hinter Kacheln versteckt statt auf einen Blick sichtbar; es gibt keine Korrelations-Analysen zwischen Metriken (z. B. Schlaf → Laufleistung); keine muskelgruppen-genaue Erschöpfungsansicht über Kraft- UND Ausdauertraining hinweg; keinen Strava-artigen 3D-Flyover; keine adaptiven Pläne für ein konkretes Prüfungsziel. Genau das baust du.

**Meine Hardware:** Garmin Forerunner 265 Music (unterstützt strukturierte Workouts, Courses/Navigation, HRV-Status, Training Readiness, Body Battery, Kraft-Training mit Übungserkennung).

**Deployment:** Vercel (Hobby-Plan, alles muss im Free Tier bleiben). Datenbank und alle externen Dienste ebenfalls kostenlos.

---

## 2. Verbindlicher Tech-Stack

| Ebene | Technologie | Begründung |
|---|---|---|
| Framework | **Next.js 15 (App Router, TypeScript)** | Ein Deployment auf Vercel, Server Components für schnelle Mobile-Ladezeiten |
| UI | **Tailwind CSS + shadcn/ui + lucide-react** | Schnell, konsistent, mobile-first |
| Charts | **Recharts** | Alle Diagramme (Fitness-Kurven, Höhenprofile, Korrelationen) |
| Karten | **MapLibre GL JS** (kein Mapbox! keine Kosten, kein Token) | 3D-Terrain + Flyover + Routen-Builder |
| Basemap-Tiles | **OpenFreeMap** (`https://tiles.openfreemap.org/styles/liberty`) — gratis, kein API-Key | |
| Höhendaten (3D) | **AWS Terrain Tiles (Terrarium)**: `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png` — gratis, kein Key | raster-dem-Source für `setTerrain` + Hillshade |
| Routing (Routen-Builder) | **BRouter Web-API** (`https://brouter.de/brouter?...`) — gratis, liefert GeoJSON inkl. Höhenprofil | Profile `trekking`/`hiking` für Laufrouten |
| Datenbank | **Supabase (Postgres, Free Tier)** mit **Drizzle ORM** | Persistenz aller Garmin-Daten + Token-Cache |
| Garmin-Zugriff | **Python-Serverless-Functions auf Vercel** mit den Libraries **`garminconnect`** + **`garth`** | Die einzigen zuverlässigen inoffiziellen Clients; garth verwaltet die OAuth1/OAuth2-Token |
| Animation | **framer-motion** (sparsam) + `requestAnimationFrame` für den Karten-Flyover | |
| PWA | Web-App-Manifest + Service Worker (installierbar auf dem Handy) | |
| App-Login | Simple Passwort-Middleware (Passwort aus ENV, signiertes HttpOnly-Cookie via `jose`) — Single User, kein NextAuth-Overhead | |

**Falls das Mischen von Next.js und Python-Functions in einem Vercel-Projekt Probleme macht:** lagere die Python-Seite als eigenständiges FastAPI-Projekt in `/apps/garmin-bridge` aus und deploye es als zweites (ebenfalls kostenloses) Vercel-Projekt; die Next.js-App spricht es über eine interne, mit einem Shared Secret (Header `x-internal-key`) geschützte REST-Schnittstelle an. Entscheide pragmatisch, aber dokumentiere die Entscheidung im README.

---

## 3. Architektur & Datenfluss

```
Garmin-Uhr (FR 265) ──BT──> Garmin Connect Cloud
                                   │
                    (inoffizielle API, garth-Token)
                                   ▼
        Python Functions (/api/garmin/*)  ← Vercel Cron (1×/Tag) + manueller „Sync"-Button
                                   │  schreibt
                                   ▼
                        Supabase Postgres (Rohdaten + berechnete Metriken)
                                   │  liest
                                   ▼
                Next.js Server Components / Route Handlers (Analyse-Engine in TypeScript)
                                   │
                                   ▼
                          PWA-Frontend (Handy zuerst)
```

**Grundprinzip:** Die Webapp rendert NIE direkt gegen die Garmin-API. Alles läuft über die eigene Datenbank. Nur drei Aktionen sprechen live mit Garmin: (1) Sync, (2) Workout auf die Uhr pushen, (3) Course/Route auf die Uhr pushen.

### 3.1 Garmin-Integration (inoffiziell) — konkrete Vorgaben

- Login mit `GARMIN_EMAIL` / `GARMIN_PASSWORD` aus Vercel-ENV-Variablen. Beim ersten Login erzeugt `garth` OAuth-Token (gültig ~1 Jahr); **serialisiere diese Token (garth `dumps`/`loads`) und speichere sie verschlüsselt in der Tabelle `garmin_tokens`**, damit nicht bei jedem Cold Start neu eingeloggt wird (zu häufige Logins triggern Garmin-Rate-Limits/Captchas!). MFA-Fall: Baue eine kleine Setup-Seite `/settings/garmin`, auf der ich einen MFA-Code eingeben kann, falls garth ihn verlangt.
- Nutze die High-Level-Methoden von `garminconnect` wo vorhanden (`get_activities`, `get_sleep_data`, `get_rhr_day`, `get_hrv_data`, `get_body_battery`, `get_training_readiness`, `get_training_status`, `get_stats`, `get_steps_data`, `get_activity_splits`, `get_activity_exercise_sets` für Krafttrainings-Sätze). Wo Methoden fehlen, rufe die Connect-Endpoints direkt über `garth.connectapi(...)` auf, insbesondere:
  - `GET /activity-service/activity/{id}/details` → Zeitreihen-Streams (GPS, HR, Pace, Höhe, Kadenz) für den 3D-Flyover
  - `POST /workout-service/workout` → strukturiertes Workout anlegen
  - `POST /workout-service/schedule/{workoutId}` mit Datum → Workout in den Kalender legen (**so landet es beim nächsten Uhren-Sync automatisch auf der FR 265** — das ist der zuverlässige Push-Weg)
  - `POST /course-service/course` → Course (Route) anlegen; Typ „Laufen", Punkte als Polyline mit Höhenwerten
- **Sync-Strategie (wichtig wegen Vercel-Timeouts):** inkrementell und idempotent. Tabelle `sync_state` merkt sich den letzten synchronisierten Zeitpunkt pro Datentyp. Ein Sync-Lauf holt max. ~30 Aktivitäten bzw. ~30 Tage Health-Daten pro Aufruf und gibt `hasMore: true` zurück; das Frontend ruft dann in einer Schleife weiter auf (Fortschrittsbalken beim Erst-Import der kompletten Historie). `maxDuration` der Functions auf das Hobby-Maximum konfigurieren. Zwischen Garmin-Requests 300–500 ms Pause (Rate-Limit-Schonung).
- **Vercel Cron** (Hobby erlaubt tägliche Crons): `0 5 * * *` → nächtlicher Auto-Sync. Zusätzlich prominenter „Jetzt synchronisieren"-Button mit Pull-to-Refresh-Geste auf Mobile.
- Fehlertoleranz: Garmin-Ausfälle/401 → Token-Refresh versuchen, sonst sauberer Fehlerbanner „Garmin-Login erneuern" statt Crash.
- Lege im README einen deutlichen Hinweis ab: inoffizielle API, Nutzung auf eigenes Risiko, nur für den persönlichen Account.

### 3.2 Datenbank-Schema (Drizzle, Postgres)

Mindestens diese Tabellen (du darfst erweitern):

- `activities` — id (Garmin-ID), typ, start_zeit, dauer_s, distanz_m, hm_auf, hm_ab, avg_hr, max_hr, avg_pace, kalorien, avg_kadenz, trainingseffekt_aerob/anaerob, vo2max_wert, geraet, polyline (encoded), raw jsonb
- `activity_streams` — activity_id, zeitreihen als jsonb-Arrays: lat, lng, ele, hr, pace, kadenz, distanz (für Flyover + Detailanalysen)
- `strength_sets` — activity_id, uebung_name (Garmin-Exercise-Key), saetze, wdh, gewicht_kg, muskelgruppen (abgeleitet, s. Mapping in §6.4)
- `daily_health` — datum, ruhepuls, hrv_letzte_nacht, hrv_status, schlaf_dauer_s, schlaf_score, tiefschlaf_s, rem_s, stress_avg, body_battery_min/max, schritte, training_readiness
- `computed_daily` — datum, trimp_gesamt, ctl, atl, tsb, acwr, lauf_km, hm, effizienz_index (von der Engine nächtlich/nach Sync berechnet, damit das Dashboard ohne Rechenlast lädt)
- `muscle_state` — datum, muskel_id, restbelastung_prozent
- `planned_workouts` — datum, phase, typ, beschreibung, struktur jsonb, garmin_workout_id (null bis gepusht), status (geplant/gepusht/absolviert/verpasst)
- `courses` — name, geojson, distanz_m, hm, garmin_course_id
- `ep_benchmarks` — datum, disziplin, wert (manuell erfasste Testresultate: Klimmzüge, EP-Liegestütze, Rumpfzeiten, 5-km-Lastlauf-Zeit)
- `garmin_tokens`, `sync_state`

---

## 4. Die Eignungsprüfung — fest einprogrammierte Domänen-Daten

Hinterlege die folgenden EP-Daten als typisierte Konstanten in `lib/ep/disziplinen.ts` (inkl. vollständiger Notentabellen als Interpolationsfunktionen `wert → note`):

1. **5-km-Einzellauf** mit 20-kg-Rucksack, Kampfstiefeln, Tarnanzug. Note 5.0 ≤ 30:00 · 4.6 ≈ ≤ 33:00 · 4.0 = 35:01–36:00 · 1.0 > 40:00. **Mein Ziel: ≤ 33 Min.**
2. **Klimmzüge (Ristgriff)**, keine Zeitlimite: 10 = 5.0 · 9 = 4.7 · 8 = 4.5 · 7 = 3.9 (!) · 6 = 3.6 · ≤ 5 = 1.0. Die Skala fällt zwischen 8 und 7 steil ab — die App soll diese „Stolperkante" visuell markieren. **Ziel: 9–10.** (Aktuell: 6–7.)
3. **EP-Liegestütze, 60 s** (Spezialform: Start Bauchlage Hände auf Rücken, oben Handberührung abwechselnd): 35+ = 5.0 · 30 = 4.5 · 20 = 1.0. **Ziel: 30+.**
4. **Seitliche Rumpfkraft, max. 120 s** im Sekundentakt (Metronom 60 bpm): 120 s = 5.0 · 70–74 s = 4.0 · ≤ 45 s = 1.0. **Ziel: 95–110 s.**
5. **Dorsale Rumpfkette, max. 150 s** im Sekundentakt: 150 s = 5.0 · 100–104 s = 4.0 · ≤ 71 s = 1.0. **Ziel: 120–135 s.**

**Bestehenslogik:** Durchschnitt aller 5 Noten ≥ 4.0; eine 1.0 ist praktisch nicht kompensierbar. **Mein Zielschnitt: ≥ 4.5** (für die KSK-Selektion reicht knappes Bestehen nicht). Baue eine Funktion `berechneEpPrognose()`, die aus den letzten `ep_benchmarks` + Trend die aktuelle prognostizierte Note pro Disziplin und den Gesamtschnitt liefert.

**Mein Profil für alle Berechnungen:** Ruhepuls 46 (live aus Garmin überschreiben), HFmax geschätzt 196–198 (Feld editierbar, Max-Puls-Test folgt), Karvonen-Zonen: Z2 = 137–152, Z4 = 168–183, Z5 = 183–198 bpm. 10 km flach in 5:56/km; 10 km / 244 Hm in 6:40/km (GAP 6:17). Schwächen: Lauf-Ökonomie (läuft zu hart), Rumpfkraft auf Zeit, Beine nicht dauerlast-konditioniert (Krampf nach 1000 Hm). Stärken: Grundkraft, starkes Herz, Disziplin. Gym 3×/Woche (Mo Brust/Trizeps, Do Rücken/Bizeps, WE Ganzkörper). Kampfstiefel werden eingelaufen, 20-kg-Gewichtsweste vorhanden (Hinweis in der App: Weste ≠ Rucksack-Mechanik, spätestens Phase 3 mit echtem Rucksack). RS-Start: 18. Januar 2027, Isone.

**Der 4-Phasen-Rahmenplan** (fest hinterlegen, Wochen dynamisch ab heutigem Datum bis Mitte November 2026 berechnen):
- **Phase 1 „Aerobe Basis"** (bis ca. Anfang Aug.): 80 % aller Läufe strikt Z2; 1× Intervalle (Z5), 1× langer Lauf bis 80 Min.; Klimmzüge Do schwer + WE Volumen + Grease the Groove; EP-Liegestütz-Technik 2×/Wo; Rumpf im Sekundentakt 3×/Wo; exzentrische Bein-Konditionierung; Elektrolyte täglich.
- **Phase 2 „Last & Hügel"** (Aug.–Ende Sep.): 1 Lastlauf/Woche, Start 6–8 kg, +2 kg/Woche bis 20 kg; ab Woche 10 Kampfstiefel; Hügel-Intervalle 8–10 × 60–90 s; Klimmzüge mit Zusatzgewicht; Step-ups/Ausfallschritte/Waden mit Weste.
- **Phase 3 „Spezifisch"** (Okt.–Anfang Nov.): Lastläufe nur noch 20 kg Rucksack + Stiefel, 5 km auf Zeit; 2 komplette Probe-EPs (alle 5 Disziplinen an einem Tag in EP-Reihenfolge); Schwachstellen nachschärfen.
- **Phase 4 „Taper"** (letzte ~2 Wochen): Umfang halbieren, Intensität kurz; letzte 3 Tage nur Spazieren/Schlaf/Elektrolyte/Kohlenhydrate. EP ist zweitägig — Taper auf Tag 1 ausrichten.

---

## 5. Die Seiten der App (mobile-first, Bottom-Tab-Navigation)

Fünf Tabs: **Dashboard · Aktivitäten · Karte · Plan · Körper**. Dazu `/settings` (Garmin-Verbindung, Profilwerte, Sync-Log).

### 5.1 Dashboard (`/`)
Alles Wichtige ohne Scrollen-Suchen (bewusster Kontrast zum kachel-überladenen Garmin Connect v5):
- **Kopfzeile:** Countdown „X Wochen, Y Tage bis zur EP" + aktuelle Phase.
- **Readiness-Karte:** Training Readiness, Body Battery, HRV-Status, Schlaf-Score, Ruhepuls von heute — als kompakte Ampel-Zeile mit einem daraus abgeleiteten Satz („Grün: heute ist der harte Tag des Plans machbar" / „Rot: tausche Intervalle gegen Z2").
- **Fitness-Kurve:** CTL/ATL/TSB als Flächen-/Linienchart der letzten 90 Tage (Recharts), TSB-heute prominent.
- **EP-Prognose-Widget:** 5 Disziplinen als horizontale Balken mit aktueller prognostizierter Note, Zielmarke und Note-4.0-Linie; Gesamtschnitt gross.
- **Mini-Body-Map** (verlinkt auf den Körper-Tab), letzte Aktivität, nächstes geplantes Training, Wochen-km/Hm vs. Vorwoche.

### 5.2 Aktivitäten (`/activities`, `/activities/[id]`)
- Liste mit Filter (Typ, Zeitraum), infinite scroll, kompakte Karten mit Mini-Statik-Karte (MapLibre-Canvas-Snapshot oder Polyline-SVG).
- **Detailseite mit 3D-Flyover (das Strava-Feature):**
  - MapLibre-Map mit `terrain` (raster-dem, Terrarium-Tiles, `exaggeration: 1.4`), Hillshade-Layer, Sky/Fog.
  - Route als GeoJSON-Line mit Verlaufsfarbe nach Herzfrequenz oder Pace (umschaltbar).
  - **Flyover-Animation:** Play-Button → Kamera folgt der Strecke. Implementierung: Route mit `@turf/along` in gleichmässige Kamera-Keyframes auflösen, Kamerapfad mit `@turf/bezier-spline` glätten, in `requestAnimationFrame` per `map.setFreeCameraOptions()` Position (leicht hinter/über dem Läuferpunkt, `lookAt` auf den Punkt) setzen; animierter Punkt-Marker + „gezeichnete" Linie (line-gradient mit Fortschritts-Uniform oder Feature-Slicing). Geschwindigkeit 1×/4×/10×, Scrubber-Slider, synchronisierte Live-Anzeige von km, Pace, HR, Höhe aus `activity_streams`.
  - Darunter: Höhenprofil (Recharts Area, Hover synchron mit Kartenmarker), Splits-Tabelle, HR-Zonen-Verteilung, GAP-Pace, Effizienz-Index dieser Einheit, bei Krafttrainings die Satz-Tabelle + welche Muskeln wie stark belastet wurden.

### 5.3 Karte (`/map`) — Routen-Builder wie bei Strava
- Vollbild-MapLibre (gleiche 3D-Terrain-Basis, 2D/3D-Toggle).
- **Klick-basiertes Routing:** Jeder Tap setzt einen Wegpunkt; Routing zwischen Wegpunkten über die BRouter-Web-API (`https://brouter.de/brouter?lonlats=lon1,lat1|lon2,lat2&profile=trekking&alternativeidx=0&format=geojson`) — liefert Geometrie inkl. Höhen. Features: Undo/Redo, Wegpunkt verschieben (neu routen), Rückweg-Button (Route umkehren & anhängen), Rundkurs-Schliessen, Luftlinien-Modus als Fallback.
- Live-Anzeige: Distanz, Hm auf/ab, geschätzte Dauer **auf Basis meiner realen GAP-Pace** (aus der Engine, §6.3) — nicht generisch.
- Höhenprofil-Panel unten (Hover ↔ Kartenmarker).
- **Speichern & auf die Uhr:** Route benennen → als GeoJSON+GPX in `courses` speichern → Button „An Garmin senden" → `POST /course-service/course`; Erfolgsmeldung mit Hinweis „Uhr einmal mit Garmin Connect synchronisieren, dann unter Navigation > Strecken verfügbar". Gespeicherte Routen als Layer einblendbar; Heatmap-Layer aller bisherigen Aktivitäts-Polylines als Inspiration.

### 5.4 Plan (`/plan`) — adaptiver Grenadier-Trainingsplan
- **Wochenansicht** (Mo–So) der aktuellen Phase mit geplanten Einheiten aus `planned_workouts`; abgehakte Einheiten werden automatisch mit der passenden synchronisierten Aktivität gematcht (Typ+Datum+Dauer-Toleranz).
- **Adaptionslogik (regelbasiert, §6.5):** Der Plan wird wöchentlich (So-Abend, Cron) aus Rahmenplan-Phase + tatsächlich Absolviertem + TSB/ACWR + EP-Benchmarks neu generiert. Verpasste Schlüsseleinheit → intelligent umverteilen, nicht stur nachschieben. Readiness rot → Intensitätstausch vorschlagen.
- **Workout-Push:** Jede geplante Lauf-Einheit hat einen Button „Auf die Uhr laden" → baue das Garmin-Workout-JSON (Warmup / Intervalle mit Ziel-HR-Zone oder Ziel-Pace / Cooldown, Wiederholungsblöcke) → `POST /workout-service/workout` + `POST /workout-service/schedule/{id}` aufs Plandatum. Auch Rumpf-/Klimmzug-Einheiten als Kraft-Workouts mit Übungs-/Satzstruktur pushen, wo das Workout-Format es erlaubt; sonst als klare In-App-Anleitung mit **eingebautem 60-bpm-Metronom** (Web Audio API) und Timer für die Rumpfdisziplinen.
- **Workout-Generator „Heute frei Schnauze":** Formular: gewünschte Distanz ODER Dauer, Anstrengung (locker/mittel/hart), Hm ja/nein. Die Engine baut daraus ein Workout mit meinen echten Zonen-Paces (§6.3), zeigt erwarteten TRIMP + Auswirkung auf TSB von morgen („Nach diesem Lauf: TSB −12, morgen Regeneration einplanen") und pusht es auf Wunsch auf die Uhr. Bei „mit Höhenmetern" schlage passende gespeicherte Routen/Hügel-Segmente vor (z. B. meine Goffersberg/Schloss-Lenzburg-Routen, sobald vorhanden).
- **EP-Benchmark-Erfassung:** Schnelleingabe für Testresultate (Klimmzüge, EP-Liegestütze 60 s, seitliche/dorsale Rumpfzeit, 5-km-Lastlauf-Zeit) → speist Prognose & Plan. Probe-EP-Modus: geführter Ablauf aller 5 Disziplinen in EP-Reihenfolge mit Timern/Metronom und Sofort-Benotung.

### 5.5 Körper (`/body`) — Live-Muskelstatus
- **SVG-Körperabbildung von vorne und hinten** (selbst gezeichnet als saubere, moderne Flat-Silhouette; jede Muskelgruppe ein eigener `<path>` mit id): Nacken/Trapez, Schultern, Brust, Bizeps, Trizeps, Unterarme, Bauch, seitlicher Rumpf, unterer Rücken, oberer Rücken/Lat, Gesäss, Quadrizeps, Hamstrings, Adduktoren, Waden, Schienbeine/Fussheber.
- Färbung nach Rest-Erschöpfung (Modell §6.4): Grün (frisch, < 20 %) → Gelb → Orange → Rot (≥ 80 %, nicht voll belastbar), Verlauf über `d3-scale`/interpolierte HSL-Werte. Optik wie die Muskel-Ansicht nach einem Garmin/Strava-Gymtraining, aber als **permanenter Live-Status**.
- Tap auf Muskel → Bottom-Sheet: Erschöpfung in %, „voll belastbar in ~X h", welche Einheiten der letzten 7 Tage wie viel beigetragen haben, Verlaufs-Sparkline.
- Zusatzkarte „Systemische Ermüdung": TSB, ACWR mit Ampel (ACWR > 1.5 = Verletzungswarnung — relevant wegen meiner Krampf-/Dauerlast-Historie), HRV-Trend 7 Tage.

---

## 6. Die regelbasierte Analyse-Engine (`lib/engine/`) — konkrete Formeln

Reines TypeScript, deterministisch, unit-getestet (Vitest). Keine LLM-Calls.

### 6.1 Belastung & Fitness
- **TRIMP pro Einheit (Banister, männlich):** `TRIMP = Dauer_min × HRr × 0.64 × e^(1.92 × HRr)` mit `HRr = (HRavg − HRruhe) / (HRmax − HRruhe)`. Für Krafttrainings ohne brauchbare HR: Session-RPE-Fallback (Dauer × geschätzte Intensität aus Volumen).
- **CTL** = exponentiell gewichteter TRIMP-Schnitt, Zeitkonstante 42 Tage; **ATL** = 7 Tage; **TSB = CTL − ATL**. Interpretation im UI: TSB > +10 frisch/Taper, −10…+5 produktiv, < −20 Warnung.
- **ACWR** = Last der letzten 7 Tage / Ø-Wochenlast der letzten 28 Tage; Sweet Spot 0.8–1.3, > 1.5 rote Warnung.

### 6.2 Ökonomie & Herz-Kreislauf (meine grösste Schwäche → prominent!)
- **Effizienz-Index (EF)** = Geschwindigkeit (m/min) / Ø-HR, nur für Läufe > 20 min mit < 50 Hm; als Trendlinie über Wochen — DER Fortschrittsindikator für die aerobe Basis.
- **Aerobe Entkopplung (Pw:HR)** = (EF 1. Hälfte − EF 2. Hälfte) / EF 1. Hälfte; < 5 % = solide Basis. Pro Longrun ausweisen.
- **Z2-Disziplin-Score:** Anteil der Zeit in 137–152 bpm bei als „locker" geplanten Läufen; „Du bist wieder zu hart gelaufen"-Hinweis, wenn > 25 % der Zeit über Z2.

### 6.3 Leistungsmodelle
- **GAP (Grade Adjusted Pace):** pro Stream-Segment Steigung berechnen, Energiekosten nach Minetti-Polynom (Laufkosten `C(i) = 155.4i⁵ − 30.4i⁴ − 43.3i³ + 46.3i² + 19.5i + 3.6` J/kg/m, i = Steigung) auf Flachäquivalent normieren.
- **Renn-/Zeitprognose (Riegel):** `T2 = T1 × (D2/D1)^1.06` aus den besten Efforts der letzten 6 Wochen (Best-Effort-Erkennung über rollende Fenster in den Streams: schnellste 1/5/10 km).
- **Lastlauf-Prognose:** empirischer Zuschlag auf die 5-km-GAP-Prognose von ~7–10 s/km pro 10 kg Zusatzlast + Stiefel-Malus; kalibriere den Faktor automatisch, sobald echte Lastläufe (Phase 2) in den Daten sind (Regression Zusatzgewicht ↔ Pace-Differenz). Daraus die live prognostizierte EP-Lauf-Note.
- **Trainings-Paces:** aus aktueller Prognose Z2-, Schwellen-, Intervall-Pace ableiten (Daniels-ähnliche Abstufung) — diese Paces nutzt der Workout-Generator.

### 6.4 Muskel-Erschöpfungsmodell
- Jede Einheit erzeugt Last `L` pro Muskelgruppe: Krafttraining über ein festes Mapping Garmin-Exercise-Key → Muskelgruppen (Haupt 1.0 / Neben 0.4), skaliert mit Volumen (Sätze × Wdh × Gewicht relativ zu meinen Bestwerten). Läufe belasten Waden/Quadrizeps/Hamstrings/Gesäss/Hüftbeuger gewichtet nach TRIMP, Hm-Anteil verschiebt Richtung Waden+Gesäss (bergauf) bzw. Quadrizeps (bergab exzentrisch); Lastläufe zusätzlich Trapez/unterer Rücken/Rumpf.
- **Erholung:** exponentieller Abbau `Rest(t) = Σ Lᵢ × e^(−Δtᵢ/τ)` mit muskelspezifischem τ (Waden ~30 h, kleine Oberkörpermuskeln ~36 h, grosse Gruppen Quadrizeps/Rücken/Brust ~48 h, nach sehr hoher Einzellast τ × 1.3). Normiere auf 0–100 %. Täglich in `muscle_state` materialisieren.
- Das Modell ist eine Heuristik — kennzeichne es im UI dezent als Schätzung, aber mach es nützlich: der Plan-Generator meidet harte Einheiten für Muskelgruppen ≥ 60 % Rest-Erschöpfung.

### 6.5 Plan-Generator & Empfehlungen (Regelwerk)
Wöchentliche Generierung als reine Funktion `(phase, restwochen, letzte28Tage, tsb, acwr, muscleState, epBenchmarks, readiness) → Wochenplan`. Kernregeln: Phasenvorgaben aus §4 sind das Skelett; Umfangssteigerung max. +10 %/Woche; jede 4. Woche Entlastung (−30 %); harte Läufe nie an Beintagen-Folgetagen mit Quadrizeps/Waden ≥ 60 %; Klimmzug-Progression Richtung 9–10 (Grease the Groove täglich, wenn Oberkörper < 40 % erschöpft); Rumpf 3×/Wo mit Sekundentakt-Zielzeiten, die linear Richtung EP-Ziel interpolieren; ACWR > 1.3 → nächste Woche deckeln; TSB < −20 → Extra-Ruhetag. Tipps-Sektion („Insights") generiert Sätze aus Regel-Treffern, z. B.: „Deine EF ist in 3 Wochen um 4 % gestiegen — die Z2-Basis wirkt", „Schlaf < 7 h korreliert bei dir mit −6 % Intervall-Pace (letzte 8 Wochen, r = …)", „Elektrolyt-Reminder: morgen langer Hügellauf" (Krampf-Historie!).

### 6.6 Korrelations-Insights (was Garmin nicht zeigt)
Seite/Sektion „Insights": Pearson-Korrelationen über die letzten 60–90 Tage zwischen Paaren wie Schlafdauer/Schlafscore ↔ EF des Folgetags, HRV ↔ subjektiv harte Einheiten, Wochen-Hm ↔ Waden-Erschöpfung, Ruhepuls-Trend ↔ CTL. Nur Korrelationen mit |r| ≥ 0.3 und n ≥ 15 anzeigen, als verständliche Karten mit Scatter-Mini-Plot. Klar als Korrelation (nicht Kausalität) labeln.

---

## 7. Design-Vorgaben

- **Mobile-first ist Pflicht**, Desktop bekommt ein grosszügigeres Grid (Dashboard 2–3 Spalten). Bottom-Tab-Bar auf Mobile, Sidebar auf Desktop. Touch-Ziele ≥ 44 px, Karten-Gesten dürfen nicht mit Seiten-Scroll kollidieren.
- **Dark-first** (Training oft früh/spät), Light-Mode optional. Kein generisches Template-Look: entwickle eine eigene, disziplinierte Identität passend zum Thema „Schweizer Gebirgs-/Militär-Präzision" — z. B. tiefes Anthrazit/Nachtblau als Basis, EINE markante Akzentfarbe (etwa ein kühles Signal-Grün oder Bergsee-Türkis für Zonen/Fortschritt) plus Ampelfarben nur für Status; präzise Typo (charaktervolle Display-Schrift für Zahlen/Countdown, klare Sans für Text, Mono für Messwerte). Das Signatur-Element der App ist der **EP-Countdown + Notenprognose** — inszeniere ihn.
- Zahlen zuerst: grosse, sofort lesbare Metriken; Skeleton-Loader; framer-motion nur für sinnvolle Momente (Flyover-Start, Notenänderung). `prefers-reduced-motion` respektieren.
- **PWA:** Manifest (Name, Icons, standalone), Service Worker mit Cache für App-Shell + letzte Dashboard-Daten (offline lesbar), installierbar auf iOS/Android.
- Sprache der UI: Deutsch (Schweiz, „ss" statt „ß").

## 8. Sicherheit & Konfiguration

- ENV: `GARMIN_EMAIL`, `GARMIN_PASSWORD`, `APP_PASSWORD`, `SESSION_SECRET`, `INTERNAL_API_KEY`, `DATABASE_URL`, `TOKEN_ENC_KEY` (AES-GCM-Verschlüsselung der garth-Token in der DB).
- Next.js-Middleware schützt ALLE Routen ausser `/login`; Login = Passwortfeld → signiertes HttpOnly-Cookie (30 Tage). Python-Functions akzeptieren nur Requests mit `INTERNAL_API_KEY`.
- Keine Garmin-Daten an Dritte; alle Karten-/Routing-Requests laufen direkt vom Client zu den freien Diensten (keine Keys nötig).

## 9. Vorgehen & Meilensteine (in dieser Reihenfolge bauen, jeweils lauffähig committen)

1. **Scaffolding:** Next.js 15 + Tailwind + shadcn + Drizzle + Supabase-Schema + Login-Middleware + Tab-Layout (leere Seiten).
2. **Garmin-Bridge:** Python-Functions, garth-Token-Persistenz, inkrementeller Sync (Aktivitäten + Health) mit Fortschritts-UI, Cron. → Erst-Import meiner kompletten Historie muss durchlaufen.
3. **Dashboard v1:** Readiness, Fitness-Kurve (Engine 6.1), Wochenüberblick.
4. **Aktivitäten:** Liste + Detailseite mit 3D-Karte, Streams-Charts; dann Flyover-Animation.
5. **Engine-Ausbau:** EF, Entkopplung, GAP, Riegel, Trainings-Paces + Insights-Karten.
6. **Körper-Tab:** SVG-Body-Map + Erschöpfungsmodell.
7. **Karte:** Routen-Builder + BRouter + GPX + Course-Push auf die Uhr.
8. **Plan:** EP-Modul, Benchmarks, Wochenplan-Generator, Workout-Builder + Push auf die Uhr, Metronom/Probe-EP-Modus.
9. **PWA + Feinschliff:** Offline-Shell, Performance (LCP mobil < 2.5 s), Empty-States, Fehlerzustände, README (Setup, ENV, Risiken der inoffiziellen API).

## 10. Qualitätskriterien (Definition of Done)

- Läuft komplett im Free Tier (Vercel Hobby, Supabase Free, OpenFreeMap, AWS Terrain Tiles, BRouter) — keinerlei bezahlte Keys.
- Voller Erst-Sync und täglicher Auto-Sync funktionieren robust trotz Function-Timeouts (Chunking nachweislich getestet).
- Ein von der App erstelltes Lauf-Workout und eine erstellte Route erscheinen nach Uhren-Sync tatsächlich auf der Forerunner 265.
- Flyover läuft auf einem Mittelklasse-Smartphone flüssig (ggf. Punktdichte adaptiv reduzieren).
- Engine-Funktionen (TRIMP, CTL/ATL/TSB, GAP, Riegel, Notentabellen-Interpolation, Erschöpfungsabbau) mit Vitest-Tests abgedeckt.
- Alle fünf EP-Disziplinen inkl. Notentabellen korrekt hinterlegt; Prognose reagiert sichtbar auf neue Benchmark-Einträge.
- Kein Layout-Bruch zwischen iPhone-Breite (~390 px) und Desktop; Lighthouse Mobile ≥ 90 (Performance/Best Practices).

Stelle mir vor Beginn nur dann Rückfragen, wenn etwas technisch blockierend ist — sonst triff sinnvolle Annahmen, dokumentiere sie im README und leg los.
