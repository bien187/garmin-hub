"""POST /api/bridge/push_course — Course (Route) in Garmin Connect anlegen.

Body: {"course": {…Garmin-Course-JSON…}}
Nach dem nächsten Uhren-Sync unter Navigation > Strecken verfügbar.
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
            course = body.get("course")
            if not course:
                return {"ok": False, "error": "course fehlt"}
            con = dbmod.connect()
            try:
                garmin = get_client(con)
                erstellt = garmin.garth.connectapi(
                    "/course-service/course", method="POST", json=course
                )
                return {
                    "ok": True,
                    "courseId": (erstellt or {}).get("courseId"),
                }
            finally:
                con.close()

        self._run(run)
