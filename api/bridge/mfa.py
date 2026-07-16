"""POST /api/bridge/mfa — Login mit MFA-Code abschliessen.

Body: {"code": "123456"}
Führt einen frischen Login mit dem Code durch und persistiert die Token.
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
            code = (body.get("code") or "").strip()
            if not code:
                return {"ok": False, "error": "code fehlt"}
            con = dbmod.connect()
            try:
                garmin = get_client(con, mfa_code=code)
                return {"ok": True, "displayName": getattr(garmin, "display_name", None)}
            finally:
                con.close()

        self._run(run)
