# Getroffene Annahmen

Dokumentationspflichtige Annahmen und bewusst kurz gehaltene Zeitfenster.

## Getroffene Annahmen (dokumentationspflichtig laut Auftrag)

- **Programmstart:** Der 4-Wochen-Block (`lib/engine/block.ts`) zählt ab
  Mo, 23.11.2026 (`PROGRAMM_START`). Planwochen davor stammen aus dem
  früheren Programm: Ihre Einträge bleiben unverändert in der DB, die
  Plan-Ansicht zeigt sie neutral (Art + Dauer) und schreibgeschützt
  (`lib/engine/plan-archiv.ts`); deren alte Wochenhinweise werden nicht mehr
  angezeigt. Die Tabelle `ep_benchmarks` bleibt bestehen, wird aber weder
  gelesen noch geschrieben.
- **Klimmzug-Kennwert:** meiste Wiederholungen eines Klimmzug-Satzes ohne
  Zusatzgewicht aus den Garmin-Kraftsätzen der letzten 8 Wochen
  (`klimmzugMaxAusSaetzen`). Ohne Wert gibt der Plan keine Zahl vor, sondern
  „2–3 Wiederholungen vor dem Versagen aufhören".
- **Health-Backfill:** 365 Tage (in `api/_lib/sync_logic.py` änderbar).
- **Course-Push:** Das JSON-Schema von `POST /course-service/course` ist
  inoffiziell; sollte Garmin es ändern, dient der GPX-Export als Fallback
  (manueller Import in Garmin Connect Web).
- **Kraft-Workout-Push:** Das Workout-Format bildet keine vollständige
  Satzstruktur für alle Übungen ab — Übungen landen als beschriftete
  Schritte auf der Uhr. Gym-Einheiten gehen standardmässig nicht an die Uhr.
- **Muskelmodell:** Heuristik (im UI gekennzeichnet); Läufe mit Zusatzlast
  (Rucksack/Weste) werden über den Aktivitätsnamen erkannt und belasten
  zusätzlich Rumpf und Rücken.
- **Gewicht:** Feldnamen der Weight-Service-Antworten folgen
  `garminconnect` 0.2.25 (`get_weigh_ins`) — der Parser ist tolerant und
  speichert die Rohantwort je Messung in `raw`. Mit
  `scripts/garmin/dump_gewicht.py` lassen sich echte Antworten als Fixture
  sichern und prüfen (siehe [GEWICHT.md](GEWICHT.md)).
- **Flyover-Kamera:** MapLibre besitzt keine FreeCamera-API (Mapbox-only);
  der Verfolger-Effekt ist mit `jumpTo` + geglättetem Bearing entlang eines
  `bezier-spline`-Kamerapfads umgesetzt.

## Verlaufs-Graphen seit Trainingsstart

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
