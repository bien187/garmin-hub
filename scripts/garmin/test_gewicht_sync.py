"""Offline-Test des Gewichts-Syncs in api/_lib/sync_logic.py.

Läuft ohne DB und ohne Garmin: ein Fake-con sammelt SQL + Parameter, ein
Fake-Garmin liefert Antworten in den Formen der Weight-Service-Endpunkte
(Range mit dailyWeightSummaries/allWeightMetrics, Tagesansicht mit
dateWeightList). Gibt keine Gewichtswerte aus (nur ok/Fehlertext).

Aufruf:
    python3 scripts/garmin/test_gewicht_sync.py
"""
import datetime as dt
import json
import os
import sys
import types

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "api"))

# pg8000 wird hier nicht gebraucht (Fake-con) — Stub, falls nicht installiert
if "pg8000" not in sys.modules:
    try:
        import pg8000.native  # noqa: F401
    except ImportError:
        pg = types.ModuleType("pg8000")
        pg.native = types.ModuleType("pg8000.native")
        pg.native.Connection = object
        sys.modules["pg8000"] = pg
        sys.modules["pg8000.native"] = pg.native

from _lib import sync_logic as sl  # noqa: E402

sl._pause = lambda: None


class FakeCon:
    def __init__(self, schema_fehlt=False):
        self.statements = []
        self.state = {}
        self.schema_fehlt = schema_fehlt

    def run(self, sql, **p):
        self.statements.append((" ".join(sql.split()), p))
        if "FROM sync_state" in sql:
            v = self.state.get(p["k"])
            return [[v]] if v is not None else []
        if "INSERT INTO sync_state" in sql:
            self.state[p["k"]] = p["v"]
            return []
        if "INSERT INTO gewicht_messungen" in sql and self.schema_fehlt:
            raise Exception('relation "gewicht_messungen" does not exist')
        return []

    def inserts(self):
        return [p for s, p in self.statements if s.startswith("INSERT INTO gewicht_messungen")]


def messung(pk, ts_ms, gramm, **extra):
    return {
        "samplePk": pk,
        "date": ts_ms + 3600_000,  # Ortszeit (MEZ) als Epoche
        "calendarDate": dt.datetime.fromtimestamp((ts_ms + 3600_000) / 1000, tz=dt.timezone.utc).date().isoformat(),
        "weight": gramm,
        "timestampGMT": ts_ms,
        "sourceType": "INDEX_SCALE",
        **extra,
    }


T0 = int(dt.datetime(2026, 11, 24, 5, 40, tzinfo=dt.timezone.utc).timestamp() * 1000)


class FakeGarmin:
    def __init__(self, antworten=None, fehler=None):
        self.calls = []
        self.antworten = antworten or {}
        self.fehler = fehler

    def get_weigh_ins(self, von, bis):
        self.calls.append((von, bis))
        if self.fehler:
            raise self.fehler
        return self.antworten.get((von, bis), {"dailyWeightSummaries": []})


fehler = []


def pruefe(name, bedingung):
    print(("ok   " if bedingung else "FAIL ") + name)
    if not bedingung:
        fehler.append(name)


# 1) Parser: Range-Antwort mit zwei Messungen an einem Tag + Tagesansicht
range_antwort = {
    "dailyWeightSummaries": [
        {
            "summaryDate": "2026-11-24",
            "numOfWeightEntries": 2,
            "latestWeight": messung(2, T0 + 13 * 3600_000, 82100.0),
            "allWeightMetrics": [
                messung(1, T0, 80500.0, bodyFat=18.2, bodyWater=56.1, muscleMass=35800, boneMass=3600, bmi=24.1),
                messung(2, T0 + 13 * 3600_000, 82100.0),
            ],
        }
    ]
}
eintraege = sl._gewicht_eintraege(range_antwort)
pruefe("Range: beide Messungen des Tages (allWeightMetrics)", len(eintraege) == 2)
pruefe("Tagesansicht: dateWeightList", len(sl._gewicht_eintraege({"dateWeightList": [messung(3, T0, 80000)]})) == 1)
pruefe("Liste und Unsinn", len(sl._gewicht_eintraege([messung(4, T0, 80000), 5])) == 1 and sl._gewicht_eintraege(None) == [])

