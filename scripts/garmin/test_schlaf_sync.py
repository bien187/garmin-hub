"""Offline-Test der Schlaf-Speicherlogik in api/_lib/sync_logic.py.

Läuft ohne DB und ohne Garmin: ein Fake-con sammelt SQL + Parameter, ein
Fake-Garmin liefert die echten Fixtures aus tests/fixtures/garmin/.
Gibt keine Schlafwerte aus (nur ok/Fehlertext ohne Werte).

Aufruf (Python mit pg8000, z. B. das Projekt-Venv):
    python scripts/garmin/test_schlaf_sync.py
"""
import copy
import datetime as dt
import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "api"))

from _lib import sync_logic as sl  # noqa: E402

sl._pause = lambda: None  # keine echten Pausen im Test
FIX = os.path.join(ROOT, "tests", "fixtures", "garmin")
NAECHTE = ("2026-11-04", "2026-10-28")


def lade(datum, name):
    with open(os.path.join(FIX, datum, name + ".json")) as f:
        return json.load(f)


class FakeCon:
    """Sammelt Statements; bedient sync_state und die Final-Abfrage."""

    def __init__(self, final=()):
        self.statements = []
        self.state = {}
        self.final = list(final)

    def run(self, sql, **p):
        self.statements.append((" ".join(sql.split()), p))
        if "FROM sync_state" in sql:
            v = self.state.get(p["k"])
            return [[v]] if v is not None else []
        if "INSERT INTO sync_state" in sql:
            self.state[p["k"]] = p["v"]
            return []
        if "FROM sleep_nights" in sql:
            return [[d] for d in self.final]
        return []

    def schlaf_inserts(self):
        return [p for s, p in self.statements if s.startswith("INSERT INTO sleep_nights")]


class FakeGarmin:
    def __init__(self, sleep=None, fehler=None):
        self.calls = []
        self.sleep = sleep or {}
        self.fehler = fehler

    def _tag(self, name, datum):
        self.calls.append(name)
        return lade(datum if datum in NAECHTE else NAECHTE[0], name)

    def get_sleep_data(self, d):
        self.calls.append("get_sleep_data")
        if self.fehler:
            raise self.fehler
        return copy.deepcopy(self.sleep.get(d, {}))

    def get_hrv_data(self, d):
        self.calls.append("get_hrv_data")
        return lade(d, "get_hrv_data") if d in NAECHTE else {}

    def get_heart_rates(self, d):
        return self._tag("get_heart_rates", d)

    def get_all_day_stress(self, d):
        return self._tag("get_all_day_stress", d)

    def get_respiration_data(self, d):
        return self._tag("get_respiration_data", d)

    def get_spo2_data(self, d):
        return self._tag("get_spo2_data", d)

    def get_body_battery(self, d):
        return self._tag("get_body_battery", d)

    def get_stats(self, d):
        self.calls.append("get_stats")
        return {}

    def get_training_readiness(self, d):
        self.calls.append("get_training_readiness")
        return []


def utc(ms):
    return dt.datetime.fromtimestamp(ms / 1000, tz=dt.timezone.utc)


def test_direktwerte_und_fenster():
    for d in NAECHTE:
        sd, hrv = lade(d, "get_sleep_data"), lade(d, "get_hrv_data")
        dto = sd["dailySleepDTO"]
        con = FakeCon()
        assert sl._schlaf_nacht_speichern(con, d, sd, hrv) is True
        (p,) = con.schlaf_inserts()
        assert p["datum"] == d
        # Schlaffenster = echte UTC-Instants aus …GMT, nicht die verschobenen …Local
        assert p["start"] == utc(dto["sleepStartTimestampGMT"])
        assert p["ende"] == utc(dto["sleepEndTimestampGMT"])
        assert p["start"].utcoffset() == dt.timedelta(0)
        assert p["start"] != utc(dto["sleepStartTimestampLocal"])
        # Abend vor dem Aufwachdatum (UTC) bis Aufwachdatum
        assert p["ende"].date().isoformat() == d
        assert p["start"] < p["ende"]
        assert p["dauer"] == dto["sleepTimeSeconds"]
        assert p["tief"] == dto["deepSleepSeconds"]
        assert p["leicht"] == dto["lightSleepSeconds"]
        assert p["rem"] == dto["remSleepSeconds"]
        assert p["wach"] == dto["awakeSleepSeconds"]
        assert p["score"] == dto["sleepScores"]["overall"]["value"]
        raw = p["raw"]
        assert ", " not in raw[:200] and "\n" not in raw  # kompakt
        assert json.loads(raw) == sd  # vollständig, nichts gekürzt
        assert json.loads(p["hrv"]) == hrv["hrvSummary"]
        assert "baseline" in json.loads(p["hrv"])
    print("ok  Direktwerte, Schlaffenster (UTC), raw kompakt, hrv_baseline")


