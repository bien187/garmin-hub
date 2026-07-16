"""Postgres-Zugriff über pg8000 (pure Python, Vercel-kompatibel)."""
import json
import os
import ssl
from urllib.parse import urlparse, parse_qs

import pg8000.native


def connect() -> pg8000.native.Connection:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL ist nicht gesetzt")
    p = urlparse(url)
    query = parse_qs(p.query)
    ssl_ctx = None
    if query.get("sslmode", ["require"])[0] != "disable":
        ssl_ctx = ssl.create_default_context()
        # Supabase Pooler nutzt Zertifikate, die je nach Region nicht im
        # Standard-Store validierbar sind — Verschlüsselung ja, Peer-Check nein
        ssl_ctx.check_hostname = False
        ssl_ctx.verify_mode = ssl.CERT_NONE
    return pg8000.native.Connection(
        user=p.username or "postgres",
        password=p.password or "",
        host=p.hostname or "localhost",
        port=p.port or 5432,
        database=(p.path or "/postgres").lstrip("/"),
        ssl_context=ssl_ctx,
    )


def get_sync_state(con, key: str):
    rows = con.run("SELECT value FROM sync_state WHERE key = :k", k=key)
    if not rows:
        return None
    value = rows[0][0]
    return json.loads(value) if isinstance(value, str) else value


def set_sync_state(con, key: str, value: dict):
    con.run(
        """
        INSERT INTO sync_state (key, value, aktualisiert)
        VALUES (:k, :v, now())
        ON CONFLICT (key) DO UPDATE SET value = :v, aktualisiert = now()
        """,
        k=key,
        v=json.dumps(value),
    )


def append_sync_log(con, eintrag: dict):
    log = get_sync_state(con, "log") or {"eintraege": []}
    log["eintraege"] = (log.get("eintraege", []) + [eintrag])[-30:]
    set_sync_state(con, "log", log)
