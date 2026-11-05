"""Inkrementeller, idempotenter Garmin-Sync.

Chunk-Strategie wegen Vercel-Timeouts: Ein Aufruf verarbeitet höchstens
ACTIVITY_CHUNK Aktivitäten bzw. HEALTH_CHUNK_TAGE Gesundheits-Tage und
liefert hasMore=True, solange es weitergeht. Zwischen Garmin-Requests
wird pausiert (Rate-Limit-Schonung); ein Zeitbudget bricht den Chunk
rechtzeitig vor dem Function-Timeout ab.
"""
import datetime as dt
import json
import time

from . import db as dbmod

ACTIVITY_CHUNK = 12
HEALTH_CHUNK_TAGE = 7
HEALTH_BACKFILL_TAGE = 365
PAUSE_S = 0.35
ZEIT_BUDGET_S = 40


def _pause():
    time.sleep(PAUSE_S)


def encode_polyline(points):
    """Google Encoded Polyline (Präzision 5); points = [(lat, lng), ...]"""
    out = []
    prev_lat = prev_lng = 0
    for lat, lng in points:
        ilat, ilng = round(lat * 1e5), round(lng * 1e5)
        for v in (ilat - prev_lat, ilng - prev_lng):
            v = ~(v << 1) if v < 0 else v << 1
            while v >= 0x20:
                out.append(chr((0x20 | (v & 0x1F)) + 63))
                v >>= 5
            out.append(chr(v + 63))
        prev_lat, prev_lng = ilat, ilng
    return "".join(out)


# ---------------------------------------------------------------- Aktivitäten


def _aktivitaet_upsert(con, a):
    speed = a.get("averageSpeed") or 0
    pace = (1000.0 / speed) if speed > 0.5 else None
    start = a.get("startTimeGMT")  # "2026-07-16 06:12:00"
    con.run(
        """
        INSERT INTO activities (id, typ, name, start_zeit, dauer_s, distanz_m,
            hm_auf, hm_ab, avg_hr, max_hr, avg_pace, kalorien, avg_kadenz,
            trainingseffekt_aerob, trainingseffekt_anaerob, vo2max_wert,
            geraet, raw, synced_at)
        VALUES (:id, :typ, :name, (:start || '+00')::timestamptz, :dauer, :dist,
            :hm_auf, :hm_ab, :avg_hr, :max_hr, :pace, :kal, :kadenz,
            :te_a, :te_an, :vo2, :geraet, :raw, now())
        ON CONFLICT (id) DO UPDATE SET
            typ = excluded.typ, name = excluded.name,
            dauer_s = excluded.dauer_s, distanz_m = excluded.distanz_m,
            hm_auf = excluded.hm_auf, hm_ab = excluded.hm_ab,
            avg_hr = excluded.avg_hr, max_hr = excluded.max_hr,
            avg_pace = excluded.avg_pace, kalorien = excluded.kalorien,
            avg_kadenz = excluded.avg_kadenz,
            trainingseffekt_aerob = excluded.trainingseffekt_aerob,
            trainingseffekt_anaerob = excluded.trainingseffekt_anaerob,
            vo2max_wert = excluded.vo2max_wert, raw = excluded.raw,
            synced_at = now()
        """,
        id=a["activityId"],
        typ=(a.get("activityType") or {}).get("typeKey", "unknown"),
        name=a.get("activityName"),
        start=start,
        dauer=a.get("duration") or 0,
        dist=a.get("distance"),
        hm_auf=a.get("elevationGain"),
        hm_ab=a.get("elevationLoss"),
        avg_hr=a.get("averageHR"),
        max_hr=a.get("maxHR"),
        pace=pace,
        kal=a.get("calories"),
        kadenz=a.get("averageRunningCadenceInStepsPerMinute"),
        te_a=a.get("aerobicTrainingEffect"),
        te_an=a.get("anaerobicTrainingEffect"),
        vo2=a.get("vO2MaxValue"),
        geraet=str(a.get("deviceId") or ""),
        raw=json.dumps(a),
    )


def _hat_streams(con, activity_id) -> bool:
    rows = con.run(
        "SELECT 1 FROM activity_streams WHERE activity_id = :id", id=activity_id
    )
    return bool(rows)