def test_null_statt_null():
    sd = lade(NAECHTE[0], "get_sleep_data")
    dto = sd["dailySleepDTO"]
    for k in ("deepSleepSeconds", "remSleepSeconds", "awakeSleepSeconds"):
        dto[k] = None
    del dto["lightSleepSeconds"]
    dto["sleepScores"] = {}
    dto["sleepStartTimestampGMT"] = None
    con = FakeCon()
    assert sl._schlaf_nacht_speichern(con, NAECHTE[0], sd, {}) is True
    (p,) = con.schlaf_inserts()
    for k in ("tief", "leicht", "rem", "wach", "score", "start", "ende", "hrv"):
        assert p[k] is None, f"{k} muss NULL sein"
    # hrv ohne Summary → SQL-NULL, nicht JSON-null/{}
    con2 = FakeCon()
    sl._schlaf_nacht_speichern(con2, NAECHTE[0], lade(NAECHTE[0], "get_sleep_data"), {"hrvSummary": None})
    assert con2.schlaf_inserts()[0]["hrv"] is None
    print("ok  fehlende Werte → NULL (nie 0)")


def test_leere_nacht():
    for sd in ({}, {"dailySleepDTO": None}, {"dailySleepDTO": {"sleepTimeSeconds": None}},
               {"dailySleepDTO": {"sleepTimeSeconds": 0}}, None):
        con = FakeCon()
        assert sl._schlaf_nacht_speichern(con, NAECHTE[0], sd, {}) is False
        assert sl._schlaf_nacht(con, FakeGarmin(), NAECHTE[0], sd, {}) is False
        assert con.statements == []  # keine Zeile, kein DELETE
    print("ok  leere Nacht → keine Zeile")


def test_kein_zusatz_bei_vollstaendigen_fixtures():
    for d in NAECHTE:
        g = FakeGarmin()
        assert sl._schlaf_zusatz(g, d, lade(d, "get_sleep_data"), lade(d, "get_hrv_data")) is None
        assert g.calls == []
    print("ok  vollständige Nacht → keine Tages-Endpunkt-Aufrufe")


def test_zusatz_fallback():
    d = NAECHTE[0]
    sd, hrv = lade(d, "get_sleep_data"), lade(d, "get_hrv_data")
    start, ende = sd["dailySleepDTO"]["sleepStartTimestampGMT"], sd["dailySleepDTO"]["sleepEndTimestampGMT"]
    for k in ("sleepHeartRate", "sleepStress", "wellnessEpochRespirationDataDTOList",
              "wellnessEpochSPO2DataDTOList", "sleepBodyBattery", "hrvData"):
        del sd[k]
    g = FakeGarmin()
    z = sl._schlaf_zusatz(g, d, sd, hrv)
    assert sorted(g.calls) == sorted([
        "get_heart_rates", "get_all_day_stress", "get_respiration_data",
        "get_spo2_data", "get_body_battery"])
    assert "00:00" in z["hinweis"]
    assert z["quellen"]["hr"] == "get_heart_rates"
    assert z["quellen"]["hrv"] == "get_hrv_data"
    for m in ("hr", "stress", "atemfrequenz", "spo2", "body_battery", "hrv"):
        assert z[m], m
        for t, w in z[m]:
            assert start <= t <= ende, f"{m} ausserhalb des Schlaffensters"
            assert w is not None and w >= 0, f"{m} enthält Platzhalter"
    # Tages-Endpunkte starten lokal 00:00 → nichts vor Mitternacht (UTC+1 → 23:00 UTC)
    mitternacht = int(dt.datetime.fromisoformat(d + "T00:00:00+01:00").timestamp() * 1000)
    assert min(t for t, _ in z["hr"]) >= mitternacht
    # HRV kommt vollständig aus get_hrv_data (deckt die ganze Nacht)
    assert len(z["hrv"]) == len(hrv["hrvReadings"])
    # Zusatz landet in raw
    con = FakeCon()
    sl._schlaf_nacht_speichern(con, d, sd, hrv, z)
    raw = json.loads(con.schlaf_inserts()[0]["raw"])
    assert raw["zusatz"]["hr"] == z["hr"]
    # Ein fehlschlagender Tages-Endpunkt verwirft die Nacht nicht
    class Kaputt(FakeGarmin):
        def get_heart_rates(self, d):
            raise RuntimeError("weg")
    z2 = sl._schlaf_zusatz(Kaputt(), d, sd, hrv)
    assert "hr" not in z2 and z2["stress"]
    # Ohne Mess-Beleg in dailySleepDTO kein Zusatzaufruf (Rate-Limit)
    sd2 = copy.deepcopy(sd)
    for k in ("avgHeartRate", "averageSpO2Value", "averageRespirationValue", "avgSleepStress"):
        sd2["dailySleepDTO"][k] = None
    sd2["bodyBatteryChange"] = None
    g3 = FakeGarmin()
    sl._schlaf_zusatz(g3, d, sd2, hrv)
    assert g3.calls == []
    print("ok  Ersatzreihen aus Tages-Endpunkten, auf Schlaffenster gefiltert")


