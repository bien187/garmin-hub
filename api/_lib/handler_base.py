"""Gemeinsame Basis für die Vercel-Python-Functions."""
import json
import os
import traceback
from http.server import BaseHTTPRequestHandler

from .garmin_client import LoginFailed, MfaRequired


class BridgeHandler(BaseHTTPRequestHandler):
    """JSON-Handler mit x-internal-key-Prüfung."""

    def _authorized(self) -> bool:
        expected = os.environ.get("INTERNAL_API_KEY")
        got = self.headers.get("x-internal-key")
        return bool(expected) and got == expected

    def _json_body(self) -> dict:
        length = int(self.headers.get("content-length") or 0)
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw)
        except Exception:
            return {}

    def _send(self, status: int, payload: dict):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _run(self, fn):
        if not self._authorized():
            self._send(401, {"error": "Ungültiger interner Schlüssel"})
            return
        try:
            result = fn()
            self._send(200, result)
        except MfaRequired:
            self._send(401, {"error": "MFA-Code erforderlich", "code": "mfa_required"})
        except LoginFailed as e:
            self._send(401, {"error": str(e), "code": "login_failed"})
        except Exception as e:  # noqa: BLE001
            traceback.print_exc()
            self._send(500, {"error": f"{type(e).__name__}: {e}", "code": "internal"})

    def log_message(self, *args):  # Vercel loggt selbst
        pass