def _lade_streams(con, garmin, activity_id):
    """Zeitreihen über /activity-service/activity/{id}/details."""
    details = garmin.garth.connectapi(
        f"/activity-service/activity/{activity_id}/details",
        params={"maxChartSize": 2000, "maxPolylineSize": 2000},
    )
    _pause()
    if not details:
        return
    descriptors = details.get("metricDescriptors") or []
    metrics = details.get("activityDetailMetrics") or []
    idx = {}
    for d in descriptors:
        idx[d.get("key")] = d.get("metricsIndex")

    def spalte(key, transform=None):
        i = idx.get(key)
        if i is None:
            return None
        werte = []
        for m in metrics:
            v = (m.get("metrics") or [])[i] if i < len(m.get("metrics") or []) else None
            if v is not None and transform:
                v = transform(v)
            werte.append(v)
        return werte

    zeit = spalte("sumDuration")
    if zeit is None:
        ts = spalte("directTimestamp")
        if ts:
            t0 = next((t for t in ts if t is not None), None)
            zeit = [((t - t0) / 1000.0 if t is not None else None) for t in ts]
    if not zeit:
        return

    lat = spalte("directLatitude")
    lng = spalte("directLongitude")
    ele = spalte("directElevation")
    hr = spalte("directHeartRate")
    speed = spalte("directSpeed")
    pace = None
    if speed:
        pace = [(1000.0 / s if s and s > 0.4 else None) for s in speed]
    kadenz = spalte("directDoubleCadence") or spalte("directRunCadence")
    dist = spalte("sumDistance")

    con.run(
        """
        INSERT INTO activity_streams (activity_id, zeit_s, lat, lng, ele, hr,
            pace_s_km, kadenz, distanz_m)
        VALUES (:id, :zeit, :lat, :lng, :ele, :hr, :pace, :kadenz, :dist)
        ON CONFLICT (activity_id) DO UPDATE SET
            zeit_s = excluded.zeit_s, lat = excluded.lat, lng = excluded.lng,
            ele = excluded.ele, hr = excluded.hr, pace_s_km = excluded.pace_s_km,
            kadenz = excluded.kadenz, distanz_m = excluded.distanz_m
        """,
        id=activity_id,
        zeit=json.dumps(zeit),
        lat=json.dumps(lat),
        lng=json.dumps(lng),
        ele=json.dumps(ele),
        hr=json.dumps(hr),
        pace=json.dumps(pace),
        kadenz=json.dumps(kadenz),
        dist=json.dumps(dist),
    )

    # Encoded Polyline für Listen-Minikarten
    if lat and lng:
        punkte = [
            (la, ln)
            for la, ln in zip(lat, lng)
            if la is not None and ln is not None
        ]
        if len(punkte) >= 2:
            con.run(
                "UPDATE activities SET polyline = :p WHERE id = :id",
                p=encode_polyline(punkte[::2] if len(punkte) > 1000 else punkte),
                id=activity_id,
            )


def _lade_kraft_saetze(con, garmin, activity_id):
    try:
        data = garmin.get_activity_exercise_sets(activity_id)
    except Exception:
        return
    _pause()
    sets = (data or {}).get("exerciseSets") or []
    i = 0
    for s in sets:
        if (s.get("setType") or "").upper() != "ACTIVE":
            continue
        exercises = s.get("exercises") or []
        kategorie = None
        if exercises:
            beste = max(exercises, key=lambda e: e.get("probability") or 0)
            kategorie = beste.get("category") or beste.get("name")
        gewicht = s.get("weight")
        con.run(
            """
            INSERT INTO strength_sets (id, activity_id, uebung_name, saetze,
                wdh, gewicht_kg, dauer_s)
            VALUES (:id, :aid, :uebung, 1, :wdh, :gewicht, :dauer)
            ON CONFLICT (id) DO UPDATE SET
                uebung_name = excluded.uebung_name, wdh = excluded.wdh,
                gewicht_kg = excluded.gewicht_kg, dauer_s = excluded.dauer_s
            """,
            id=f"{activity_id}-{i}",
            aid=activity_id,
            uebung=kategorie or "UNKNOWN",
            wdh=s.get("repetitionCount"),
            gewicht=(gewicht / 1000.0) if gewicht else None,
            dauer=s.get("duration"),
        )
        i += 1


def _verarbeite_aktivitaet(con, garmin, a):
    _aktivitaet_upsert(con, a)
    aid = a["activityId"]
    typ = (a.get("activityType") or {}).get("typeKey", "")
    hat_gps = a.get("hasPolyline") or a.get("distance")
    if hat_gps and not _hat_streams(con, aid):
        try:
            _lade_streams(con, garmin, aid)
        except Exception:
            pass  # Streams sind optional — Summary ist gesichert
    if "strength" in typ or "fitness" in typ:
        _lade_kraft_saetze(con, garmin, aid)


def sync_activities(con, garmin) -> dict:
    """Ein Chunk Aktivitäten. Backfill über Offset-Paging, danach
    inkrementell (neueste zuerst, Stopp bei bekannter Seite)."""
    start_ts = time.monotonic()
    state = dbmod.get_sync_state(con, "activities") or {
        "backfillDone": False,
        "offset": 0,
    }
    verarbeitet = 0

    if not state.get("backfillDone"):
        offset = int(state.get("offset", 0))
        acts = garmin.get_activities(offset, ACTIVITY_CHUNK)
        _pause()
        for a in acts:
            _verarbeite_aktivitaet(con, garmin, a)
            verarbeitet += 1
            if time.monotonic() - start_ts > ZEIT_BUDGET_S:
                break
        state["offset"] = offset + verarbeitet
        if len(acts) < ACTIVITY_CHUNK and verarbeitet >= len(acts):
            state["backfillDone"] = True
            state["offset"] = 0
        has_more = not state.get("backfillDone")
    else:
        # Inkrementell: von vorne pagen, bis eine Seite nichts Neues enthält
        offset = int(state.get("incrOffset", 0))
        acts = garmin.get_activities(offset, ACTIVITY_CHUNK)
        _pause()
        neu = 0
        for a in acts:
            existiert = con.run(
                "SELECT 1 FROM activities WHERE id = :id", id=a["activityId"]
            )
            _verarbeite_aktivitaet(con, garmin, a)
            verarbeitet += 1
            if not existiert:
                neu += 1
            if time.monotonic() - start_ts > ZEIT_BUDGET_S:
                break
        if neu == len(acts) and len(acts) == ACTIVITY_CHUNK:
            state["incrOffset"] = offset + ACTIVITY_CHUNK
            has_more = True
        else:
            state["incrOffset"] = 0
            has_more = False

    state["lastSyncAt"] = dt.datetime.utcnow().isoformat() + "Z"
    dbmod.set_sync_state(con, "activities", state)
    return {"verarbeitet": verarbeitet, "hasMore": has_more, "state": state}


