"""POST /api/bridge/resync_activity — eine Aktivität frisch von Garmin holen.

Body: {"activityId": 123456789}
Aktualisiert Garmin-Felder (COALESCE), erzwingt frische Streams + Kraftsätze.
Rückgabe u.a. code=not_found_at_garmin, wenn die Aktivität bei Garmin fehlt.
"""
import os
import sys

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from _lib import db as dbmod  # noqa: E402
from _lib import sync_logic  # noqa: E402
from _lib.garmin_client import get_client  # noqa: E402
from _lib.handler_base import BridgeHandler  # noqa: E402


class handler(BridgeHandler):
    def do_POST(self):
        def run():
            body = self._json_body()
            activity_id = body.get("activityId")
            if not activity_id:
                return {"ok": False, "error": "activityId fehlt"}
            con = dbmod.connect()
            try:
                garmin = get_client(con)
                return sync_logic.resync_activity(con, garmin, int(activity_id))
            finally:
                con.close()

        self._run(run)
