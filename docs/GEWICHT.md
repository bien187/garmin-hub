# Smart Weight Tracking (Garmin Index S2)

Wägungen der Garmin-Index-S2-Waage (und manuelle Einträge in Garmin Connect)
werden automatisch synchronisiert und auf der Körper-Seite unter
**Smart Weight Tracking** (`/body#gewicht`) ausgewertet. Ziel ist ein fairer
Blick auf die langfristige Entwicklung — nicht möglichst tiefe Werte.

## Daten und Sync

- **Quelle:** `garminconnect` 0.2.25, Methode `get_weigh_ins(start, ende)` →
  `GET /weight-service/weight/range/{start}/{ende}?includeAll=true`. Die
  Bibliothek dokumentiert daneben `get_daily_weigh_ins(datum)` (Tagesansicht,
  `dateWeightList` mit `samplePk`) und `get_body_composition(start, ende)`.
  Eine offizielle Garmin-API für private Konten gibt es nicht; es gilt
  dasselbe Risiko wie für den übrigen Sync.
- **Sync-Typ `gewicht`** in der bestehenden Bridge (`sync_gewicht` in
  `api/_lib/sync_logic.py`, keine neue Function): pro Sync-Lauf einmal die
  letzten 14 Tage, danach rückwärts ein Backfill in 90-Tage-Blöcken bis
  heute − 5 Jahre (höchstens 6 Blöcke pro Aufruf, Cursor in
  `sync_state.gewicht`). Läuft im Sync-Knopf und im täglichen Cron.
- **Speicherung:** Tabelle `gewicht_messungen`, eine Zeile pro Wägung mit der
  Garmin-ID `samplePk` als Schlüssel — mehrere Messungen pro Tag bleiben
  getrennt. Exakter Zeitpunkt (`timestampGMT`, ersatzweise `date` als Zürcher
  Ortszeit), Kalendertag (`calendarDate`), Gewicht, BMI, Körperfett,
  Körperwasser, Skelettmuskel- und Knochenmasse, viszerales Fett,
  Stoffwechselalter, Physique-Rating, Quelle (`sourceType`). Garmin liefert
  Massen in Gramm; gespeichert wird kg. Die unveränderte Garmin-Antwort zur
  Messung liegt in `raw`. Messungen werden nie gelöscht.
- **Messprotokoll:** Tabelle `gewicht_bedingungen` (eine Zeile pro Messung,
  nur von der App geschrieben, nie vom Sync): nüchtern, vor dem Frühstück,
  nach dem Toilettengang, Minuten seit Mahlzeit, Trinken und Training,
  Bad/Sauna. `null` = keine Angabe.
- **Migration:** `drizzle/0003_gewicht.sql` (rein additiv, idempotent). Bis
  sie angewendet ist, zeigt die Körper-Seite einen Hinweis und der Sync
  meldet „Gewichts-Tabellen fehlen"; alles andere läuft weiter.
- **Feldnamen prüfen:** Der Parser (`_gewicht_eintraege`, `_gewicht_zeile`)
  akzeptiert die Range-Antwort (`dailyWeightSummaries[].allWeightMetrics`),
  die Tagesansicht (`dateWeightList`) und blanke Listen. Mit
  `python scripts/garmin/dump_gewicht.py` lassen sich echte Antworten als
  Fixture sichern (Personendaten entfernt, Werte nicht ausgeben). Offline-Test:
  `python3 scripts/garmin/test_gewicht_sync.py`.
- **Datenschutz:** Gewichtswerte erscheinen weder in Logs noch in
  Fehlermeldungen.

## Messqualitäts-Score (0–100)

Beschreibt, wie gut eine Messung mit standardisierten Bedingungen vergleichbar
ist — **kein** medizinischer Genauigkeitswert (`bewerteMessung` in
`lib/engine/gewicht.ts`).

| Kriterium | Punkte | Herkunft |
| --- | ---: | --- |
| Morgens zwischen 05:00 und 10:00 Uhr | 15 | Zeitstempel |
| Nüchtern | 25 | Angabe |
| Vor dem Frühstück | 10 | Angabe (oder aus «nüchtern» abgeleitet) |
| Nach dem Toilettengang | 10 | Angabe |
| ≥ 2 h nach der letzten Mahlzeit | 10 | Angabe (oder aus «nüchtern» abgeleitet) |
| ≥ 2 h nach dem Trinken | 10 | Angabe |
| ≥ 2 h nach Sport, Bad oder Sauna | 10 | Garmin-Aktivitäten, Angabe überschreibt |
| Ähnliche Messzeit wie die Referenzmessungen | 10 | eigene Historie |

