"""GET /api/bridge/status — Zustand der Garmin-Verbindung (ohne API-Call)."""
import os
import sys

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from _lib import db as dbmod  # noqa: E402
from _lib.handler_base import BridgeHandler  # noqa: E402


class handler(BridgeHandler):
    def do_GET(self):
        def run():
            con = dbmod.connect()
            try:
                rows = con.run(
                    "SELECT aktualisiert FROM garmin_tokens WHERE id = 'default'"
                )
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

        self._run(run)
