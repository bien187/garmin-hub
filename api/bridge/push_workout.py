"""POST /api/bridge/push_workout — Workout anlegen + in den Kalender legen.

Body: {"workout": {…Garmin-Workout-JSON…}, "datum": "2026-07-20"}
Der Kalender-Eintrag sorgt dafür, dass die FR 265 das Workout beim
nächsten Uhren-Sync automatisch erhält.
"""
import os
import sys

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from _lib import db as dbmod  # noqa: E402
from _lib.garmin_client import get_client  # noqa: E402
from _lib.handler_base import BridgeHandler  # noqa: E402


class handler(BridgeHandler):
    def do_POST(self):
        def run():
            body = self._json_body()
            workout = body.get("workout")
            datum = body.get("datum")
            if not workout:
                return {"ok": False, "error": "workout fehlt"}
            con = dbmod.connect()
            try:
                garmin = get_client(con)
                erstellt = garmin.garth.connectapi(
                    "/workout-service/workout", method="POST", json=workout
                )
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
                    "scheduleId": (geplant or {}).get("workoutScheduleId")
                    if isinstance(geplant, dict)
                    else None,
                }
            finally:
                con.close()

        self._run(run)