Regeln:

- Fehlende Angaben zählen nie als erfüllt; die Uhrzeit allein beweist nicht,
  dass jemand nüchtern war.
- Widersprüche entwerten die Angaben: «nüchtern», aber nach dem Frühstück
  oder < 2 h nach dem Essen → keine Punkte für «nüchtern», Hinweis.
- Garmins Empfehlung (nach Essen, Trinken, Sport, Baden oder Sauna 2 h
  warten) steckt in den Kriterien. Training wird automatisch aus den
  Garmin-Aktivitäten erkannt und nicht abgefragt; ohne jede synchronisierte
  Aktivität bleibt es „unbekannt".
- Übliche Messzeit = Median der Uhrzeiten früherer trendtauglicher Messungen
  der letzten 60 Tage (mindestens 3), ±60 Min. Nur Messungen *vor* der
  bewerteten zählen.
- Klassen: 85–100 sehr gut, 70–84 gut, 45–69 eingeschränkt, 0–44 gering
  vergleichbar. Zusätzlich ein Datenstatus (vollständig, teilweise, keine
  Angaben) mit der Liste der fehlenden Angaben.

## Standardisierter Trend

Zwei getrennte Ebenen:

- **Rohmessungen:** alle Garmin-Werte unverändert als Punkte, gefärbt nach
  Messqualität.
- **Trend:** pro Kalendertag die vergleichbarste *trendtaugliche* Messung
  (höchster Score, bei Gleichstand die morgendliche, dann die frühere), daraus
  ein **gleitender 7-Tage-Median** — nur an Tagen mit eigenem Tageswert und mit
  mindestens 3 Tageswerten im Fenster. Fehlende Tage werden nicht aufgefüllt;
  Lücken über 7 Tage unterbrechen die Linie. Zusätzlich ein 30-Tage-Median
  (mindestens 10 Tageswerte).
- **Trendtauglich** ist eine Messung mit Score ≥ 45 oder eine Morgenmessung
  ohne Gegenanzeige (nicht ausdrücklich nicht nüchtern, nicht nach dem
  Frühstück, nicht < 2 h nach Essen, Trinken, Sport oder Sauna, kein
  Widerspruch). Andere Messungen bleiben sichtbar, fliessen aber nicht ein.
- **Keine Kilogramm-Korrektur:** Es wird nie ein fester Wert abgezogen
  (z. B. für Abendmessungen); keine Faktoren für Essen, Trinken oder Training.

## Auswertung und Oberfläche

- Kennzahlen: aktuelles Gewicht, Trend, Veränderung über 7 und 30 Tage (aus
  dem Trend), tiefstes und höchstes Gewicht im Zeitraum, Veränderung im
  Zeitraum und gegenüber dem gleich langen Zeitraum davor, Ø Messqualität,
  Anzahl Messungen.
- Diagramm: Zeitfilter 7 T · 30 T · 90 T · 6 M · 1 J · Alles; Rohmessungen,
  7-Tage-Trend und 30-Tage-Trend einzeln ein- und ausblendbar; Tooltip mit
  Datum, Uhrzeit, kg, Bedingungen und Score.
- Messliste: Tippen öffnet das Messprotokoll „Wie war deine Messung?" mit
  Live-Vorschau des Scores. Zeitpunkt und Tageszeit stammen aus der Messung,
  der Trainingsabstand aus Garmin.
- Körperzusammensetzung (Körperfett, Muskelmasse, Körperwasser, BMI) getrennt
  vom Gewicht, mit derselben Tageswahl und 7-Tage-Median. Bioimpedanz reagiert
  auf Flüssigkeitshaushalt und Messbedingungen — der Hinweis steht unter den
  Diagrammen.
- Dashboard-Abschnitt „Gewicht": aktuelles Gewicht mit Tag der letzten Messung,
  Trend (7-Tage-Median), Veränderung über 30 Tage und ab Tablet-Breite eine
  Mini-Trendlinie; „Körper ›" führt zu `/body#gewicht`.
