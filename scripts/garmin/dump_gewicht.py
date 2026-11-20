"""Debug-Dump der rohen Garmin-Gewichtsantworten als Test-Fixtures.

Holt fuer den Zeitraum (Standard: die letzten 30 Tage) die echten Antworten
von get_weigh_ins(start, ende), get_daily_weigh_ins(ende) und
get_body_composition(start, ende) und schreibt sie nach
tests/fixtures/garmin/gewicht-<ende>/<methode>.json. Damit lassen sich die
Feldnamen des Parsers (_gewicht_eintraege/_gewicht_zeile in
api/_lib/sync_logic.py) an echten Antworten pruefen.

Personendaten (Namen, E-Mail, Profil- und Geraete-IDs) werden vorher entfernt.
Gewichtswerte sind sensibel: die Fixtures nur lokal pruefen, nicht committen,
wenn echte Werte darin stehen.

Liegt bewusst NICHT unter api/: Vercel wuerde jede .py-Datei dort als
Serverless-Function deployen.

Aufruf (lokal, nutzt die Token aus der DB, kein frischer Login):
    python scripts/garmin/dump_gewicht.py [START ENDE]
"""
import datetime as dt
import json
import os
import sys
import time

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "api"))


def _lade_env():
    pfad = os.path.join(ROOT, ".env.local")
    if not os.path.exists(pfad):
        return
    with open(pfad, encoding="utf-8") as f:
        for zeile in f:
            zeile = zeile.strip()
            if not zeile or zeile.startswith("#") or "=" not in zeile:
                continue
            k, v = zeile.split("=", 1)
            v = v.strip().strip('"').strip("'")
            os.environ.setdefault(k.strip(), v)


_lade_env()

from _lib import db as dbmod  # noqa: E402
from _lib.garmin_client import get_client  # noqa: E402

# Schluessel, deren Werte Personen oder Geraete identifizieren
PII_SCHLUESSEL = {
    "userprofilepk", "userprofileid", "userprofilenumber", "userid",
    "displayname", "fullname", "username", "email", "emailaddress",
    "deviceid", "unitid", "serialnumber", "profileimageurllarge",
    "profileimageurlmedium", "profileimageurlsmall", "ownerid",
    "ownerdisplayname", "ownerfullname", "deviceidlist", "uuid",
}


def _scrub(obj):
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            if k.lower() in PII_SCHLUESSEL:
                out[k] = 0 if isinstance(v, (int, float)) and not isinstance(v, bool) else "redacted"
            else:
                out[k] = _scrub(v)
        return out
    if isinstance(obj, list):
        return [_scrub(v) for v in obj]
    return obj


def _aufrufe(garmin, start, ende):
    return {
        "get_weigh_ins": lambda: garmin.get_weigh_ins(start, ende),
        "get_daily_weigh_ins": lambda: garmin.get_daily_weigh_ins(ende),
        "get_body_composition": lambda: garmin.get_body_composition(start, ende),
    }


def main(start, ende):
    con = dbmod.connect()
    try:
        garmin = get_client(con)
    finally:
        con.close()
    ziel = os.path.join(ROOT, "tests", "fixtures", "garmin", f"gewicht-{ende}")
    os.makedirs(ziel, exist_ok=True)
    for name, fn in _aufrufe(garmin, start, ende).items():
        try:
            daten = fn()
            status = "ok" if daten else "leer"
        except Exception as e:  # noqa: BLE001
            daten = {"__fehler__": type(e).__name__}
            status = f"fehler {type(e).__name__}"
        with open(os.path.join(ziel, f"{name}.json"), "w", encoding="utf-8") as f:
            json.dump(_scrub(daten), f, ensure_ascii=False, indent=1)
        # Nur Status, keine Werte ausgeben (Gewichtsdaten sind sensibel)
        print(f"{name}: {status}")
        time.sleep(0.4)


if __name__ == "__main__":
    args = sys.argv[1:]
    if len(args) == 2:
        main(args[0], args[1])
    else:
        heute = dt.date.today()
        main((heute - dt.timedelta(days=30)).isoformat(), heute.isoformat())
