# Schlaf: Daten, Analyse und Ansichten

Datenmodell, Sync und Backfill, Analyse-Regeln, Dashboard-Kachel und Detailansicht.

## Schlaf: Datenmodell, Sync und Backfill

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

## Schlaf-Detailansicht (`/schlaf/<datum>`)

Datum = Aufwachdatum. Navigation: vorherige/nächste Nacht (Pfeile, ≥ 44 px)
und Datumsauswahl; die Zukunft ist gesperrt. Die Seite lädt die Daten
clientseitig über `GET /api/schlaf/<datum>`; jede Karte hat ihr eigenes
Skeleton und ihren eigenen Leerzustand. Reihenfolge: Kopf (Bettzeit, Dauer,
Effizienz, Garmin-Score mit Ampel, Regel-Bewertung, Fazit) · Hypnogramm
(Stufen, Tief unten, Wach oben markiert) · Phasenverteilung (Minuten, %,
Richtwert, Ø 30 Tage) · Herzfrequenz (Min/Max markiert, Phasenhintergrund) ·
SpO2 (Linien bei 92/90 %, Minimum, Zeit unter den Schwellen, Warnhinweis) ·
Atemfrequenz (Verlauf mit Phasenhintergrund, Balken je Schlafphase) · HRV
(Band laut Garmin) · Stress · Body Battery · Bewegung und unruhige Momente ·
Vergleich 7/30 Tage · Analyse (Zusammenfassung, Auffälligkeiten, „Was das für
Training und EP bedeutet", Regel-Bewertung) · Datenqualität · Hinweis
„Uhr-Schätzungen, keine medizinische Messung".

Alle Zeit-Charts liegen auf demselben Minutenraster über die Bettzeit
(`lib/engine/schlaf-raster.ts`, getestet) und teilen `syncId="schlaf"`.
Echte Lücken werden nicht überbrückt (Segmente statt Interpolation). Geprüft
mit Playwright auf 390 px Breite in Dunkel- und Hellmodus (kein horizontales
Scrollen), mit echten Nächten mit und ohne SpO2 und mit einem Datum ohne Daten.

Hinweis zum Hellmodus: Die App ist Dark-first; `.light` existiert als
Token-Override in `app/globals.css`, einen Umschalter gibt es nicht. Geprüft
wurde der Hellmodus durch Setzen der Klasse `light` auf `<html>`.
