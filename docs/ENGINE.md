# Analyse-Engine

Formeln der regelbasierten Engine in `lib/engine/` und Verhalten des Trainingsplans.
Alle Funktionen sind rein und deterministisch (ohne DB) und mit Vitest getestet.

## Engine-Formeln

- Banister-TRIMP `Dauer × HRr × 0.64 × e^(1.92·HRr)`, Session-RPE-Fallback
- CTL (τ=42 d) / ATL (τ=7 d) / TSB; ACWR 7:28 mit Ampel
- EF = (m/min)/HR (nur Läufe > 20 min, < 50 Hm); aerobe Entkopplung Pw:HR
- GAP über Minetti-Polynom `C(i) = 155.4i⁵ − 30.4i⁴ − 43.3i³ + 46.3i² + 19.5i + 3.6`
- Aerobic Performance: stabile 5-Min.-Abschnitte je Lauf, robuste Regression
  `ln v = a + b·HF`, Normierung `v_ref = exp(a_Lauf + b·HF_ref)` mit begrenzter
  Extrapolation, rollierender 28-Tage-Trend — siehe [AEROBE-LEISTUNG.md](AEROBE-LEISTUNG.md)
- Riegel `T2 = T1 × (D2/D1)^1.06` + Best-Effort-Erkennung (rollende Fenster)
- Trainings-Paces (Zone 2, Steady, Schwelle, Intervall) aus der 5-km-Prognose
- Muskel-Erholung `Rest(t) = Σ Lᵢ·e^(−Δt/τ)` (Waden 30 h, kleine
  Oberkörpermuskeln 36 h, grosse Gruppen 48 h; τ×1.3 nach sehr hoher Last)
- Pearson-Korrelationen für Insights (|r| ≥ 0.3, n ≥ 15)
- Wochenstatistik (`wochenstatistik.ts`): Einheiten, Trainingszeit, Laufdistanz,
  Ø Pace (Zeit/Distanz der Läufe), Ø Puls (zeitgewichtet) — fehlende Grössen sind
  `null`, nie 0
- Smart Weight Tracking (`gewicht.ts`): Messqualitäts-Score und gleitender
  Median, siehe [GEWICHT.md](GEWICHT.md)

## Trainingsplan

Ziel: Laufleistung, Ausdauer und allgemeine Fitness verbessern. Der Generator
(`generiereWochenplan` in `lib/engine/plan.ts`) baut jede Woche im festen Rhythmus:

| Tag | Einheit | Inhalt |
| --- | --- | --- |
| Mo | Gym | Brust/Trizeps (bestehende Routine) + Rumpf-Finisher |
| Di | Intervalle | Schwerpunkt je Blockwoche (siehe unten) |
| Mi | Lockerer Lauf | Zone 2, Dauer aus dem Restumfang; ab 70 Min als langer Lauf |
| Do | Gym | Rücken/Bizeps mit Klimmzug-Fokus + Läufer-Kraft für die Beine |
| Fr | Ruhetag | Mobilität, Spazieren, Schlaf |
| Sa, So | frei | keine Pflichteinheiten — freiwillige Läufe zählen für die Belastung |

**4-Wochen-Block** (`lib/engine/block.ts`, Anker `PROGRAMM_START` = Mo 23.11.2026):

| Blockwoche | Intervalle am Dienstag |
| --- | --- |
| 1 · Aufbau | 5 × 3 Min Zone 5 (VO₂max), 2:30 Trab |
| 2 · Aufbau | 8 × 75 s Hügel, locker zurück |
| 3 · Aufbau | 5 × 1 km im 5-km-Tempo, 90 s Trab |
| 4 · Entlastung | 4 × 60 s zügig; Umfang −30 %, Gym-Sätze ca. −40 %, lockerer Lauf ≤ 60 Min |

**Anpassungsregeln** (unverändert aus dem bisherigen Generator):

- Geplante Laufminuten steigen höchstens um 10 % gegenüber den Läufen der
  Vorwoche Mo–Fr (freiwillige Wochenend-Läufe zählen nicht als Basis, fliessen
  aber über ACWR/TSB ein). Untergrenze der Basis: 90 Min.
- ACWR > 1.3 → Umfang gedeckelt. TSB < −20 → Intervalle gestrichen,
  Extra-Ruhetag, lockerer Lauf ≤ 40 Min.
- Quadrizeps/Waden ≥ 60 % erschöpft → Intervalle und lockerer Lauf tauschen
  die Tage (Di ↔ Mi).
- Training Readiness < 35 → Hinweis, die harte Einheit zu tauschen.
- Klimmzug-Arbeitssätze ≈ 60 % der meisten Wiederholungen aus den
  Garmin-Kraftsätzen der letzten 8 Wochen; ohne Wert keine geratene Zahl.

**Laufende Anpassung** (`plan-anpassung.ts`, nach jedem Sync): schwächt offene
Läufe ab oder streicht sie (spontaner Lauf am Vortag, zwei harte Tage in Folge,
müde Beine, TSB < −25, ACWR > 1.5) — nur nach vorn, nie verschärfend, höchstens
zwei Eingriffe pro Lauf, Gym- und Ruhe-Einträge bleiben unangetastet.

**Verfügbarkeit** (`verfuegbarkeit.ts`): Sperren lassen sich nur die Lauftage
Di und Mi. Läufe werden dann auf den anderen Lauftag verschoben (höchstens ein
Lauf pro Tag, harte Läufe mit Abstand) oder entfallen mit Hinweis. Gymtage,
Ruhetag und das freie Wochenende bekommen nie verschobene Einheiten.

**Bestehende Einträge** (`plan-bestand.ts`): Erledigtes, Vergangenes und
bereits an Garmin übertragene Einheiten bleiben; offene, nicht übertragene
Einheiten auf freien oder gesperrten Tagen werden beim Neugenerieren ersetzt.
Verfügbarkeit und Plan werden gemeinsam in einer Transaktion gespeichert.

## Aktuelle Übersicht

Die Übersichten reichen bis zum heutigen Datum (Europe/Zurich), einschliesslich
der laufenden Woche. Fehlende Messwochen bleiben leer. Beim Öffnen nach einem
Tageswechsel werden die gespeicherten Trainingsdaten neu berechnet; neue
Garmin-Daten kommen über den täglichen oder manuellen Sync.
