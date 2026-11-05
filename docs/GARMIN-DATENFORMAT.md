# Garmin-Datenformat (Schlaf)

Aus echten Antworten abgeleitete Feldnamen, Zeitformate und Auflösungen.

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
