"""/api/bridge?aktion=<name> — die einzige Python-Function der Garmin-Bridge.

Aktionen: sync, mfa, push_course, push_workout, unpush_workout,
resync_activity (POST) und status (GET); Details in
api/_lib/bridge_aktionen.py. Eine Function statt sieben, weil Vercel Hobby
höchstens 12 Serverless Functions pro Deployment erlaubt.

Die Aktion kommt aus dem Query-Parameter `aktion`; ersatzweise aus dem
letzten Pfadsegment (/api/bridge/<name>), damit auch umgeschriebene Pfade
funktionieren. Geschützt per x-internal-key (BridgeHandler).
"""
import os
import sys
from urllib.parse import parse_qs, urlparse

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from _lib.bridge_aktionen import AKTIONEN  # noqa: E402
from _lib.handler_base import BridgeHandler  # noqa: E402


def aktion_aus_pfad(pfad: str):
    url = urlparse(pfad or "")
    q = parse_qs(url.query).get("aktion")
    if q and q[0]:
        return q[0]
    letztes = url.path.rstrip("/").rsplit("/", 1)[-1]
    return letztes if letztes in AKTIONEN else None


class handler(BridgeHandler):
    def _dispatch(self, methode: str):
        if not self._authorized():
            self._send(401, {"error": "Ungültiger interner Schlüssel"})
            return
        name = aktion_aus_pfad(self.path)
        eintrag = AKTIONEN.get(name or "")
        if not eintrag:
            self._send(404, {"error": "Unbekannte Bridge-Aktion", "code": "unknown_action"})
            return
        erwartet, fn = eintrag
        if methode != erwartet:
            self._send(405, {"error": f"Methode {methode} nicht erlaubt", "code": "method_not_allowed"})
            return
        self._run(lambda: fn(self._json_body() if methode == "POST" else {}))

    def do_GET(self):
        self._dispatch("GET")

    def do_POST(self):
        self._dispatch("POST")
