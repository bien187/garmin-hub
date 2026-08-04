"""POST /api/bridge/unpush_workout — Workout + Kalender-Eintrag bei Garmin
entfernen (Rückgängig zur Plan-Übertragung).

Body: {"workoutId": 123, "scheduleId": 456}
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
            workout_id = body.get("workoutId")
            schedule_id = body.get("scheduleId")
            con = dbmod.connect()
            try:
                garmin = get_client(con)
                # Zuerst Kalender-Eintrag, dann Workout
                if schedule_id:
                    try:
                        garmin.garth.connectapi(
                            f"/workout-service/schedule/{schedule_id}",
                            method="DELETE",
                        )
                    except Exception:
                        pass
                if workout_id:
                    try:
                        garmin.garth.connectapi(
                            f"/workout-service/workout/{workout_id}",
                            method="DELETE",
                        )
                    except Exception:
                        pass
                return {"ok": True}
            finally:
                con.close()

        self._run(run)