# ------------------------------------------------------------------ Health


def _health_tag(con, garmin, datum: str) -> bool:
    """Ein Gesundheits-Tag inkl. Schlaf-Nacht. Rückgabe: Nacht geschrieben?"""
    stats = {}
    sd = {}
    schlaf = {}
    hrv = {}
    hrv_summary = {}
    readiness_score = None
    try:
        stats = garmin.get_stats(datum) or {}
    except Exception:
        stats = {}
    _pause()
    try:
        sd = garmin.get_sleep_data(datum) or {}
        schlaf = sd.get("dailySleepDTO") or {}
    except Exception:
        sd = {}
        schlaf = {}
    _pause()
    try:
        hrv = garmin.get_hrv_data(datum) or {}
        hrv_summary = hrv.get("hrvSummary") or {}
    except Exception:
        hrv = {}
        hrv_summary = {}
    _pause()
    try:
        tr = garmin.get_training_readiness(datum)
        if isinstance(tr, list) and tr:
            readiness_score = tr[0].get("score")
        elif isinstance(tr, dict):
            readiness_score = tr.get("score")
    except Exception:
        readiness_score = None
    _pause()

    score = None
    scores = schlaf.get("sleepScores") or {}
    if isinstance(scores.get("overall"), dict):
        score = scores["overall"].get("value")

    con.run(
        """
        INSERT INTO daily_health (datum, ruhepuls, hrv_letzte_nacht, hrv_status,
            schlaf_dauer_s, schlaf_score, tiefschlaf_s, rem_s, stress_avg,
            body_battery_min, body_battery_max, schritte, training_readiness, raw)
        VALUES (:datum, :rhr, :hrv, :hrv_status, :schlaf_s, :schlaf_score,
            :tief, :rem, :stress, :bb_min, :bb_max, :schritte, :readiness, :raw)
        ON CONFLICT (datum) DO UPDATE SET
            ruhepuls = excluded.ruhepuls,
            hrv_letzte_nacht = excluded.hrv_letzte_nacht,
            hrv_status = excluded.hrv_status,
            schlaf_dauer_s = excluded.schlaf_dauer_s,
            schlaf_score = excluded.schlaf_score,
            tiefschlaf_s = excluded.tiefschlaf_s,
            rem_s = excluded.rem_s,
            stress_avg = excluded.stress_avg,
            body_battery_min = excluded.body_battery_min,
            body_battery_max = excluded.body_battery_max,
            schritte = excluded.schritte,
            training_readiness = excluded.training_readiness,
            raw = excluded.raw
        """,
        datum=datum,
        rhr=stats.get("restingHeartRate"),
        hrv=hrv_summary.get("lastNightAvg"),
        hrv_status=hrv_summary.get("status"),
        schlaf_s=schlaf.get("sleepTimeSeconds") or stats.get("sleepingSeconds"),
        schlaf_score=score,
        tief=schlaf.get("deepSleepSeconds"),
        rem=schlaf.get("remSleepSeconds"),
        stress=stats.get("averageStressLevel"),
        bb_min=stats.get("bodyBatteryLowestValue"),
        bb_max=stats.get("bodyBatteryHighestValue"),
        schritte=stats.get("totalSteps"),
        readiness=readiness_score,
        raw=json.dumps({"stats": stats}),
    )

    # Schlaf-Nacht (eigene Tabelle). Darf den Gesundheits-Tag nie verwerfen,
    # auch nicht, solange die Schlaf-Migration noch fehlt. Bewusst ohne Log:
    # die Fehlermeldung könnte Schlafwerte enthalten.
    try:
        return _schlaf_nacht(con, garmin, datum, sd, hrv)
    except Exception:  # noqa: BLE001
        return False


def sync_health(con, garmin, heute=None) -> dict:
    """Ein Chunk Gesundheits-Tage (ältester fehlender Tag zuerst)."""
    start_ts = time.monotonic()
    heute = heute or dt.date.today()
    state = dbmod.get_sync_state(con, "health") or {}
    last = state.get("lastDate")
    if last:
        # Die letzten 2 Tage immer erneut synchen (Daten trudeln nach, die
        # Nacht hängt am Aufwachdatum), dann weiter
        start = min(dt.date.fromisoformat(last), heute - dt.timedelta(days=1))
    else:
        start = heute - dt.timedelta(days=HEALTH_BACKFILL_TAGE)

    tag = start
    verarbeitet = 0
    schlaf_daten = []
    while tag <= heute and verarbeitet < HEALTH_CHUNK_TAGE:
        if time.monotonic() - start_ts > ZEIT_BUDGET_S:
            break
        if _health_tag(con, garmin, tag.isoformat()):
            schlaf_daten.append(tag.isoformat())
        state["lastDate"] = tag.isoformat()
        dbmod.set_sync_state(con, "health", state)
        tag += dt.timedelta(days=1)
        verarbeitet += 1

    has_more = dt.date.fromisoformat(state.get("lastDate", heute.isoformat())) < heute
    state["lastSyncAt"] = dt.datetime.utcnow().isoformat() + "Z"
    dbmod.set_sync_state(con, "health", state)
    return {
        "verarbeitet": verarbeitet,
        "hasMore": has_more,
        "state": state,
        "schlafDaten": schlaf_daten,  # nur Datumsstrings, keine Werte
    }


