# Spezifikation — Garmin Hub („Personal Fitness & Running Performance")

Stand: November 2026. Ersetzt den ursprünglichen Auftrag (Vorbereitung auf eine
Eignungsprüfung); dessen Text bleibt in der Git-Historie.

## 1. Ziel

Garmin Hub ist eine persönliche Single-User-Webapp für die langfristige
Verbesserung von **Laufleistung, Ausdauer und allgemeiner Fitness**. Sie
synchronisiert Garmin-Daten über die inoffizielle Garmin-Connect-API, wertet sie
mit einer regelbasierten Engine aus (keine LLM-Aufrufe, keine laufenden Kosten)
und soll ruhig, professionell und hochwertig wirken — ein Werkzeug für Gesundheit
und Training, kein lautes Dashboard (Design-Revision 2.0 „Understated Performance").

Grundsatz: **Weiterentwicklung statt Neubau.** Architektur, Datenstrukturen,
Garmin-Integration, Aktivitätsverwaltung und die Trainings-Engine bleiben
erhalten; Prüfungs- und Notenlogik gibt es nicht mehr.

## 2. Seiten

1. **Dashboard** — Gesundheitsübersicht in dieser Reihenfolge: Kopf (Gruss,
   Datum, dezenter Sync-Knopf); Training Readiness und Body Battery (Wert, Status,
   Trend, schlanke Skala) mit kurzer Einschätzung; weitere Gesundheitswerte
   (Ruhepuls, HRV, Stress, Form); Schlaf (Dauer, Score, Tief/REM/Leicht/Wach,
   Schlaf-Herzfrequenz, Zeitleiste); kompakte letzte Aktivitäten; weiter unten
   Wochenkennzahlen, Gewicht, Entwicklung (Fortschritt, Form, Aerobic
   Performance, Konsistenz), Insights und Gesamtbilanz. **Kein „Nächstes Training" im
   Dashboard** — das steht nur im Plan.
2. **Aktivitäten** — Karten mit Sportart, Datum, Distanz, Dauer, Pace, Puls,
   Höhenmetern und Icon; Laufen und Kraft klar unterscheidbar. Detailansichten mit
   Flyover, Splits, Zonen und Metriken bleiben vollständig.
3. **Karte** — Routen-Builder und Aktivitätsrouten, mobil bedienbar.
4. **Plan** — Wochenansicht als persönlicher Trainingscoach: Karten pro Tag mit
   Icons (Gym, Laufen, Intervalle, Ruhe), Beschreibung, Dauer, Intensität,
   Fortschritt, erledigte Einheiten und hervorgehobene nächste Einheit.
5. **Körper** — Smart Weight Tracking, Körperzusammensetzung, Muskelstatus und
   systemische Ermüdung; keine prüfungsbezogenen Bewertungen.

## 3. Trainingsplan

Die bestehende Engine plant weiterhin dynamisch (Umfang, Intensität, Dauer,
Belastung/Erholung). Fester Wochenrhythmus:

| Tag | Inhalt |
| --- | --- |
| Montag | Gym (bestehende Kraftlogik) |
| Dienstag | Laufen: Intervalle |
| Mittwoch | Laufen: Zone 2 (oder eine andere sinnvolle Laufeinheit der Engine) |
| Donnerstag | Gym (bestehende Kraftlogik) |
| Freitag | Ruhe |
| Samstag, Sonntag | frei — keine automatisch geplanten Pflichteinheiten |

Laufen steht im Mittelpunkt, Kraft bleibt zweimal pro Woche. Keine Noten, keine
Prüfungsziele; Abhängigkeiten zur früheren Notenskala werden sauber durch eine
allgemeine Fitness-Zielsetzung ersetzt.

## 4. Smart Weight Tracking (Garmin Index S2)

- Wägungen automatisch aus Garmin Connect (nur dokumentierte Funktionen der
  eingesetzten Bibliothek), jede Messung mit Originalzeitstempel, mehrere pro Tag,
  nie überschrieben oder verändert. Zugangsdaten nur serverseitig.
- Messbedingungen (Tageszeit, nüchtern, Frühstück, Toilettengang, Abstand zu
  Mahlzeit, Trinken, Training) — Automatisches wird nicht abgefragt, Fehlendes
  nie erfunden. Schnelles Messprotokoll „Wie war deine Messung?".
- Messqualitäts-Score 0–100 (morgens 15, nüchtern 25, vor dem Frühstück 10, nach
  Toilette 10, ≥ 2 h nach Mahlzeit 10, nach Trinken 10, nach Sport 10, übliche
  Messzeit 10); fehlende Angaben nie positiv, Widersprüche berücksichtigt; Klassen
  85–100 / 70–84 / 45–69 / 0–44; Datenqualitätsstatus bei Lücken. Kein
  medizinischer Genauigkeitswert.
- Zwei Ebenen: Rohmessungen unverändert; standardisierter Trend als gleitender
  7-Tage-Median der vergleichbarsten Messung pro Tag, nur mit genügend Werten,
  ohne aufgefüllte Tage, optional 30-Tage-Entwicklung. **Keine künstlichen
  Kilogramm-Korrekturen.**
- Diagramm mit Punkten nach Messqualität, Trendlinie, Tooltip, Zeitfiltern
  (7 T bis Gesamt) und getrennt schaltbaren Ebenen; Kennzahlen (aktuell, Trend,
  7/30 Tage, Tiefst/Höchst, Ø Qualität, Anzahl); Körperfett, Muskelmasse,
  Körperwasser und BMI getrennt vom Gewicht.

## 5. Design

Design-Revision 2.0 „Understated Performance": Hintergrund `#151B26`, Fläche
`#1C2532`, erhöhte Fläche `#232E3C`, Text `#F0F2F4` / `#9AA5B3`, Akzente Muted Sage
`#A4B99A`, Soft Blue `#8FA6C1` und Muted Orange `#D69A72`, Trennlinien `#303A47`.
Struktur über Typografie (Geist), Abstände und feine Trennlinien statt über
Karten: keine grossen abgerundeten Boxen, keine verschachtelten Karten, keine
starken Schatten, kein Glow, keine Verläufe, keine Lime-Flächen, wenige Icons und
Badges, kaum Animation. Ein zentrales Design-System, mobile-first, Touch-Ziele
≥ 44 px, kein horizontales Scrollen auf 390 px.

## 6. Technik

Next.js 15, React 19, Tailwind 4, shadcn/ui, Recharts, MapLibre; Drizzle auf
Supabase Postgres; eine Python-Bridge (`garminconnect`, `garth`, `pg8000`);
Vercel Hobby (max. 12 Functions), alles im Free Tier. Migrationen nur additiv,
bestehende Daten bleiben erhalten. Details und Konventionen: [CLAUDE.md](CLAUDE.md).
