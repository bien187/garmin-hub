# EP-Termin, Taper-Plan und EP-Checkliste

Feste EP-Daten, Tagesregeln des Tapers und die Checkliste für die Prüfungstage.

## EP-Termin und Taper-Plan

- **Termin fix:** `EP_DATUM = 2026-11-18` (Tag 1), `EP_TAG_2 = 2026-11-19`,
  `TAPER_START = 2026-11-05` in `lib/ep/konstanten.ts`. Das Feld im
  Profil-Formular ist entfernt (nur noch Anzeige „EP: Mi 18.11.2026 (fix)"),
  `/api/settings` ignoriert `epDatum`, und `ladeProfil()` verwirft einen in der
  DB gespeicherten Altwert. Countdown, Phasen, Restwochen und Prognose lesen
  nur noch die Konstante; der Countdown zählt bis Tag 1 und zeigt an den
  beiden EP-Tagen „EP – Tag 1" bzw. „EP – Tag 2" („EP absolviert" erst ab
  dem 20.11.).
- **Phasen:** Phase 3 „Spezifisch" bis 04.11., Phase 4 „Taper" 05.11.–19.11.
  (kein „EP − 13 Tage" mehr). Nach dem 19.11. bleibt `aktuellePhase` bei
  Phase 4 (es gibt bewusst keine fünfte Phase); der Countdown zeigt ab dem
  20.11. „EP absolviert", der Plan folgt den Regeln „nach der EP" (unten).
- **Tagesregeln** (`taperRegelFuerTag(datum)` in `lib/engine/taper.ts`, rein,
  client-sicher; Felder `maxIntensitaet` = höchste Laufintensität,
  `erlaubt`, `umfangFaktor`, `maxDauerMin`, `nurSubmaximal`,
  `keineBeinkraft`, `begruendung`):

  | Datum | Regel | Lauf max. | Inhalt im Plan |
  |---|---|---|---|
  | Do 05.–Fr 06.11. | Umfang −40 % | Z5, 45 Min | normaler Plan abgeschwächt (Läufe ×0.6, Sätze ×0.6), keine Steigerung |
  | Sa 07.11. | Letzte Intensität | Z5, 45 Min | Probe-EP/Lastlauf → „Letzte Intensität 5×2 Min" |
  | So 08.11. | locker | Z2, 45 Min | Ganzkörper reduziert, Beine nur leicht |
  | Mo 09.11. | Letzte schwere Beineinheit | kein Lauf | Gym Ganzkörper mit Beinen, **kein Lastlauf** |
  | Di 10.11. | Letzter Zieltempo-Lauf | Z4, 40 Min | 12 Min ein, 3×5 Min Z4, 5 Min aus (15 Min Z4) |
  | Mi 11.–So 15.11. | Nur Z2 | Z2, 30 Min | Z2 30/25 Min flach (11./14.), GtG submaximal, Do 12.11. Klimmzüge/Liegestütze submaximal + Rumpf leicht, sonst Ruhe; keine Beinkraft, keine neuen Übungen |
  | Mo 16.11. | Spazieren + Mobilität | kein Lauf | 20 Min Spazieren + Mobilität |
  | Di 17.11. | Frei oder locker | 20 Min | optional 20 Min locker |
  | Mi 18.11. | EP – Tag 1 | — | nur der EP-Eintrag |
  | Do 19.11. | EP – Tag 2 | — | nur der EP-Eintrag |
  | Fr 20.–So 22.11. | Regeneration | kein Lauf | Spazieren |
  | ab Mo 23.11. | Nach der EP | — | kein Plan |

- **Generator:** `generiereWochenplan` baut das Wochenskelett wie bisher und
  wendet danach für Tage ≥ 05.11. die Tagesregel an (05.–08.11.
  abschwächen/ersetzen, ab 09.11. Einheiten direkt aus der Regel). Nach dem
  Verteilen auf verfügbare Tage prüft `erzwingeTaperGrenzen` erneut
  (verschobene Läufe werden zu Z2 gekappt oder entfallen). Einträge ab 05.11.
  werden mit Phase 4 gespeichert.
- **Bestehende Einträge** (`planeBestand` in `lib/engine/plan-bestand.ts`,
  rein und getestet): `ep` und `absolviert` bleiben immer, Vergangenes
  ebenso. Offene `geplant`-Einträge ohne Garmin-ID werden wie bisher auf
  freien bzw. gesperrten Tagen ersetzt. Auf belegten Tagen (ein Eintrag liegt
  schon auf der Uhr) bleiben sie vor dem Taper stehen; ab 05.11. werden sie
  immer durch die Taper-Version des Tages ersetzt (sonst bliebe z. B. am
  05.11. „Klimmzüge schwer" mit 5 Sätzen statt der Variante mit 3 Sätzen
  stehen). Den Ersatz liefert die generierte Woche, ohne Typen, die schon auf
  der Uhr liegen, und ohne zweiten Lauf (echte DB: Probe-EP am 07.11. neben
  dem gepushten Rumpf → „Letzte Intensität"). Gepushte Einträge werden nie
  gelöscht; widersprechen sie dem Taper, steht in den Wochenhinweisen
  „… liegt bereits auf der Uhr und passt nicht zum Taper — bitte «Von der
  Uhr entfernen» und neu planen". Liegt am 05.–08.11. eine Kraft- oder
  Rumpfeinheit ohne Taper-Kürzung auf der Uhr (z. B. der Rumpf am 05./07.11.),
  gibt es den Hinweis, den Umfang selbst um ca. 40 % zu kürzen.
- **EP-Einträge:** `typ = "ep"`, „EP – Tag 1"/„EP – Tag 2", ohne Struktur,
  `syncToGarmin = false`. Der Generator legt sie idempotent an (existiert
  schon einer, bleibt er unverändert) und löscht sie nie. EP-Tage lassen sich
  im Terminplan nicht sperren; es wird nichts auf sie verschoben. Serverseitig
  lehnt `POST /api/plan/[id]/push` (auch für das Sammel-Senden) sie ab,
  `PATCH` erlaubt nur den Status (nie „gepusht"/Garmin-Sync, kein
  Umtypisieren), `DELETE` antwortet 409. Die laufende Plan-Anpassung
  (`berechneAnpassungen`/`passePlanAn`) fasst sie nie an, das
  Workout-Matching markiert sie weder als absolviert noch als verpasst.
  Im Wochenplan: eigene Farbe (`--ep`, hell + dunkel) und Pokal-Icon.
- **Plan-Anpassung im Taper:** ersetzt nie über die Tagesregel hinaus — ein
  lockerer Ersatzlauf ist höchstens so lang wie `maxDauerMin`, an Tagen ohne
  erlaubten Lauf wird daraus ein Ruhetag.
- **Annahmen:**
  - EP Tag 2 = Do 19.11.2026.
  - Widerspruch im Auftrag: Mo 09.11. nennt „Lastlauf" als letzte schwere
    Beineinheit, B3 schliesst Lastläufe im Taper aus. Entscheid: 09.11. ist
    Gym Ganzkörper mit Beinen, **kein Lastlauf** (die spezifischere Regel).
  - Der Auftrag nennt „Di 05.11."; der 05.11.2026 ist ein Donnerstag. Die
    Regel „Umfang −40 %" gilt Do 05.–So 08.11.
  - Rumpf in der letzten Woche nur am 12.11. (auch nicht am 10.11.).
  - Nach der EP: 20.–22.11. Regeneration (Spazieren), danach kein Plan, bis
    neue Ziele gesetzt sind. Wird die EP-Woche (16.11.) oder eine spätere Woche
    neu generiert, entfernt das auch alle veralteten `geplant`-Zeilen ohne
    Garmin-ID nach dem 22.11. (bzw. nach dem Ende der generierten Woche) und
    die Wochenhinweise/Anpassungsprotokolle dieser Wochen. Wochen ab dem 23.11.
    zeigen ohne Einträge „Kein Trainingsplan nach der EP" statt «Woche
    generieren».
  - Die echte DB wird durch diesen Code nicht automatisch umgeplant; die
    Wochen 02.11., 09.11. und 16.11. müssen einmal neu generiert werden (die
    Woche 16.11. räumt dabei die alten Einträge bis 13.12. mit ab).

## EP-Checkliste

- **Inhalt** in `lib/ep/checkliste.ts` (rein, client-sicher): je EP-Tag eine
  eigene Liste mit den Gruppen Vorabend / Morgens / Vor Ort / Danach. Tag 2
  hat eigene IDs (`t2-…`) und angepasste Texte (Vorabend = Abend nach Tag 1:
  Erholung, Essen, Tasche für Tag 2). Ernährungsvorschläge stehen gesammelt in
  `ERNAEHRUNG` und lassen sich dort anpassen. Die Punkt-IDs sind der Schlüssel
  des Abhakzustands — Texte dürfen sich ändern, IDs nicht.
- **Startzeit** (Standard 08:00) je Tag; daraus das Frühstück-Fenster
  Startzeit −3 h bis −2 h (`fruehstueckFenster`, bei Startzeiten vor 03:00 mit
  Hinweis „Vortag"). **Fortschritt** „x von y" zählt nur IDs, die in der Liste
  existieren, jede einmal (`fortschritt`).
- **Persistenz:** `app_settings` unter `ep_checkliste_<datum>` mit
  `{ abgehakt: string[], startzeit: "HH:MM" }`, keine Migration.
  `GET /api/ep-checkliste?datum=…` und `PUT /api/ep-checkliste`
  (`{ datum, abgehakt, startzeit }`, zod-validiert, Session-Prüfung im
  Handler). Nur 18.11. und 19.11. sind erlaubt (sonst 400); unbekannte IDs
  und Duplikate werden beim Speichern und Lesen verworfen.
- **UI** (`components/plan/ep-checkliste.tsx`): Tippen auf den EP-Eintrag im
  Wochenplan öffnet ein Bottom-Sheet mit der Checkliste statt der
  aufklappbaren Eintragsansicht (Status „Erledigt" ist dort weiterhin
  setzbar). Ganze Zeile tippbar (≥ 44 px), Abhaken wird sofort angezeigt und
  im Hintergrund gespeichert (immer der vollständige Stand, nacheinander;
  Startzeit-Änderungen gesammelt nach 0.6 s). Schlägt Speichern fehl, bleibt
  der lokale Stand erhalten (auch nach Schliessen/erneutem Öffnen des Sheets
  in derselben Sitzung) und lässt sich per „Erneut speichern" senden. Die
  Sende-Schlange gilt pro EP-Tag für die ganze Seite: Wird das Sheet während
  eines laufenden Speicherns geschlossen und wieder geöffnet, übernimmt es
  diesen Vorgang (kein Fehlerhinweis, keine parallelen PUTs).
- **Annahmen:**
  - Kein Rate-Limit: die übrigen reinen DB-Schreibrouten (z. B.
    `PATCH /api/plan/[id]`, `/api/settings`) haben auch keins; Rate-Limits
    gibt es nur für Login und Garmin-Aufrufe.
  - Die Startzeit gilt je EP-Tag separat (Tag 2 kann anders beginnen).
  - Inhalte sind allgemeine Vorschläge ohne medizinische Aussagen; der
    Hinweis steht auch unter der Liste.
  - `SheetShell` blendet sich jetzt auch aus, wenn `open` von aussen auf
    `false` gesetzt wird (Schliessen-/Abbrechen-Knopf). Vorher blieb das
    Sheet in diesem Fall sichtbar; das betraf auch das bestehende
    „Abbrechen" im Sammel-Senden und im Lösch-Bestätigungs-Sheet.