# ------------------------------------------------------------------ Schlaf
#
# Python speichert nur die Garmin-Direktwerte + die kompakte Rohantwort in
# sleep_nights. Die Aufbereitung in Epochen/Zeitreihen macht EIN Parser in
# TypeScript (lib/engine/schlaf-parser.ts) beim Recompute. Datenschutz:
# Schlafwerte werden nirgends geloggt und tauchen in keiner Fehlermeldung auf.

SCHLAF_CHUNK_NAECHTE = 15
SCHLAF_ZEIT_BUDGET_S = 30  # Rest der 60 s braucht die Aufbereitung in Next
SCHLAF_RAW_MAX_BYTES = 1_000_000
SCHLAF_BACKFILL_TAGE = HEALTH_BACKFILL_TAGE

TAGES_ENDPUNKT_HINWEIS = (
    "Ersatzreihen aus Tages-Endpunkten: diese liefern erst ab lokal 00:00, "
    "der Teil der Nacht vor Mitternacht fehlt."
)

# metrik → (Liste in get_sleep_data, Summenfeld, das belegt, dass Garmin die
# Metrik in dieser Nacht gemessen hat). Fehlt die Liste trotz Summenwert,
# wird der Tages-Endpunkt als Ersatz geholt — sonst nicht (Rate-Limit).
SCHLAF_REIHEN = {
    "hr": ("sleepHeartRate", "avgHeartRate"),
    "spo2": ("wellnessEpochSPO2DataDTOList", "averageSpO2Value"),
    "atemfrequenz": ("wellnessEpochRespirationDataDTOList", "averageRespirationValue"),
    "stress": ("sleepStress", "avgSleepStress"),
    "body_battery": ("sleepBodyBattery", None),  # Beleg: sd.bodyBatteryChange
    "hrv": ("hrvData", None),  # Ersatz aus get_hrv_data().hrvReadings (kein Zusatzaufruf)
}


def _num(v):
    """Zahl oder None (bool und nicht-endliche Werte zählen nicht)."""
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return None
    if v != v or v in (float("inf"), float("-inf")):
        return None
    return v


def _nicht_negativ(v):
    v = _num(v)
    return v if v is not None and v >= 0 else None


def _iso_utc_ms(s):
    """Garmin-ISO ohne Zone (= UTC), z. B. "2026-11-03T21:40:17.0" → ms."""
    if not isinstance(s, str) or len(s) < 19:
        return None
    try:
        basis = dt.datetime.strptime(s[:19].replace(" ", "T"), "%Y-%m-%dT%H:%M:%S")
    except ValueError:
        return None
    rest = s[19:]
    ms = 0.0
    if rest.startswith("."):
        ziffern = ""
        for ch in rest[1:]:
            if not ch.isdigit():
                break
            ziffern += ch
        ms = float("0." + ziffern) * 1000 if ziffern else 0.0
    return int(basis.replace(tzinfo=dt.timezone.utc).timestamp() * 1000 + ms)


def _ms_zu_utc(ms):
    ms = _num(ms)
    if ms is None or ms <= 0:
        return None
    return dt.datetime.fromtimestamp(ms / 1000.0, tz=dt.timezone.utc)


def _schlaf_dto(sd):
    dto = (sd or {}).get("dailySleepDTO") if isinstance(sd, dict) else None
    return dto if isinstance(dto, dict) else None


def _hat_nacht(sd) -> bool:
    """Leere Nacht = kein dailySleepDTO oder keine (positive) Schlafzeit."""
    dto = _schlaf_dto(sd)
    if not dto:
        return False
    dauer = _num(dto.get("sleepTimeSeconds"))
    return dauer is not None and dauer > 0


def _schlaf_fenster(dto):
    """(start_ms, ende_ms) als echte UTC-Instants oder None."""
    s = _num((dto or {}).get("sleepStartTimestampGMT"))
    e = _num((dto or {}).get("sleepEndTimestampGMT"))
    if s is None or e is None or e <= s:
        return None
    return int(s), int(e)


def _descriptor_index(descs, key, default):
    """Index einer Spalte aus Garmins *Descriptor*-Listen (Schlüsselnamen variieren)."""
    for d in descs or []:
        if not isinstance(d, dict) or key not in d.values():
            continue
        for k, v in d.items():
            if k.lower().endswith("index") and isinstance(v, int):
                return v
    return default


def _paare_im_fenster(zeilen, ts_index, wert_index, fenster):
    """[[ms, wert], …] aus Tages-Arrays, auf das Schlaffenster gefiltert.
    Lücken (None, negative Platzhalter wie -1/-2) fallen weg."""
    start, ende = fenster
    out = []
    for z in zeilen or []:
        if not isinstance(z, (list, tuple)) or len(z) <= max(ts_index, wert_index):
            continue
        t = _num(z[ts_index])
        w = _nicht_negativ(z[wert_index])
        if t is None or w is None or t < start or t > ende:
            continue
        out.append([int(t), w])
    return out


