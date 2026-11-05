import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  garminZeitMs,
  normalisiereSchlafNacht,
  reduziereAufMinuten,
  SCHLAF_METRIKEN,
} from "../schlaf-parser";

/* Echte Garmin-Antworten (tests/fixtures/garmin). Erwartungswerte werden aus
 * den Fixtures selbst abgeleitet, damit keine Schlafwerte im Test stehen. */
type Obj = Record<string, unknown>;
const lade = (datum: string, name: string): Obj =>
  JSON.parse(
    readFileSync(path.join(process.cwd(), "tests/fixtures/garmin", datum, `${name}.json`), "utf8")
  );
const NAECHTE = ["2026-11-04", "2026-10-28"] as const;
const dtoVon = (sd: Obj) => sd.dailySleepDTO as Record<string, number>;
const liste = (sd: Obj, k: string) => sd[k] as Obj[];

describe("garminZeitMs", () => {
  it("liest ISO ohne Zone als UTC und ms-Zahlen unverändert", () => {
    expect(garminZeitMs("2026-11-03T21:40:17.0")).toBe(Date.UTC(2026, 10, 3, 21, 40, 17));
    expect(garminZeitMs("2026-11-03T21:40:17.5")).toBe(Date.UTC(2026, 10, 3, 21, 40, 17, 500));
    expect(garminZeitMs("2026-11-03 21:40:17")).toBe(Date.UTC(2026, 10, 3, 21, 40, 17));
    expect(garminZeitMs("2026-11-03T22:40:17+01:00")).toBe(Date.UTC(2026, 10, 3, 21, 40, 17));
    expect(garminZeitMs(1762206017000)).toBe(1762206017000);
    expect(garminZeitMs(null)).toBeNull();
    expect(garminZeitMs("kaputt")).toBeNull();
    expect(garminZeitMs(-2)).toBeNull();
  });
});

describe("reduziereAufMinuten", () => {
  it("bildet Minutenmittel, max. 1 Punkt pro Minute, Sekunden relativ zum Start", () => {
    const start = Date.UTC(2026, 10, 3, 22, 0, 0);
    // 10-s-Raster über 3 Minuten, plus 2 Punkte eine Minute vor dem Start
    const roh: [number, number][] = [];
    for (let s = 0; s < 180; s += 10) roh.push([start + s * 1000, s < 60 ? 50 : s < 120 ? 60 : 70]);
    roh.push([start - 50_000, 10], [start - 20_000, 20]);
    const r = reduziereAufMinuten(roh, start);
    expect(r.punkte).toEqual([
      [-60, 15],
      [0, 50],
      [60, 60],
      [120, 70],
    ]);
    expect(r.rohAnzahl).toBe(20);
    expect(r.rohAufloesungS).toBe(10);
  });
});

