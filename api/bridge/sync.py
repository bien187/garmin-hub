"""POST /api/bridge/sync — ein Sync-Chunk (Aktivitäten oder Health).

Body: {"typ": "activities" | "health"}
Antwort: {"ok": true, "typ": ..., "verarbeitet": n, "hasMore": bool}
"""
import datetime as dt
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
            typ = body.get("typ", "activities")
            con = dbmod.connect()
            try:
                garmin = get_client(con)
                if typ == "health":
                    result = sync_logic.sync_health(con, garmin)
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

        self._run(run)