def _tages_reihe(metrik, antwort, fenster):
    """Ersatzreihe aus der Antwort eines Tages-Endpunkts (Formate siehe
    tests/fixtures/garmin/*/get_*.json)."""
    if metrik == "hr" and isinstance(antwort, dict):
        i = _descriptor_index(antwort.get("heartRateValueDescriptors"), "heartrate", 1)
        return _paare_im_fenster(antwort.get("heartRateValues"), 0, i, fenster)
    if metrik == "atemfrequenz" and isinstance(antwort, dict):
        i = _descriptor_index(
            antwort.get("respirationValueDescriptorsDTOList"), "respiration", 1
        )
        return _paare_im_fenster(antwort.get("respirationValuesArray"), 0, i, fenster)
    if metrik == "stress" and isinstance(antwort, dict):
        i = _descriptor_index(antwort.get("stressValueDescriptorsDTOList"), "stressLevel", 1)
        return _paare_im_fenster(antwort.get("stressValuesArray"), 0, i, fenster)
    if metrik == "spo2" and isinstance(antwort, dict):
        # Nur Stundenmittel verfügbar ([ms, wert]); feiner liefert der Endpunkt nichts
        return _paare_im_fenster(antwort.get("spO2HourlyAverages"), 0, 1, fenster)
    if metrik == "body_battery":
        eintraege = antwort if isinstance(antwort, list) else [antwort]
        out = []
        for e in eintraege:
            if not isinstance(e, dict):
                continue
            i = _descriptor_index(
                e.get("bodyBatteryValueDescriptorDTOList"), "bodyBatteryLevel", 1
            )
            out += _paare_im_fenster(e.get("bodyBatteryValuesArray"), 0, i, fenster)
        return out
    return []


def _hrv_aus_readings(hrv, fenster):
    start, ende = fenster
    out = []
    for r in (hrv or {}).get("hrvReadings") or []:
        if not isinstance(r, dict):
            continue
        t = _iso_utc_ms(r.get("readingTimeGMT"))
        w = _nicht_negativ(r.get("hrvValue"))
        if t is None or w is None or t < start or t > ende:
            continue
        out.append([t, w])
    return out


TAGES_ENDPUNKTE = {
    "hr": ("get_heart_rates", lambda g, d: g.get_heart_rates(d)),
    "spo2": ("get_spo2_data", lambda g, d: g.get_spo2_data(d)),
    "atemfrequenz": ("get_respiration_data", lambda g, d: g.get_respiration_data(d)),
    "stress": ("get_all_day_stress", lambda g, d: g.get_all_day_stress(d)),
    "body_battery": ("get_body_battery", lambda g, d: g.get_body_battery(d)),
}


def _schlaf_zusatz(garmin, datum, sd, hrv):
    """Ersatzreihen für Metriken, die in get_sleep_data fehlen, obwohl Garmin
    sie gemessen hat. Rückgabe {"hinweis", "quellen", metrik: [[ms, wert]]}
    oder None. Jeder Tages-Aufruf hat Pausen und ein eigenes try/except."""
    dto = _schlaf_dto(sd)
    fenster = _schlaf_fenster(dto)
    if not fenster:
        return None
    zusatz = {}
    quellen = {}
    for metrik, (liste, beleg) in SCHLAF_REIHEN.items():
        vorhanden = sd.get(liste)
        if isinstance(vorhanden, list) and vorhanden:
            continue
        if metrik == "hrv":
            punkte = _hrv_aus_readings(hrv, fenster)
            quelle = "get_hrv_data"
        else:
            gemessen = (
                _num(sd.get("bodyBatteryChange")) is not None
                if beleg is None
                else _num(dto.get(beleg)) is not None
            )
            if not gemessen:
                continue
            quelle, holen = TAGES_ENDPUNKTE[metrik]
            _pause()
            try:
                punkte = _tages_reihe(metrik, holen(garmin, datum), fenster)
            except Exception:  # noqa: BLE001 — ein fehlender Teil verwirft nicht die Nacht
                punkte = []
            _pause()
        if punkte:
            zusatz[metrik] = punkte
            quellen[metrik] = quelle
    if not zusatz:
        return None
    zusatz["quellen"] = quellen
    zusatz["hinweis"] = TAGES_ENDPUNKT_HINWEIS
    return zusatz


def _raw_kompakt(sd, zusatz=None):
    """get_sleep_data als kompaktes JSON (≤ SCHLAF_RAW_MAX_BYTES). Zu gross →
    grösste Listen (zuerst sleepMovement) weglassen und in _gekuerzt vermerken."""
    raw = dict(sd)
    if zusatz:
        raw["zusatz"] = zusatz
    text = json.dumps(raw, separators=(",", ":"))
    gekuerzt = []
    while len(text.encode("utf-8")) > SCHLAF_RAW_MAX_BYTES:
        listen = [k for k, v in raw.items() if isinstance(v, list) and v]
        if not listen:
            break
        k = (
            "sleepMovement"
            if "sleepMovement" in listen
            else max(listen, key=lambda x: len(json.dumps(raw[x], separators=(",", ":"))))
        )
        del raw[k]
        gekuerzt.append(k)
        raw["_gekuerzt"] = gekuerzt
        text = json.dumps(raw, separators=(",", ":"))
    return text