z = sl._gewicht_zeile(eintraege[0])
pruefe("Gramm → kg", abs(z["kg"] - 80.5) < 1e-9 and abs(z["muskel"] - 35.8) < 1e-9 and abs(z["knochen"] - 3.6) < 1e-9)
pruefe("Zeitpunkt aus timestampGMT (UTC)", z["zeitpunkt"].startswith("2026-11-24T05:40:00"))
pruefe("Kalendertag und ID", z["datum"] == "2026-11-24" and z["id"] == "1")
pruefe("Körperzusammensetzung übernommen", z["fett"] == 18.2 and z["wasser"] == 56.1 and z["bmi"] == 24.1)
pruefe("fehlende Werte bleiben None", sl._gewicht_zeile(eintraege[1])["fett"] is None)
ohne_gmt = {k: v for k, v in eintraege[0].items() if k != "timestampGMT"}
pruefe("ohne timestampGMT: date als Zürcher Ortszeit", sl._gewicht_zeile(ohne_gmt)["zeitpunkt"].startswith("2026-11-24T05:40:00"))
pruefe("ohne Gewicht → keine Zeile", sl._gewicht_zeile({"samplePk": 9, "timestampGMT": T0}) is None)

# 2) Sync: Nachlauf + Backfill, mehrere Messungen pro Tag bleiben getrennt
heute = dt.date(2026, 11, 25)
von_nachlauf = (heute - dt.timedelta(days=14)).isoformat()
g = FakeGarmin({(von_nachlauf, heute.isoformat()): range_antwort})
con = FakeCon()
r = sl.sync_gewicht(con, g, heute=heute)
ids = [p["id"] for p in con.inserts()]
pruefe("zwei Messungen desselben Tages einzeln gespeichert", ids[:2] == ["1", "2"])
pruefe("Backfill läuft weiter (hasMore)", r["hasMore"] is True and len(g.calls) == 1 + sl.GEWICHT_CHUNKS_PRO_AUFRUF)
for _ in range(10):
    if not r["hasMore"]:
        break
    r = sl.sync_gewicht(con, g, heute=heute)
pruefe("Backfill endet nach 5 Jahren", r["hasMore"] is False)
aelteste = min(c[0] for c in g.calls)
pruefe("älteste Abfrage = heute − 5 Jahre", aelteste == (heute - dt.timedelta(days=sl.GEWICHT_BACKFILL_TAGE)).isoformat())
pruefe("Nachlauf nicht bei jedem Chunk wiederholt", sum(1 for c in g.calls if c[0] == von_nachlauf) == 1)

# 3) Fehler: Schema fehlt → klare Meldung ohne Werte
try:
    sl.sync_gewicht(FakeCon(schema_fehlt=True), FakeGarmin({(von_nachlauf, heute.isoformat()): range_antwort}), heute=heute)
    pruefe("Schema-Fehler wird gemeldet", False)
except RuntimeError as e:
    pruefe("Schema-Fehler wird gemeldet", "0003_gewicht" in str(e) and "80" not in str(e))


class TooManyRequests(Exception):
    pass


try:
    sl.sync_gewicht(FakeCon(), FakeGarmin(fehler=TooManyRequests()), heute=heute)
    pruefe("Rate-Limit bricht ab", False)
except RuntimeError as e:
    pruefe("Rate-Limit bricht ab", "abgelehnt" in str(e))

print("\n" + ("Alle Gewichts-Tests bestanden." if not fehler else f"{len(fehler)} Fehler"))
sys.exit(1 if fehler else 0)