describe.each(NAECHTE)("normalisiereSchlafNacht – echte Nacht %s", (datum) => {
  const sd = lade(datum, "get_sleep_data");
  const hrv = lade(datum, "get_hrv_data");
  const dto = dtoVon(sd);
  const n = normalisiereSchlafNacht(sd, hrv.hrvSummary)!;

  it("übernimmt das Schlaffenster als echte UTC-Instants", () => {
    expect(n).not.toBeNull();
    expect(n.nacht.schlafStartMs).toBe(dto.sleepStartTimestampGMT);
    expect(n.nacht.schlafEndeMs).toBe(dto.sleepEndTimestampGMT);
    expect(new Date(n.nacht.schlafEndeMs!).toISOString().slice(0, 10)).toBe(datum);
  });

  it("Phasensummen stimmen mit dailySleepDTO überein (±60 s)", () => {
    const summe = (level: number) =>
      n.epochen
        .filter((e) => e.art !== "bewegung" && e.level === level)
        .reduce((a, e) => a + e.dauerS, 0);
    expect(Math.abs(summe(0) - dto.deepSleepSeconds)).toBeLessThanOrEqual(60);
    expect(Math.abs(summe(1) - dto.lightSleepSeconds)).toBeLessThanOrEqual(60);
    expect(Math.abs(summe(2) - dto.remSleepSeconds)).toBeLessThanOrEqual(60);
    expect(Math.abs(summe(3) - dto.awakeSleepSeconds)).toBeLessThanOrEqual(60);
    // Phasen 0–2 = "phase", 3 = "wach"
    expect(n.epochen.filter((e) => e.art === "phase").every((e) => e.level <= 2)).toBe(true);
    expect(n.epochen.filter((e) => e.art === "wach").every((e) => e.level === 3)).toBe(true);
  });

  it("Segmente lückenlos, ohne gleiche Nachbarn, eindeutiger Primärschlüssel", () => {
    const seg = n.epochen
      .filter((e) => e.art !== "bewegung")
      .sort((a, b) => a.startMs - b.startMs);
    for (let i = 1; i < seg.length; i++) {
      expect(seg[i].level).not.toBe(seg[i - 1].level);
      expect(seg[i].startMs).toBe(seg[i - 1].startMs + seg[i - 1].dauerS * 1000);
    }
    const keys = new Set(n.epochen.map((e) => `${e.art}|${e.startMs}`));
    expect(keys.size).toBe(n.epochen.length);
  });

  it("Unruhe-Momente werden Bewegungs-Epochen (Level 1–3, 60 s)", () => {
    const bew = n.epochen.filter((e) => e.art === "bewegung");
    expect(bew).toHaveLength(liste(sd, "sleepRestlessMoments").length);
    expect(bew.every((e) => e.level >= 1 && e.level <= 3 && e.dauerS === 60)).toBe(true);
    expect(bew.reduce((a, e) => a + e.level, 0)).toBe(sd.restlessMomentsCount);
  });

  it("abgeleitete Kennzahlen", () => {
    const fenster = (dto.sleepEndTimestampGMT - dto.sleepStartTimestampGMT) / 1000;
    expect(n.nacht.effizienzProz).toBeCloseTo((dto.sleepTimeSeconds / fenster) * 100, 1);
    // Beide Nächte beginnen mit Leichtschlaf → Einschlafdauer nicht ableitbar
    expect(liste(sd, "sleepLevels")[0].activityLevel).not.toBe(3);
    expect(n.nacht.einschlafzeitS).toBeNull();
    const wachSegmente = liste(sd, "sleepLevels").filter((l) => l.activityLevel === 3).length;
    expect(n.nacht.anzahlWachphasen).toBe(wachSegmente);
    expect(n.nacht.garminAwakeCount).toBe(dto.awakeCount);
    expect(n.nacht.hrvBaseline?.balancedLow).toBe(
      ((hrv.hrvSummary as Obj).baseline as Obj).balancedLow
    );
  });

  it("alle sieben Metriken vorhanden, Punktzahlen = Rohpunkte je Minute", () => {
    expect(Object.keys(n.zeitreihen).sort()).toEqual([...SCHLAF_METRIKEN].sort());
    const rohListen: Record<string, string> = {
      hr: "sleepHeartRate",
      spo2: "wellnessEpochSPO2DataDTOList",
      atemfrequenz: "wellnessEpochRespirationDataDTOList",
      hrv: "hrvData",
      stress: "sleepStress",
      body_battery: "sleepBodyBattery",
      bewegung: "sleepMovement",
    };
    for (const m of SCHLAF_METRIKEN) {
      const z = n.zeitreihen[m]!;
      expect(z.quelle).toBe("get_sleep_data");
      expect(z.rohAnzahl).toBe(liste(sd, rohListen[m]).length);
      // Fixtures liefern ≤ 1 Punkt pro Minute → keine Reduktion nötig
      expect(z.punkte.length).toBe(z.rohAnzahl);
      // max. 1 Punkt pro Minute, aufsteigend, keine Lückenwerte
      for (let i = 1; i < z.punkte.length; i++) {
        expect(z.punkte[i][0] - z.punkte[i - 1][0]).toBeGreaterThanOrEqual(60);
      }
      expect(z.punkte.every(([, w]) => Number.isFinite(w) && w >= 0)).toBe(true);
    }
    expect(n.zeitreihen.hr!.rohAufloesungS).toBe(120);
    expect(n.zeitreihen.spo2!.rohAufloesungS).toBe(60);
    expect(n.zeitreihen.stress!.rohAufloesungS).toBe(180);
    expect(n.zeitreihen.hrv!.rohAufloesungS).toBe(300);
    expect(n.zeitreihen.bewegung!.rohAufloesungS).toBe(60);
  });

  it("Bewegung beginnt vor dem Einschlafen (negative Sekunden)", () => {
    const b = n.zeitreihen.bewegung!.punkte;
    expect(b[0][0]).toBeLessThan(-3000);
    expect(b[b.length - 1][0]).toBeGreaterThan(
      (dto.sleepEndTimestampGMT - dto.sleepStartTimestampGMT) / 1000
    );
  });
});