def _schlaf_nacht_speichern(con, datum, sd, hrv, zusatz=None) -> bool:
    """Upsert einer Nacht in sleep_nights. Fehlendes bleibt NULL (nie 0).
    Leere Nacht → keine Zeile; eine bestehende Zeile bleibt unangetastet."""
    if not _hat_nacht(sd):
        return False
    dto = _schlaf_dto(sd)
    fenster = _schlaf_fenster(dto)
    scores = dto.get("sleepScores") if isinstance(dto.get("sleepScores"), dict) else {}
    overall = scores.get("overall") if isinstance(scores.get("overall"), dict) else {}
    summary = (hrv or {}).get("hrvSummary") if isinstance(hrv, dict) else None
    con.run(
        """
        INSERT INTO sleep_nights (datum, schlaf_start, schlaf_ende, garmin_score,
            schlaf_dauer_s, tief_s, leicht_s, rem_s, wach_s, raw, hrv_baseline,
            zuletzt_synchronisiert)
        VALUES (:datum, :start, :ende, :score, :dauer, :tief, :leicht, :rem,
            :wach, CAST(:raw AS jsonb), CAST(:hrv AS jsonb), now())
        ON CONFLICT (datum) DO UPDATE SET
            schlaf_start = excluded.schlaf_start,
            schlaf_ende = excluded.schlaf_ende,
            garmin_score = excluded.garmin_score,
            schlaf_dauer_s = excluded.schlaf_dauer_s,
            tief_s = excluded.tief_s,
            leicht_s = excluded.leicht_s,
            rem_s = excluded.rem_s,
            wach_s = excluded.wach_s,
            raw = excluded.raw,
            hrv_baseline = COALESCE(excluded.hrv_baseline, sleep_nights.hrv_baseline),
            zuletzt_synchronisiert = now()
        """,
        datum=datum,
        start=_ms_zu_utc(fenster[0]) if fenster else None,
        ende=_ms_zu_utc(fenster[1]) if fenster else None,
        score=_nicht_negativ(overall.get("value")),
        dauer=_nicht_negativ(dto.get("sleepTimeSeconds")),
        tief=_nicht_negativ(dto.get("deepSleepSeconds")),
        leicht=_nicht_negativ(dto.get("lightSleepSeconds")),
        rem=_nicht_negativ(dto.get("remSleepSeconds")),
        wach=_nicht_negativ(dto.get("awakeSleepSeconds")),
        raw=_raw_kompakt(sd, zusatz),
        hrv=json.dumps(summary, separators=(",", ":"))
        if isinstance(summary, dict) and summary
        else None,
    )
    return True


def _schlaf_nacht(con, garmin, datum, sd, hrv) -> bool:
    """Ersatzreihen holen (nur falls nötig) und die Nacht speichern."""
    if not _hat_nacht(sd):
        return False
    zusatz = _schlaf_zusatz(garmin, datum, sd, hrv)
    return _schlaf_nacht_speichern(con, datum, sd, hrv, zusatz)


def _http_status(e):
    for quelle in (getattr(e, "error", None), e):
        resp = getattr(quelle, "response", None)
        code = getattr(resp, "status_code", None)
        if isinstance(code, int):
            return code
    return None


def _ist_abbruch_fehler(e) -> bool:
    """Rate-Limit/Login-Probleme → Chunk abbrechen statt Nächte zu überspringen."""
    name = type(e).__name__
    return (
        _http_status(e) in (401, 403, 429)
        or "TooManyRequests" in name
        or "Authentication" in name
    )


def schlaf_backfill_fertig(con):
    """Ergebnis ohne Garmin-Aufruf, falls der Backfill schon durch ist (sonst None)."""
    state = dbmod.get_sync_state(con, "sleep") or {}
    if not state.get("backfillDone"):
        return None
    gesamt = int(state.get("gesamt") or 0)
    return {
        "verarbeitet": 0,
        "hasMore": False,
        "backfillDone": True,
        "fortschritt": {"erledigt": gesamt, "gesamt": gesamt},
        "schlafDaten": [],
        "state": state,
    }


def _ist_schema_fehler(e) -> bool:
    """Fehlende Tabelle/Spalte (Migration nicht angewendet) → abbrechen statt überspringen."""
    text = str(e).lower()
    return "does not exist" in text or "undefined" in type(e).__name__.lower()


def _schlaf_backfill_nacht(con, garmin, datum, state) -> str:
    """Eine Nacht im Backfill: 'geschrieben' | 'leer' | 'fehler'.

    Rate-Limit/Login-Fehler und ein fehlendes Schema brechen den Chunk ab (der
    Cursor bleibt stehen); jeder andere Fehler betrifft nur diese Nacht.
    Fehlertexte enthalten nie Werte aus der Antwort oder der DB.
    """
    try:
        sd = garmin.get_sleep_data(datum) or {}
    except Exception as e:  # noqa: BLE001
        if _ist_abbruch_fehler(e):
            dbmod.set_sync_state(con, "sleep", state)
            raise RuntimeError(
                f"Garmin hat den Schlaf-Abruf abgelehnt ({type(e).__name__}); "
                "später erneut synchronisieren."
            ) from None
        _pause()
        return "fehler"
    _pause()
    if not _hat_nacht(sd):
        return "leer"
    try:
        hrv = garmin.get_hrv_data(datum) or {}
    except Exception:  # noqa: BLE001 — HRV ist optional
        hrv = {}
    _pause()
    try:
        return "geschrieben" if _schlaf_nacht(con, garmin, datum, sd, hrv) else "leer"
    except Exception as e:  # noqa: BLE001
        if _ist_schema_fehler(e):
            dbmod.set_sync_state(con, "sleep", state)
            raise RuntimeError(
                "Schlaf-Tabellen fehlen — Migration drizzle/0002_schlaf.sql anwenden "
                f"({type(e).__name__})"
            ) from None
        return "fehler"


