"""Aktionen der Garmin-Bridge (früher je eine Function unter api/bridge/*.py).

Vercel Hobby erlaubt höchstens 12 Serverless Functions pro Deployment; die
Next-App belegt bereits 7. Deshalb gibt es nur noch EINE Python-Function
(api/bridge/index.py), die hierher verzweigt. Jede Aktion bekommt den
JSON-Body und liefert ein JSON-serialisierbares dict.
"""
import datetime as dt

from . import db as dbmod
from . import sync_logic
from .garmin_client import get_client


def sync(body: dict) -> dict:
    """Ein Sync-Chunk. Body: {"typ": "activities" | "health" | "schlaf" | "zonen"}

    Antwort: {"ok": true, "typ": ..., "verarbeitet": n, "hasMore": bool}
    health/schlaf zusätzlich "schlafDaten" (Datumsstrings der geschriebenen
    Nächte); schlaf zusätzlich "fortschritt" und "backfillDone".
    """
    typ = body.get("typ", "activities")
    con = dbmod.connect()
    try:
        if typ == "schlaf":
            # Backfill fertig → sofort hasMore=false, ohne Garmin-Login
            fertig = sync_logic.schlaf_backfill_fertig(con)
            if fertig:
                return {"ok": True, "typ": typ, **fertig}
        garmin = get_client(con)
        if typ == "health":
            result = sync_logic.sync_health(con, garmin)
        elif typ == "schlaf":
            result = sync_logic.sync_sleep(con, garmin)
        elif typ == "zonen":
            result = sync_logic.sync_hr_zonen(con, garmin)
        else:
            result = sync_logic.sync_activities(con, garmin)
        dbmod.append_sync_log(
            con,
            {
                "zeit": dt.datetime.utcnow().isoformat() + "Z",
                "typ": typ,
                "verarbeitet": result["verarbeitet"],
                "hasMore": result["hasMore"],
            },
        )
        return {"ok": True, "typ": typ, **result}
    finally:
        con.close()


def mfa(body: dict) -> dict:
    """Login mit MFA-Code abschliessen. Body: {"code": "123456"}"""
    code = (body.get("code") or "").strip()
    if not code:
        return {"ok": False, "error": "code fehlt"}
    con = dbmod.connect()
    try:
        garmin = get_client(con, mfa_code=code)
        return {"ok": True, "displayName": getattr(garmin, "display_name", None)}
    finally:
        con.close()


def push_course(body: dict) -> dict:
    """Course (Route) anlegen. Body: {"course": {…Garmin-Course-JSON…}}"""
    course = body.get("course")
    if not course:
        return {"ok": False, "error": "course fehlt"}
    con = dbmod.connect()
    try:
        garmin = get_client(con)
        erstellt = garmin.garth.connectapi("/course-service/course", method="POST", json=course)
        return {"ok": True, "courseId": (erstellt or {}).get("courseId")}
    finally:
        con.close()


def push_workout(body: dict) -> dict:
    """Workout anlegen + in den Kalender legen.

    Body: {"workout": {…Garmin-Workout-JSON…}, "datum": "2026-07-20"}
    Der Kalender-Eintrag sorgt dafür, dass die FR 265 das Workout beim
    nächsten Uhren-Sync automatisch erhält.
    """
    workout = body.get("workout")
    datum = body.get("datum")
    if not workout:
        return {"ok": False, "error": "workout fehlt"}
    con = dbmod.connect()
    try:
        garmin = get_client(con)
        erstellt = garmin.garth.connectapi("/workout-service/workout", method="POST", json=workout)
        workout_id = (erstellt or {}).get("workoutId")
        geplant = None
        if workout_id and datum:
            geplant = garmin.garth.connectapi(
                f"/workout-service/schedule/{workout_id}",
                method="POST",
                json={"date": datum},
            )
        return {
            "ok": True,
            "workoutId": workout_id,
            "scheduleId": (geplant or {}).get("workoutScheduleId") if isinstance(geplant, dict) else None,
        }
    finally:
        con.close()


def unpush_workout(body: dict) -> dict:
    """Workout + Kalender-Eintrag bei Garmin entfernen. Body: {"workoutId", "scheduleId"}"""
    workout_id = body.get("workoutId")
    schedule_id = body.get("scheduleId")
    con = dbmod.connect()
    try:
        garmin = get_client(con)
        # Zuerst Kalender-Eintrag, dann Workout
        if schedule_id:
            try:
                garmin.garth.connectapi(f"/workout-service/schedule/{schedule_id}", method="DELETE")
            except Exception:
                pass
        if workout_id:
            try:
                garmin.garth.connectapi(f"/workout-service/workout/{workout_id}", method="DELETE")
            except Exception:
                pass
        return {"ok": True}
    finally:
        con.close()


def resync_activity(body: dict) -> dict:
    """Eine Aktivität frisch von Garmin holen. Body: {"activityId": 123456789}

    Aktualisiert Garmin-Felder (COALESCE), erzwingt frische Streams + Kraftsätze.
    Rückgabe u.a. code=not_found_at_garmin, wenn die Aktivität bei Garmin fehlt.
    """
    activity_id = body.get("activityId")
    if not activity_id:
        return {"ok": False, "error": "activityId fehlt"}
    con = dbmod.connect()
    try:
        garmin = get_client(con)
        return sync_logic.resync_activity(con, garmin, int(activity_id))
    finally:
        con.close()


def status(_body: dict) -> dict:
    """Zustand der Garmin-Verbindung (ohne Garmin-API-Call)."""
    con = dbmod.connect()
    try:
        rows = con.run("SELECT aktualisiert FROM garmin_tokens WHERE id = 'default'")
        acts = con.run("SELECT count(*) FROM activities")
        health = con.run("SELECT count(*) FROM daily_health")
        log = dbmod.get_sync_state(con, "log") or {"eintraege": []}
        return {
            "ok": True,
            "verbunden": bool(rows),
            "tokenAktualisiert": rows[0][0].isoformat() if rows else None,
            "anzahlAktivitaeten": acts[0][0],
            "anzahlHealthTage": health[0][0],
            "log": log.get("eintraege", [])[::-1],
        }
    finally:
        con.close()


# Aktion → (HTTP-Methode, Funktion)
AKTIONEN = {
    "sync": ("POST", sync),
    "mfa": ("POST", mfa),
    "push_course": ("POST", push_course),
    "push_workout": ("POST", push_workout),
    "unpush_workout": ("POST", unpush_workout),
    "resync_activity": ("POST", resync_activity),
    "status": ("GET", status),
}