describe("normalisiereSchlafNacht – fehlende Daten und Ersatzreihen", () => {
  const basis = () => lade("2026-11-04", "get_sleep_data");

  it("fehlende Reihe → Metrik fehlt (kein Array mit Nullen)", () => {
    const sd = basis();
    delete sd.wellnessEpochSPO2DataDTOList;
    sd.sleepStress = [];
    // nur Platzhalter → ebenfalls keine Reihe
    sd.hrvData = liste(sd, "hrvData").map((p) => ({ ...p, value: null }));
    sd.sleepHeartRate = liste(sd, "sleepHeartRate").map((p) => ({ ...p, value: -1 }));
    const n = normalisiereSchlafNacht(sd)!;
    expect(n.zeitreihen.spo2).toBeUndefined();
    expect(n.zeitreihen.stress).toBeUndefined();
    expect(n.zeitreihen.hrv).toBeUndefined();
    expect(n.zeitreihen.hr).toBeUndefined();
    expect(n.zeitreihen.atemfrequenz).toBeDefined();
    expect(n.nacht.hrvBaseline).toBeNull();
  });

  it("Platzhalter (negativ/null) werden als Lücke verworfen", () => {
    const sd = basis();
    const resp = liste(sd, "wellnessEpochRespirationDataDTOList");
    resp[0] = { ...resp[0], respirationValue: -2 };
    resp[1] = { ...resp[1], respirationValue: null };
    const n = normalisiereSchlafNacht(sd)!;
    expect(n.zeitreihen.atemfrequenz!.rohAnzahl).toBe(resp.length - 2);
  });

  it("nutzt raw.zusatz, wenn die Reihe in get_sleep_data fehlt", () => {
    const sd = basis();
    const dto = dtoVon(sd);
    delete sd.sleepHeartRate;
    delete sd.hrvData;
    const hr = lade("2026-11-04", "get_heart_rates").heartRateValues as [number, number | null][];
    const imFenster = hr.filter(
      ([t, w]) => w !== null && t >= dto.sleepStartTimestampGMT && t <= dto.sleepEndTimestampGMT
    );
    sd.zusatz = {
      hinweis: "Tages-Endpunkte erst ab lokal 00:00",
      quellen: { hr: "get_heart_rates" },
      hr: imFenster,
      hrv: [[dto.sleepStartTimestampGMT + 600_000, 40]],
    };
    const n = normalisiereSchlafNacht(sd)!;
    expect(n.zeitreihen.hr!.quelle).toBe("get_heart_rates");
    expect(n.zeitreihen.hr!.rohAnzahl).toBe(imFenster.length);
    // Tages-Endpunkt startet lokal 00:00 = 23:00 UTC → erster Punkt nach Schlafbeginn
    expect(n.zeitreihen.hr!.punkte[0][0]).toBeGreaterThan(0);
    expect(n.zeitreihen.hrv!.quelle).toBe("tages_endpunkt");
    expect(n.zeitreihen.hrv!.punkte).toEqual([[600, 40]]);
    // Ersatz nur, wenn die Originalreihe fehlt
    expect(n.zeitreihen.stress!.quelle).toBe("get_sleep_data");
  });

  it("Wach-Segment am Anfang → Einschlafdauer; Wach am Ende zählt nicht als Wachphase", () => {
    const t0 = Date.UTC(2026, 10, 3, 21, 0, 0);
    const iso = (min: number) => new Date(t0 + min * 60_000).toISOString().replace("Z", "").replace(/\.\d+$/, ".0");
    const sd = {
      dailySleepDTO: {
        sleepTimeSeconds: 60 * 60,
        sleepStartTimestampGMT: t0,
        sleepEndTimestampGMT: t0 + 90 * 60_000,
        awakeCount: 1,
      },
      sleepLevels: [
        { startGMT: iso(0), endGMT: iso(10), activityLevel: 3 },
        { startGMT: iso(10), endGMT: iso(30), activityLevel: 1 },
        { startGMT: iso(30), endGMT: iso(40), activityLevel: 1 }, // gleicher Nachbar
        { startGMT: iso(40), endGMT: iso(45), activityLevel: 3 },
        { startGMT: iso(45), endGMT: iso(75), activityLevel: 0 },
        { startGMT: iso(75), endGMT: iso(90), activityLevel: 3 },
      ],
    };
    const n = normalisiereSchlafNacht(sd)!;
    expect(n.nacht.einschlafzeitS).toBe(600);
    expect(n.nacht.anzahlWachphasen).toBe(1);
    expect(n.nacht.effizienzProz).toBeCloseTo(66.7, 1);
    const leicht = n.epochen.filter((e) => e.art === "phase" && e.level === 1);
    expect(leicht).toEqual([{ art: "phase", startMs: t0 + 10 * 60_000, dauerS: 1800, level: 1 }]);
    expect(n.zeitreihen).toEqual({});
  });

  it("unbrauchbares raw → null", () => {
    expect(normalisiereSchlafNacht(null)).toBeNull();
    expect(normalisiereSchlafNacht({})).toBeNull();
    expect(normalisiereSchlafNacht([1, 2])).toBeNull();
  });
});