def sync_sleep(con, garmin, heute=None) -> dict:
    """Ein Chunk Schlaf-Backfill: rückwärts ab heute bis heute − 365 Tage.

    Nächte, deren Zeile schon nach dem Aufwachtag synchronisiert wurde (also
    final ist), werden ohne Garmin-Aufruf übersprungen. Ein Fehler bei einer
    einzelnen Nacht überspringt nur diese (Datum in state.fehlgeschlagen);
    Rate-Limit/Login-Fehler brechen den Chunk ab, ohne den Cursor zu bewegen.
    """
    fertig = schlaf_backfill_fertig(con)
    if fertig:
        return fertig

    start_ts = time.monotonic()
    heute = heute or dt.date.today()
    state = dbmod.get_sync_state(con, "sleep") or {}
    if not state.get("cursor"):
        bis = heute - dt.timedelta(days=SCHLAF_BACKFILL_TAGE)
        state = {
            "backfillDone": False,
            "von": heute.isoformat(),
            "bis": bis.isoformat(),
            "cursor": heute.isoformat(),
            "gesamt": SCHLAF_BACKFILL_TAGE + 1,
            "fehlgeschlagen": [],
        }
    von = dt.date.fromisoformat(state["von"])
    bis = dt.date.fromisoformat(state["bis"])
    cursor = dt.date.fromisoformat(state["cursor"])
    gesamt = (von - bis).days + 1
    state["gesamt"] = gesamt

    final = set()
    if cursor >= bis:
        rows = con.run(
            """
            SELECT datum::text FROM sleep_nights
            WHERE datum BETWEEN :bis AND :cursor
              AND zuletzt_synchronisiert >= (datum + 1)::timestamptz
            """,
            bis=bis.isoformat(),
            cursor=cursor.isoformat(),
        )
        final = {r[0] for r in rows or []}

    geschrieben = []
    geholt = 0
    while cursor >= bis and geholt < SCHLAF_CHUNK_NAECHTE:
        if time.monotonic() - start_ts > SCHLAF_ZEIT_BUDGET_S:
            break
        datum = cursor.isoformat()
        if datum not in final:
            geholt += 1
            ergebnis = _schlaf_backfill_nacht(con, garmin, datum, state)
            if ergebnis == "geschrieben":
                geschrieben.append(datum)
            elif ergebnis == "fehler":
                state["fehlgeschlagen"] = (state.get("fehlgeschlagen") or [])[-50:] + [datum]
        cursor -= dt.timedelta(days=1)
        state["cursor"] = cursor.isoformat()

    # Nach dem Durchlauf: fehlgeschlagene Nächte genau einmal erneut versuchen,
    # erst danach gilt der Backfill als fertig. Was dann noch scheitert, bleibt
    # in state.endgueltigFehlgeschlagen (nur Datumsstrings) dokumentiert.
    while cursor < bis and state.get("fehlgeschlagen") and geholt < SCHLAF_CHUNK_NAECHTE:
        if time.monotonic() - start_ts > SCHLAF_ZEIT_BUDGET_S:
            break
        datum = state["fehlgeschlagen"].pop(0)
        geholt += 1
        ergebnis = _schlaf_backfill_nacht(con, garmin, datum, state)
        if ergebnis == "geschrieben":
            geschrieben.append(datum)
        elif ergebnis == "fehler":
            state["endgueltigFehlgeschlagen"] = (
                state.get("endgueltigFehlgeschlagen") or []
            )[-50:] + [datum]
        dbmod.set_sync_state(con, "sleep", state)

    if cursor < bis and not state.get("fehlgeschlagen"):
        state["backfillDone"] = True
    state["lastSyncAt"] = dt.datetime.utcnow().isoformat() + "Z"
    dbmod.set_sync_state(con, "sleep", state)
    erledigt = min(gesamt, (von - cursor).days)
    return {
        "verarbeitet": geholt,
        "hasMore": not state["backfillDone"],
        "backfillDone": bool(state["backfillDone"]),
        "fortschritt": {"erledigt": erledigt, "gesamt": gesamt},
        "schlafDaten": geschrieben,
        "state": state,
    }


# ---------------------------------------------------------------- HF-Zonen

# Connect liefert die Zonen je nach Konto/Version unter verschiedenen Pfaden.
# Der erste Pfad, der verwertbare Zonen liefert, gewinnt.
ZONEN_ENDPOINTS = (
    "/biometric-service/heartRateZones",
    "/biometric-service/heartRateZones/all",
    "/userprofile-service/userprofile/heart-rate-zones",
)


def _zahl(v):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if f > 0 else None