def test_raw_kuerzung():
    sd = lade(NAECHTE[0], "get_sleep_data")
    sd["sleepMovement"] = sd["sleepMovement"] * 40  # > 1 MB
    raw = json.loads(sl._raw_kompakt(sd))
    assert "sleepMovement" not in raw and raw["_gekuerzt"] == ["sleepMovement"]
    assert len(sl._raw_kompakt(sd).encode()) <= sl.SCHLAF_RAW_MAX_BYTES
    print("ok  raw > 1 MB → sleepMovement weggelassen und markiert")


def test_backfill():
    heute = dt.date(2026, 11, 4)
    alt_tage, alt_chunk = sl.SCHLAF_BACKFILL_TAGE, sl.SCHLAF_CHUNK_NAECHTE
    sl.SCHLAF_BACKFILL_TAGE, sl.SCHLAF_CHUNK_NAECHTE = 10, 4
    try:
        sleep = {d: lade(d, "get_sleep_data") for d in NAECHTE}
        con = FakeCon(final=["2026-11-03"])
        g = FakeGarmin(sleep=sleep)
        verlauf, daten = [], []
        for _ in range(10):
            r = sl.sync_sleep(con, g, heute=heute)
            verlauf.append(r["fortschritt"]["erledigt"])
            daten += r["schlafDaten"]
            json.dumps(r)  # serialisierbar für die Bridge
            if not r["hasMore"]:
                break
        assert r["backfillDone"] is True and r["fortschritt"]["gesamt"] == 11
        assert verlauf == sorted(verlauf) and verlauf[-1] == 11
        assert sorted(daten) == sorted(NAECHTE)
        assert all(isinstance(x, str) for x in daten)
        # 2026-11-03 war schon final → nie bei Garmin angefragt
        assert g.calls.count("get_sleep_data") == 10
        # nur Nächte mit Daten fragen HRV ab
        assert g.calls.count("get_hrv_data") == 2
        n = len(g.calls)
        r2 = sl.sync_sleep(con, g, heute=heute)
        assert r2["hasMore"] is False and r2["backfillDone"] and len(g.calls) == n
        assert sl.schlaf_backfill_fertig(con)["hasMore"] is False
    finally:
        sl.SCHLAF_BACKFILL_TAGE, sl.SCHLAF_CHUNK_NAECHTE = alt_tage, alt_chunk
    print("ok  Backfill rückwärts, Fortschritt, danach ohne Garmin-Aufrufe")


