"""Debug-Dump der rohen Garmin-Schlafantworten als Test-Fixtures.

Holt fuer die angegebenen Tage (Standard: heute = letzte Nacht und heute − 7)
die echten Antworten von get_sleep_data, get_spo2_data, get_respiration_data,
get_hrv_data, get_all_day_stress, get_heart_rates und get_body_battery und
schreibt sie nach tests/fixtures/garmin/<datum>/<methode>.json.

Personendaten (Namen, E-Mail, Profil- und Geraete-IDs) werden vorher entfernt.

Liegt bewusst NICHT unter api/: Vercel wuerde jede .py-Datei dort als
Serverless-Function deployen.

Aufruf (lokal, nutzt die Token aus der DB, kein frischer Login):
    python scripts/garmin/dump_sleep.py [YYYY-MM-DD ...]
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


def _aufrufe(garmin, datum):
    return {
        "get_sleep_data": lambda: garmin.get_sleep_data(datum),
        "get_spo2_data": lambda: garmin.get_spo2_data(datum),
        "get_respiration_data": lambda: garmin.get_respiration_data(datum),
        "get_hrv_data": lambda: garmin.get_hrv_data(datum),
        "get_all_day_stress": lambda: garmin.get_all_day_stress(datum),
        "get_heart_rates": lambda: garmin.get_heart_rates(datum),
        "get_body_battery": lambda: garmin.get_body_battery(datum, datum),
    }


def main(tage):
    con = dbmod.connect()
    try:
        garmin = get_client(con)
    finally:
        con.close()
    for datum in tage:
        ziel = os.path.join(ROOT, "tests", "fixtures", "garmin", datum)
        os.makedirs(ziel, exist_ok=True)
        for name, fn in _aufrufe(garmin, datum).items():
            try:
                daten = fn()
                status = "ok" if daten else "leer"
            except Exception as e:  # noqa: BLE001
                daten = {"__fehler__": type(e).__name__}
                status = f"fehler {type(e).__name__}"
            with open(os.path.join(ziel, f"{name}.json"), "w", encoding="utf-8") as f:
                json.dump(_scrub(daten), f, ensure_ascii=False, indent=1)
            # Nur Status, keine Werte ausgeben (Schlafdaten sind sensibel)
            print(f"{datum} {name}: {status}")
            time.sleep(0.4)


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args:
        heute = dt.date.today()
        args = [heute.isoformat(), (heute - dt.timedelta(days=7)).isoformat()]
    main(args)
