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


def _health_tag(con, garmin, datum: str):
    stats = {}
    schlaf = {}
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
        schlaf = {}
    _pause()
    try:
        hrv = garmin.get_hrv_data(datum) or {}
        hrv_summary = hrv.get("hrvSummary") or {}
    except Exception:
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


def sync_health(con, garmin) -> dict:
    """Ein Chunk Gesundheits-Tage (ältester fehlender Tag zuerst)."""
    start_ts = time.monotonic()
    heute = dt.date.today()
    state = dbmod.get_sync_state(con, "health") or {}
    last = state.get("lastDate")
    if last:
        # letzten Tag erneut synchen (Daten trudeln nach), dann weiter
        start = dt.date.fromisoformat(last)
    else:
        start = heute - dt.timedelta(days=HEALTH_BACKFILL_TAGE)

    tag = start
    verarbeitet = 0
    while tag <= heute and verarbeitet < HEALTH_CHUNK_TAGE:
        if time.monotonic() - start_ts > ZEIT_BUDGET_S:
            break
        _health_tag(con, garmin, tag.isoformat())
        state["lastDate"] = tag.isoformat()
        dbmod.set_sync_state(con, "health", state)
        tag += dt.timedelta(days=1)
        verarbeitet += 1

    has_more = dt.date.fromisoformat(state.get("lastDate", heute.isoformat())) < heute
    state["lastSyncAt"] = dt.datetime.utcnow().isoformat() + "Z"
    dbmod.set_sync_state(con, "health", state)
    return {"verarbeitet": verarbeitet, "hasMore": has_more, "state": state}


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
