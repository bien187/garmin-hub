# Analyse-Engine

Formeln der regelbasierten Engine in `lib/engine/` und Verhalten der Übersichten.

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

## Aktuelle Übersicht und Terminplanung

Die Fortschrittsübersicht reicht bis zum heutigen Datum (Europe/Zurich), einschliesslich der laufenden Woche. Fehlende Messwochen bleiben leer; der letzte Messstand wird angezeigt. Beim Öffnen nach einem Tageswechsel werden die gespeicherten Trainingsdaten neu berechnet. Die Ansicht aktualisiert sich bei Rückkehr und jede Minute; neue Garmin-Daten kommen weiterhin über den täglichen oder manuellen Sync.

Unter der EP-Prognose lassen sich über «Einträge verwalten / löschen» Fehleinträge entfernen. Die Prognose wird anschliessend neu geladen.

Im Wochenplan lässt sich die Verfügbarkeit für einzelne Daten speichern. Montag, Donnerstag und Sonntag bleiben wie im bestehenden Generator feste Gymtage (inklusive dessen Entlastungs-/Taper-Regeln). Flexible Einheiten werden auf verfügbare Tage verteilt, höchstens ein Lauf pro Tag, mit Abstand zwischen harten Einheiten. Reicht die Zeit nicht, entfallen Einheiten mit Hinweis. Vergangene und absolvierte Einheiten werden nicht neu angelegt. Bereits an Garmin übertragene Tage bleiben erhalten; vor dem Sperren solcher Tage müssen deren offenen Einheiten über «Von der Uhr entfernen» zurückgeholt werden. Verfügbarkeit und Plan werden gemeinsam in einer Transaktion gespeichert; keine Datenbankmigration erforderlich.
