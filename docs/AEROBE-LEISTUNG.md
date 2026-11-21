# Aerobic Performance

„Wie entwickelt sich meine Laufgeschwindigkeit bei vergleichbarer aerober
Belastung?" — Nachfolger der früheren Kurve „Pace bei Puls" auf der
Entwicklung-Seite des Dashboards.

Code: [`lib/engine/aerobe-abschnitte.ts`](../lib/engine/aerobe-abschnitte.ts)
(Abschnitte je Lauf), [`lib/engine/aerobe-leistung.ts`](../lib/engine/aerobe-leistung.ts)
(Modell, Normierung, Trend), [`lib/server/aerob-service.ts`](../lib/server/aerob-service.ts)
(Cache und Backfill), [`components/dashboard/aerob-chart.tsx`](../components/dashboard/aerob-chart.tsx)
(Diagramm). Tests: `lib/engine/__tests__/aerobe-*.test.ts`.

## 1. Die bisherige Berechnung und warum sie Lücken hatte

| Frage | Bisher |
| --- | --- |
| Wie wurde gerechnet? | `medianPaceBeiHr` (`lib/engine/pace-bei-hr.ts`): Puls über 20 s geglättet, nur Sekunden mit geglättetem Puls im Fenster **Referenz ± 3 bpm**, mindestens 5 Minuten insgesamt; Ergebnis ist der zeitgewichtete Median der höhenkorrigierten Pace dieser Sekunden. |
| Warum 148 bpm? | Nicht fest im Code: `referenzPulsAusLaeufen` nahm das 35. Perzentil des Durchschnittspulses aller Läufe ab 20 Minuten, auf 4 bpm gerundet und auf Zone 2–3 begrenzt. Weil die Historie viele Läufe mit 143–167 bpm enthält (auch Tempo und Intervalle), landete der Wert bei 148 bpm. |
| Welche Läufe? | Alle Läufe ab 1.5 km mit Zeitreihen der letzten 120 Tage (400 Tage nach einem Wechsel des Referenzpulses). Keine Regel schloss Zone-2-Läufe aus. |
| Puls und Pace synchron? | Ja, beide aus demselben Messpunkt der Garmin-Zeitreihe (je nach Dauer 1–4 s Abstand), ohne Ausgleich der Pulsverzögerung. |
| Wochenwerte? | `fortschrittBisHeute`: je Woche Mo–So der zeitgewichtete Median der Tageswerte. |
| Fehlende Werte? | `null` → die Linie bricht ab (`connectNulls={false}`). |
| Zone 2 ausgeschlossen? | Nicht per Regel, aber faktisch: Läufe mit 135–140 bpm erreichen das Fenster 145–151 bpm nie fünf Minuten lang. |
| Höhenmeter? | GAP (Minetti) je Messpunkt aus einer über fünf Punkte geglätteten Höhe. Fehlte das Höhenprofil, wurde still die rohe Pace verwendet. |
| Messpunkte im Diagramm? | Ein Punkt je Woche. |

**Ursache der Lücken:** Das schmale Pulsfenster um einen einzigen Referenzpuls
(148 ± 3 bpm), das die lockeren Läufe (135–140 bpm) nie erreichen, zusammen mit
der Wochenaggregation ohne Übertrag: Jede Woche ohne einen Lauf, der zufällig
fünf Minuten bei 145–151 bpm lag, wurde zur Lücke. Intervall- und Tempoläufe
lieferten nur Werte, wenn der Puls beim Übergang lange genug durch das Fenster
lief — gemischt aus Belastung und Erholung.

## 2. Die neue Methode

### Gleichmässige Abschnitte je Lauf

Jeder Lauf wird einmal aus seinen Originalzeitreihen analysiert
(`analysiereLauf`). Gesucht werden **5-Minuten-Abschnitte** (rollierende Fenster,
30 s Vorschub, nicht überlappend), die stabil sind:

- 30-s-Pulsmittel schwanken um höchstens 8 bpm,
- 30-s-Geschwindigkeiten schwanken um höchstens 7 % (Variationskoeffizient),
- mindestens 90 % der Zeit mit gültigem Puls (60–220 bpm),
- höchstens 30 s Pause im Fenster.

Verworfen werden Stehen und Gehen (< 1.6 m/s), Aufzeichnungslücken (> 30 s),
GPS-Sprünge (rückwärts, > 7 m/s oder mehr als 1.6-mal so schnell wie die
Nachbarschaft), die ersten 8 Minuten Bewegungszeit (Aufwärmen, Pulsverzögerung)
und die letzten 2 Minuten (Auslaufen). Intervalle ergeben deshalb keine
Abschnitte; der Durchschnitt einer ganzen Einheit wird nie verwendet.