def test_backfill_fehler_wiederholung():
    heute = dt.date(2026, 11, 4)
    alt_tage, alt_chunk = sl.SCHLAF_BACKFILL_TAGE, sl.SCHLAF_CHUNK_NAECHTE
    sl.SCHLAF_BACKFILL_TAGE, sl.SCHLAF_CHUNK_NAECHTE = 8, 20
    try:
        sleep = {d: lade(d, "get_sleep_data") for d in NAECHTE}

        class WackelGarmin(FakeGarmin):
            """Erster Abruf der Nacht 04.11. scheitert vorübergehend (Timeout)."""
            def __init__(self, **kw):
                super().__init__(**kw)
                self.versuche = 0

            def get_sleep_data(self, d):
                if d == "2026-11-04":
                    self.versuche += 1
                    if self.versuche == 1:
                        raise TimeoutError("kurz weg")
                return super().get_sleep_data(d)

        con = FakeCon()
        g = WackelGarmin(sleep=sleep)
        daten = []
        for _ in range(5):
            r = sl.sync_sleep(con, g, heute=heute)
            daten += r["schlafDaten"]
            if not r["hasMore"]:
                break
        assert r["backfillDone"] and g.versuche == 2, g.versuche
        assert sorted(daten) == sorted(NAECHTE)
        state = json.loads(con.state["sleep"])
        assert not state.get("fehlgeschlagen") and not state.get("endgueltigFehlgeschlagen")

        # Bleibender Speicherfehler (kein Schema-Problem): Nacht wird übersprungen,
        # einmal wiederholt, dann als endgültig fehlgeschlagen geführt; kein Hänger.
        class SpeicherKaputt(FakeCon):
            def run(self, sql, **p):
                if "INSERT INTO sleep_nights" in sql and p.get("datum") == "2026-10-28":
                    raise ValueError("ungültiges jsonb mit Wert 123")
                return super().run(sql, **p)

        con = SpeicherKaputt()
        g = FakeGarmin(sleep=sleep)
        for _ in range(5):
            r = sl.sync_sleep(con, g, heute=heute)
            if not r["hasMore"]:
                break
        state = json.loads(con.state["sleep"])
        assert r["backfillDone"] and state["endgueltigFehlgeschlagen"] == ["2026-10-28"]
        assert "123" not in json.dumps(r)

        # Fehlendes Schema bricht ab, Cursor bleibt stehen
        class OhneTabelle(FakeCon):
            def run(self, sql, **p):
                if "INSERT INTO sleep_nights" in sql:
                    raise RuntimeError('relation "sleep_nights" does not exist')
                return super().run(sql, **p)

        con = OhneTabelle()
        try:
            sl.sync_sleep(con, FakeGarmin(sleep=sleep), heute=heute)
            raise AssertionError("fehlendes Schema muss abbrechen")
        except RuntimeError as e:
            assert "Migration" in str(e)
        assert json.loads(con.state["sleep"])["cursor"] == "2026-11-04"
    finally:
        sl.SCHLAF_BACKFILL_TAGE, sl.SCHLAF_CHUNK_NAECHTE = alt_tage, alt_chunk
    print("ok  Backfill: Wiederholung, Speicherfehler überspringen, Schema-Fehler bricht ab")


def test_backfill_rate_limit():
    class Resp:
        status_code = 429

    class HttpFehler(Exception):
        response = Resp()

    con = FakeCon()
    g = FakeGarmin(fehler=HttpFehler("geheimer Text"))
    try:
        sl.sync_sleep(con, g, heute=dt.date(2026, 11, 4))
        raise AssertionError("Rate-Limit muss abbrechen")
    except RuntimeError as e:
        assert "geheimer Text" not in str(e) and e.__suppress_context__
    state = json.loads(con.state["sleep"])
    assert state["cursor"] == "2026-11-04"  # Nacht nicht übersprungen
    print("ok  Rate-Limit bricht ab, ohne Nächte zu überspringen")


def test_health_letzte_zwei_tage():
    heute = dt.date(2026, 11, 4)
    con = FakeCon()
    con.state["health"] = json.dumps({"lastDate": heute.isoformat()})
    g = FakeGarmin(sleep={d: lade(d, "get_sleep_data") for d in NAECHTE})
    r = sl.sync_health(con, g, heute=heute)
    tage = [p["datum"] for s, p in con.statements if s.startswith("INSERT INTO daily_health")]
    assert tage == ["2026-11-03", "2026-11-04"], tage
    assert r["schlafDaten"] == ["2026-11-04"] and r["hasMore"] is False
    assert [p["datum"] for p in con.schlaf_inserts()] == ["2026-11-04"]
    # Speicherfehler bei der Nacht verwirft den Gesundheits-Tag nicht
    class KaputtCon(FakeCon):
        def run(self, sql, **p):
            if "INSERT INTO sleep_nights" in sql:
                raise RuntimeError("relation does not exist")
            return super().run(sql, **p)
    kc = KaputtCon()
    kc.state["health"] = json.dumps({"lastDate": heute.isoformat()})
    r = sl.sync_health(kc, g, heute=heute)
    assert r["schlafDaten"] == [] and r["verarbeitet"] == 2
    print("ok  Health-Sync schreibt die letzten 2 Tage (inkl. Nacht) neu")


def test_iso():
    assert sl._iso_utc_ms("2026-11-03T21:40:17.0") == int(
        dt.datetime(2026, 11, 3, 21, 40, 17, tzinfo=dt.timezone.utc).timestamp() * 1000)
    assert sl._iso_utc_ms("2026-11-03T21:40:17.5") % 1000 == 500
    assert sl._iso_utc_ms(None) is None and sl._iso_utc_ms("kaputt") is None
    print("ok  ISO ohne Zone = UTC")


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
    print("alle Schlaf-Sync-Tests ok")