def _sammle_zonen(payload):
    """Zonen-Objekte aus beliebig verschachtelter Antwort einsammeln.

    Robust gegen Formatwechsel der inoffiziellen API: gesucht wird nach
    Objekten, die `zoneNFloor`-Schlüssel tragen — egal wie tief sie liegen.
    """
    treffer = []

    def besuche(o):
        if isinstance(o, dict):
            if any(k in o for k in ("zone1Floor", "zone2Floor")):
                treffer.append(o)
                return
            for v in o.values():
                besuche(v)
        elif isinstance(o, list):
            for v in o:
                besuche(v)

    besuche(payload)

    out = []
    for z in treffer:
        floors = {f"zone{i}Floor": _zahl(z.get(f"zone{i}Floor")) for i in range(1, 6)}
        if any(v is None for v in floors.values()):
            continue
        sport = z.get("sport") or z.get("sportType") or z.get("sportTypeKey") or "DEFAULT"
        out.append(
            {
                "sport": str(sport).upper(),
                **floors,
                "maxHeartRateUsed": _zahl(
                    z.get("maxHeartRateUsed") or z.get("maxHeartRate")
                ),
                "restingHrUsed": _zahl(
                    z.get("restingHrUsed") or z.get("restingHeartRate")
                ),
                "lactateThresholdHeartRate": _zahl(
                    z.get("lactateThresholdHeartRate")
                    or z.get("lactateThresholdHeartRateInBpm")
                ),
            }
        )
    return out


def sync_hr_zonen(con, garmin) -> dict:
    """Die auf der Uhr gültigen HF-Zonen holen und in app_settings ablegen.

    Damit rechnet die App mit denselben Grenzen wie Garmin — sonst meint
    „Zone 2" im Plan einen anderen Bereich als „Zone 2" in der Aktivität.
    Ein einziger Request; hasMore ist immer False.
    """
    zonen = []
    fehler = None

    holen = getattr(garmin, "get_heart_rate_zones", None)
    if callable(holen):
        try:
            zonen = _sammle_zonen(holen())
        except Exception as e:  # noqa: BLE001
            fehler = str(e)

    if not zonen:
        for pfad in ZONEN_ENDPOINTS:
            try:
                zonen = _sammle_zonen(garmin.garth.connectapi(pfad))
            except Exception as e:  # noqa: BLE001
                fehler = str(e)
                zonen = []
            _pause()
            if zonen:
                fehler = None
                break

    if not zonen:
        return {
            "verarbeitet": 0,
            "hasMore": False,
            "state": {"ok": False, "fehler": fehler or "keine Zonen gefunden"},
        }

    daten = {
        "aktualisiert": dt.datetime.utcnow().isoformat() + "Z",
        "sportarten": zonen,
    }
    dbmod.set_app_setting(con, "garmin_hr_zonen", daten)
    return {
        "verarbeitet": len(zonen),
        "hasMore": False,
        "state": {"ok": True, "sportarten": [z["sport"] for z in zonen]},
    }


def resync_activity(con, garmin, activity_id) -> dict:
    """Einzelne Aktivität frisch von Garmin holen und lokal aktualisieren.

    Aktualisiert nur Garmin-Felder (Summary via COALESCE — überschreibt nie
    mit NULL) und erzwingt frische Streams + Kraftsätze. Manuell gepflegte
    Spalten werden nicht aufgeführt und bleiben damit erhalten.
    Rückgabe-Codes: not_local, not_found_at_garmin.
    """
    rows = con.run("SELECT typ FROM activities WHERE id = :id", id=activity_id)
    if not rows:
        return {"ok": False, "code": "not_local"}
    typ_local = rows[0][0]

    try:
        detail = garmin.garth.connectapi(
            f"/activity-service/activity/{activity_id}"
        )
    except Exception:
        detail = None
    if not detail:
        return {"ok": False, "code": "not_found_at_garmin"}
    _pause()

    s = detail.get("summaryDTO") or {}
    typ = ((detail.get("activityTypeDTO") or {}).get("typeKey")) or typ_local
    speed = s.get("averageSpeed") or 0
    pace = (1000.0 / speed) if speed and speed > 0.5 else None

    con.run(
        """
        UPDATE activities SET
            name = COALESCE(:name, name),
            typ = COALESCE(:typ, typ),
            dauer_s = COALESCE(:dauer, dauer_s),
            distanz_m = COALESCE(:dist, distanz_m),
            hm_auf = COALESCE(:hmauf, hm_auf),
            hm_ab = COALESCE(:hmab, hm_ab),
            avg_hr = COALESCE(:ahr, avg_hr),
            max_hr = COALESCE(:mhr, max_hr),
            avg_pace = COALESCE(:pace, avg_pace),
            kalorien = COALESCE(:kal, kalorien),
            avg_kadenz = COALESCE(:kad, avg_kadenz),
            trainingseffekt_aerob = COALESCE(:tea, trainingseffekt_aerob),
            trainingseffekt_anaerob = COALESCE(:tean, trainingseffekt_anaerob),
            raw = :raw,
            synced_at = now()
        WHERE id = :id
        """,
        id=activity_id,
        name=detail.get("activityName"),
        typ=typ,
        dauer=s.get("duration"),
        dist=s.get("distance"),
        hmauf=s.get("elevationGain"),
        hmab=s.get("elevationLoss"),
        ahr=s.get("averageHR"),
        mhr=s.get("maxHR"),
        pace=pace,
        kal=s.get("calories"),
        kad=s.get("averageRunCadence"),
        tea=s.get("trainingEffect"),
        tean=s.get("anaerobicTrainingEffect"),
        raw=json.dumps(detail),
    )

    # Streams erzwingen (nicht an _hat_streams vorbei-skippen)
    try:
        _lade_streams(con, garmin, activity_id)
    except Exception:
        pass
    if "strength" in typ or "fitness" in typ:
        try:
            _lade_kraft_saetze(con, garmin, activity_id)
        except Exception:
            pass
    return {"ok": True}