Die Geschwindigkeit ist **höhenkorrigiert** (GAP nach Minetti, wie in der
Aktivitätsanalyse). Die Steigung kommt aus ±20 m Strecke statt aus einzelnen
Punkten, damit Höhenrauschen den Faktor nicht aufbläht. Läufe ohne
Höhenprofil zählen nur, wenn die Aktivität höchstens 10 Hm/km hat, und sind
markiert; sonst gelten sie als „ohne Höhendaten" und fehlen in der Auswertung.

Gespeichert werden je Lauf nur die Abschnitte `[Puls, Geschwindigkeit, Dauer]`,
die Pulsverteilung der Bewegungszeit (2-bpm-Klassen) und der Wert der
bisherigen Methode für den Vergleich.

### Individuelles Modell

Aus allen Abschnitten rund um ein Datum (±9 Wochen, notfalls ±20 Wochen) wird
eine **robuste Regression** gerechnet (Huber-gewichtet, ein langer Lauf zählt
höchstens wie sechs Abschnitte):

```
ln(v) = a + b · HF
```

Belastbar ist das Modell erst mit mindestens 6 Läufen, 15 Abschnitten, einer
Pulsspanne (10.–90. Perzentil) von mindestens 8 bpm und einer plausiblen
Steigung (+1 bpm ≈ +0.4 … +3 % Tempo). Weil es je Woche neu entsteht, darf sich
die Beziehung über die Zeit ändern.

### Normierung auf den Referenzpuls

Jeder Lauf behält seinen eigenen Achsenabschnitt — das ist seine Tagesform:

```
a_Lauf = gewichteter Median( ln(v) − b · HF )   über seine Abschnitte
v_ref  = exp(a_Lauf + b · HF_ref)
Pace_ref = 1000 / v_ref   (s/km)
```

`HF_ref` bleibt **148 bpm** (der bisher gespeicherte Referenzpuls), damit neue
und alte Werte vergleichbar sind. Er wird jetzt einmal festgeschrieben und
wandert nicht mehr mit jedem Sync.

**Extrapolation ist begrenzt:** Normiert wird nur, wenn Referenzpuls und Lauf
im belastbaren Modellbereich (10.–90. Perzentil der Abschnittspulse) plus
höchstens 5 bpm liegen und der Lauf höchstens 15 bpm vom Referenzpuls entfernt
ist. Ein Lauf mit 135 bpm wird also nur dann auf 148 bpm hochgerechnet, wenn
andere Läufe der gleichen Wochen zeigen, wie Puls und Tempo zwischen 135 und
148 bpm zusammenhängen. Sonst gilt er als „ausserhalb des belastbaren
Pulsbereichs" und bleibt der Zone-2-Auswertung erhalten. Ohne Modell zählen
nur Abschnitte, die direkt am Referenzpuls (±3 bpm) gelaufen wurden —
unverändert.

Jeder Wert ist markiert: **gemessen** (mindestens 5 Minuten direkt am
Referenzpuls) oder **geschätzt** (über das Modell verschoben). Die
Datenqualität 0–1 sinkt mit dem Abstand zum Referenzpuls (−3 % je bpm ab
3 bpm, mindestens 0.55), ohne Höhenkorrektur (×0.8), bei nur einem Abschnitt
(×0.8) und bei Pulslücken (×0.9).

### Zone 2 Efficiency

Überwiegend aerobe Läufe (mindestens 70 % der Bewegungszeit bis zur Obergrenze
von Zone 2) gehen mit ihren Zone-2-Abschnitten in eine eigene Reihe ein.
Referenz ist der Puls, bei dem diese Abschnitte tatsächlich liegen (gewichteter
Median), nicht die Zonenmitte. Zonen kommen aus dem Garmin-Konto (Laufzonen);
fehlen sie, rechnet die App mit Karvonen und sagt deutlich, dass die Grenzen
dann geschätzt sind.

### Rollierender 28-Tage-Trend

Für jeden Tag fasst ein **robustes gewichtetes Mittel** (Huber um den
gewichteten Median) die normierten Läufe der letzten 28 Tage zusammen. Gewicht
= Datenqualität × Alter: 0–14 Tage voll, bis 21 Tage auf 0.5, bis 27 Tage auf
0.2, ab 28 Tagen nicht mehr. Einzelne ungewöhnliche Läufe verschieben den Trend
kaum.

- Ohne neuen Lauf seit 7 Tagen ist der Trend **fortgeschrieben** (gestrichelt).
- Mit zu wenig Gewicht ist er **unsicher** (ebenfalls gestrichelt).
- Ohne Lauf in 28 Tagen bricht die Linie ab.

Nichts wird erfunden: keine eingesetzten Pace-Werte, keine Fortschreibung über
28 Tage hinaus, keine Extrapolation in die Zukunft.

### Diagramm und Kennzahlen

Die Pace-Achse ist umgekehrt (schneller liegt oben). Punkte sind die
tatsächlichen Läufe (gefüllt = gemessen, hohl = geschätzt), die Linie ist der
Trend, der aktuelle Wert ist hervorgehoben. Darüber: aktuelle Referenzpace,
Veränderung seit Beginn des Zeitraums, Anzahl Läufe im Zeitraum und
Datenqualität (gut: mindestens 4 Läufe in 28 Tagen, neue Messung, Qualität
≥ 0.75; mittel: mindestens 2 Läufe; sonst gering). Zeitfilter: 30 T, 90 T,
6 M, 1 J, Alles (nur die, die sich von „Alles" unterscheiden). Darunter steht,
wie viele Läufe eingeflossen sind, welche aus welchem Grund fehlen und wie
viele die bisherige Methode gezählt hätte.

### Historische Daten und Speicherung

Die Analyse läuft rückwirkend über alle vorhandenen Läufe, direkt aus den
gespeicherten Zeitreihen; die Aktivitäten selbst bleiben unverändert. Das
kompakte Ergebnis liegt in `app_settings["aerobe_analyse"]`. Neu analysiert
wird ein Lauf, wenn er neu ist, nach einem Resync (`synced_at`) oder wenn sich
die Regeln ändern (`ABSCHNITT_VERSION`). Der Backfill hat ein Zeitbudget
(20 s in `recomputeAll`, 6 s beim Laden des Dashboards); solange Läufe offen
sind, zeigt das Diagramm „Analyse läuft". Modell, Normierung und Trend werden
bei jedem Aufruf frisch aus dem Cache gerechnet. Die frühere Tageskurve in
`computed_daily.pace_ref_hr_*` wird nicht mehr geschrieben (die Spalten bleiben).

## 3. Vergleich mit der bisherigen 148-bpm-Methode

| Datenstand | Läufe | bisherige Methode | neue Methode |
| --- | --- | --- | --- |
| Testblock (12 Wochen, überwiegend 135–142 bpm, Tests) | 36 | 6 | 36 |
| Öffentliche Demo (fiktiv, lockere Läufe bei 144–148 bpm) | 41 | 33 | 37 (3 Intervall-Läufe ohne stabilen Abschnitt, 1 ausserhalb des Modellbereichs) |

Für die eigenen Daten steht der Vergleich direkt unter dem Diagramm
(„Bisherige Methode … jetzt N zusätzlich"). Je tiefer die lockeren Läufe
unter dem Referenzpuls liegen, desto grösser der Unterschied.

## 4. Tests

| Fall | Test |
| --- | --- |
| Zone-2-Lauf mit 135 bpm | `aerobe-abschnitte.test.ts` „1 ·", `aerobe-leistung.test.ts` „1 + 2 ·" |
| Lockerer Lauf mit 140 bpm | „2 ·" |
| Dauerlauf mit 148 bpm | „3 ·" (gemessen, Qualität 1) |
| Lauf mit 155 bpm | „4 ·" (nach unten normiert) |
| Intervalle mit schwankendem Puls | „5 ·" (kein Abschnitt, kein Mittelwert) |
| Unvollständige Herzfrequenz | „6a ·" bis „6c ·" |
| GPS-Ausreisser | „7 ·" |
| Woche ohne Lauf | „8 ·" (fortgeschrieben, Abbruch nach 28 Tagen) |
| Mehrere Läufe in einer Woche | „9 ·" |
| Nur lockere Läufe | „10 ·" (keine erfundenen 148-bpm-Werte, Zone 2 bleibt) |
| Extrapolation begrenzt | „ein Erholungslauf bei 118 bpm …" |
| Vergleich alt/neu | „berücksichtigt alle 36 Läufe statt nur der 6 …" |

## 5. Grenzen

- Hitze, Flüssigkeitsmangel und Ermüdung erhöhen den Puls; das Modell kennt sie
  nicht. Robuste Statistik, Tagesform als eigener Achsenabschnitt und der
  Trend über 28 Tage dämpfen solche Läufe, entfernen sie aber nicht.
- Kardialer Drift verschiebt späte Abschnitte langer Läufe zu höherem Puls; der
  Median über alle Abschnitte eines Laufs gleicht das teilweise aus.
- Das log-lineare Modell gilt nur im belastbaren Pulsbereich; darüber hinaus
  wird höchstens 5 bpm extrapoliert.
- Ohne Garmin-Zonen ist Zone 2 nur geschätzt (Karvonen).
- Laufband- und andere Läufe ohne Höhenprofil zählen nur mit bekannt flacher
  Strecke (≤ 10 Hm/km laut Aktivität).
