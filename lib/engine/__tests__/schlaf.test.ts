import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalisiereSchlafNacht, type SchlafEpoche } from "../schlaf-parser";
import {
  analysiereSchlaf,
  datenqualitaet,
  empfehlungen,
  kernwerte,
  nachtAusRaw,
  phaseKontext,
  regelBewertung,
  analysiereZusammenfassung,
  analysierePhasen,
  vergleicheMitBaseline,
  type SchlafKernwerte,
  type SchlafNachtDaten,
} from "../schlaf";

/* Echte Garmin-Antworten (tests/fixtures/garmin). Erwartungen werden aus den
 * Fixtures selbst nachgerechnet, nicht abgeschrieben. */
type Obj = Record<string, unknown>;
const lade = (datum: string, name: string): Obj =>
  JSON.parse(readFileSync(path.join(process.cwd(), "tests/fixtures/garmin", datum, `${name}.json`), "utf8"));

function fixtureNacht(datum: string) {
  const raw = lade(datum, "get_sleep_data");
  const hrv = lade(datum, "get_hrv_data");
  const norm = normalisiereSchlafNacht(raw, hrv.hrvSummary)!;
  return { raw, hrv, ...nachtAusRaw(datum, raw, norm) };
}

const leer = (datum: string, p: Partial<SchlafKernwerte> = {}): SchlafKernwerte => ({
  datum,
  dauerS: null,
  effizienzProz: null,
  hrvMittel: null,
  ruhepuls: null,
  atemMittel: null,
  spo2Min: null,
  tiefAnteilProz: null,
  tiefS: null,
  garminScore: null,
  ...p,
});

describe("analysiereSchlaf mit echten Fixtures", () => {
  for (const datum of ["2026-11-04", "2026-10-28"]) {
    it(`${datum}: Kennzahlen stimmen mit der Garmin-Antwort überein`, () => {
      const { raw, hrv, nacht, zusammenfassung } = fixtureNacht(datum);
      const dto = raw.dailySleepDTO as Obj;
      const a = analysiereSchlaf(nacht, [], {}, zusammenfassung);

      expect(a.zusammenfassung.dauerS).toBe(dto.sleepTimeSeconds);
      expect(a.garminScore).toBe(((dto.sleepScores as Obj).overall as Obj).value);
      // Phasen in Minuten = Garmin-Summen
      expect(a.phasen.tief.minuten).toBe(Math.round((dto.deepSleepSeconds as number) / 60));
      expect(a.phasen.rem.minuten).toBe(Math.round((dto.remSleepSeconds as number) / 60));
      const summe = a.phasen.tief.prozent! + a.phasen.leicht.prozent! + a.phasen.rem.prozent!;
      expect(summe).toBeCloseTo(100, 0);
      // Richtwerte kommen von Garmin
      expect(a.phasen.tief.richtwertQuelle).toBe("garmin");
      expect(a.phasen.tief.richtwert!.von).toBe(((dto.sleepScores as Obj).deepPercentage as Obj).optimalStart);

      // HF: Min/Max entsprechen den Rohwerten (Minutenmittel bei 120-s-Auflösung = Rohwerte)
      const hrRoh = (raw.sleepHeartRate as Obj[]).map((x) => x.value as number);
      expect(a.hr!.min).toBe(Math.min(...hrRoh));
      expect(a.hr!.max).toBe(Math.max(...hrRoh));
      expect(a.hr!.tiefsteImTiefschlaf).not.toBeNull();
      expect(a.hr!.tiefsteImTiefschlaf!).toBeGreaterThanOrEqual(a.hr!.min);

      // SpO2: Minimum und Minuten < 90 aus den 60-s-Epochen
      const spo = (raw.wellnessEpochSPO2DataDTOList as Obj[]).map((x) => x.spo2Reading as number);
      expect(a.spo2!.min).toBe(Math.min(...spo));
      expect(a.spo2!.minutenUnter90).toBe(spo.filter((v) => v < 90).length);
      expect(a.spo2!.minutenUnter92).toBe(spo.filter((v) => v < 92).length);

      // Atemfrequenz je Phase: alle vier Phasen vorhanden, plausibel um das Mittel
      for (const p of ["tief", "leicht", "rem"] as const) {
        expect(a.atem!.jePhase[p]).not.toBeNull();
        expect(Math.abs(a.atem!.jePhase[p]! - a.atem!.mittel)).toBeLessThan(5);
      }

      // HRV-Einordnung gegen das echte Baseline-Band
      const band = (hrv.hrvSummary as Obj).baseline as Obj;
      expect(a.hrv!.band).toEqual({ von: band.balancedLow, bis: band.balancedUpper });
      expect(a.hrv!.einordnung).not.toBeNull();

      expect(a.bodyBattery!.aufladung).toBeGreaterThan(0);
      expect(a.bewegung!.unruhigeMomente).toBe((raw.sleepRestlessMoments as Obj[]).length);
      expect(a.datenqualitaet.every((d) => d.proz > 0)).toBe(true);
      expect(a.empfehlungen.length).toBeGreaterThanOrEqual(1);
      expect(a.empfehlungen.length).toBeLessThanOrEqual(3);
      expect(a.fazit).toMatch(/geschlafen/);
      expect(a.hinweise.join(" ")).toMatch(/keine medizinische Messung/);
      expect(JSON.parse(JSON.stringify(a))).toEqual(a); // serialisierbar
    });
  }

  it("10-28: SpO2 mehrfach unter 90 % → Warnhinweis ohne Diagnose", () => {
    const { nacht, zusammenfassung } = fixtureNacht("2026-10-28");
    const a = analysiereSchlaf(nacht, [], {}, zusammenfassung);
    expect(a.spo2!.min).toBeLessThan(90);
    expect(a.warnungen).toHaveLength(1);
    expect(a.warnungen[0]).toMatch(/keinen medizinischen Befund/);
    expect(a.warnungen[0]).toMatch(/ärztlich abklären/);
    expect(a.auffaelligkeiten.join(" ")).toMatch(/SpO2-Minimum/);
  });

  it("11-04: SpO2-Minimum 90 % → keine Warnung", () => {
    const { nacht, zusammenfassung } = fixtureNacht("2026-11-04");
    const a = analysiereSchlaf(nacht, [], {}, zusammenfassung);
    expect(a.spo2!.minutenUnter90).toBe(0);
    expect(a.warnungen).toEqual([]);
  });

  it("Taper-Kontext: 04.11. kein Taper, 05.11. Taper, 18.11. EP-Tag 1", () => {
    expect(phaseKontext("2026-11-04").taper).toBe(false);
    expect(phaseKontext("2026-11-05")).toMatchObject({ taper: true, tageBisEp: 13 });
    expect(phaseKontext("2026-11-18")).toMatchObject({ taper: true, epTag: 1 });
    expect(phaseKontext("2026-11-20")).toMatchObject({ taper: false, epTag: null, tageBisEp: null });
    const { nacht, zusammenfassung } = fixtureNacht("2026-11-04");
    const taper = analysiereSchlaf({ ...nacht, datum: "2026-11-16" }, [], {}, zusammenfassung);
    expect(taper.empfehlungen[0]).toMatch(/Noch 2 Tage bis zur EP/);
  });
});

describe("Baseline-Vergleich", () => {
  it("7/30 Tage ohne den heutigen Tag, mit Abweichung und Bewertung", () => {
    const heute = leer("2026-11-04", { dauerS: 6 * 3600, ruhepuls: 50 });
    const hist = [
      leer("2026-11-04", { dauerS: 99999 }), // heutiger Tag darf nicht zählen
      leer("2026-11-03", { dauerS: 8 * 3600, ruhepuls: 46 }),
      leer("2026-10-30", { dauerS: 8 * 3600, ruhepuls: 46 }),
      leer("2026-10-10", { dauerS: 7 * 3600 }), // nur im 30-Tage-Fenster
      leer("2026-09-01", { dauerS: 1 }), // ausserhalb
    ];
    const v = vergleicheMitBaseline(heute, hist);
    const dauer = v.find((x) => x.metrik === "dauerS")!;
    expect(dauer.n7).toBe(2);
    expect(dauer.n30).toBe(3);
    expect(dauer.mittel7).toBe(8 * 3600);
    expect(dauer.abw7Proz).toBe(-25);
    expect(dauer.richtung7).toBe("runter");
    expect(dauer.bewertung7).toBe("schlecht");
    const puls = v.find((x) => x.metrik === "ruhepuls")!;
    expect(puls.richtung7).toBe("hoch");
    expect(puls.bewertung7).toBe("schlecht"); // höherer Ruhepuls ist schlechter
    const hrv = v.find((x) => x.metrik === "hrvMittel")!;
    expect(hrv.heute).toBeNull();
    expect(hrv.abw7Proz).toBeNull();
  });

  it("leere Historie → Mittel null, kein Absturz", () => {
    const v = vergleicheMitBaseline(leer("2026-11-04", { dauerS: 7 * 3600 }), []);
    expect(v.every((x) => x.mittel7 === null && x.n30 === 0)).toBe(true);
  });
});

describe("Empfehlungen", () => {
  const ohneTaper = { phaseKontext: phaseKontext("2026-10-20"), hrv: null, zusammenfassung: {} as never };
  it("drei Nächte < 7 h → harte Einheit verschieben (mit Titel)", () => {
    const heute = leer("2026-10-20", { dauerS: 6 * 3600 });
    const hist = [leer("2026-10-19", { dauerS: 6.5 * 3600 }), leer("2026-10-18", { dauerS: 5 * 3600 })];
    const e = empfehlungen(ohneTaper, heute, hist, { geplant: [{ typ: "intervalle", titel: "EP-Tempo: 5×1 km" }] });
    expect(e[0]).toMatch(/Drei Nächte in Folge unter 7 h/);
    expect(e[0]).toMatch(/EP-Tempo/);
  });
  it("fehlt eine der drei Nächte, greift die Regel nicht", () => {
    const heute = leer("2026-10-20", { dauerS: 6 * 3600 });
    const e = empfehlungen(ohneTaper, heute, [leer("2026-10-19", { dauerS: 5 * 3600 })], {});
    expect(e.join(" ")).not.toMatch(/Drei Nächte/);
  });
  it("Tiefschlaf < 75 % des 30-Tage-Mittels → kein Lastlauf", () => {
    const heute = leer("2026-10-20", { tiefS: 30 * 60 });
    const hist = Array.from({ length: 6 }, (_, i) => leer(`2026-10-1${i}`, { tiefS: 80 * 60 }));
    const e = empfehlungen(ohneTaper, heute, hist, {});
    expect(e.join(" ")).toMatch(/keinen Lastlauf/);
  });
  it("HRV unter dem Band → Intensität senken", () => {
    const e = empfehlungen(
      { ...ohneTaper, hrv: { mittel: 60, min: 40, max: 80, band: { von: 75, bis: 96 }, einordnung: "unter", status: null } },
      leer("2026-10-20"),
      [],
      {}
    );
    expect(e[0]).toMatch(/Intensität heute senken/);
  });
  it("nie diagnostisch formuliert", () => {
    const { nacht, zusammenfassung } = fixtureNacht("2026-10-28");
    const a = analysiereSchlaf(nacht, [], {}, zusammenfassung);
    const text = [...a.empfehlungen, ...a.warnungen, ...a.auffaelligkeiten].join(" ");
    expect(text).not.toMatch(/Apnoe|Diagnose|Krankheit|du hast/i);
  });
});

describe("Randfälle", () => {
  const basis = (): SchlafNachtDaten => ({
    datum: "2026-10-20",
    schlafStartMs: Date.UTC(2026, 9, 19, 22, 0),
    schlafEndeMs: Date.UTC(2026, 9, 20, 6, 0),
    garminScore: null,
    schlafDauerS: null,
    tiefS: null,
    leichtS: null,
    remS: null,
    wachS: null,
    anzahlWachphasen: null,
    einschlafzeitS: null,
    effizienzProz: null,
    ruhepuls: null,
    hrvBaseline: null,
    richtwerte: null,
    epochen: [],
    zeitreihen: {},
  });

  it("fehlende Zeitreihen → alle Reihen-Analysen null, Datenqualität „nicht verfügbar\"", () => {
    const a = analysiereSchlaf(basis(), []);
    expect(a.hr).toBeNull();
    expect(a.spo2).toBeNull();
    expect(a.atem).toBeNull();
    expect(a.hrv).toBeNull();
    expect(a.stress).toBeNull();
    expect(a.bodyBattery).toBeNull();
    expect(a.bewegung).toBeNull();
    expect(a.datenqualitaet.every((d) => d.status === "nicht verfügbar" && d.proz === 0)).toBe(true);
    expect(a.fazit).toMatch(/keine verwertbaren Schlafdaten/);
    expect(a.ampel).toBeNull();
    expect(a.phasen.tief.richtwertQuelle).toBe("allgemein");
  });

  it("Nacht ohne SpO2: übrige Analyse läuft, kein SpO2-Hinweis", () => {
    const { nacht, zusammenfassung } = fixtureNacht("2026-11-04");
    const ohne = { ...nacht, zeitreihen: { ...nacht.zeitreihen, spo2: undefined } };
    const a = analysiereSchlaf(ohne, [], {}, { ...zusammenfassung, spo2Min: null });
    expect(a.spo2).toBeNull();
    expect(a.hr).not.toBeNull();
    expect(a.datenqualitaet.find((d) => d.metrik === "spo2")!.status).toBe("nicht verfügbar");
    expect(a.hinweise.join(" ")).not.toMatch(/SpO2 ist eine Uhr-Schätzung/);
  });

  it("Nacht unter 2 h: Dauer, niedrige Regel-Bewertung, Auffälligkeit", () => {
    const n = basis();
    n.schlafEndeMs = n.schlafStartMs! + 100 * 60_000;
    n.epochen = [{ art: "phase", startMs: n.schlafStartMs!, dauerS: 95 * 60, level: 1 }];
    const a = analysiereSchlaf(n, []);
    expect(a.zusammenfassung.dauerS).toBe(95 * 60);
    expect(a.auffaelligkeiten[0]).toMatch(/Kurze Nacht/);
    expect(a.regelBewertung!.punkte).toBeLessThan(40);
    expect(a.ampel).toBe("rot");
  });

  it("sehr viele Wachphasen: gezählt, längste ermittelt, Regel-Punkte abgezogen", () => {
    const n = basis();
    const start = n.schlafStartMs!;
    const ep: SchlafEpoche[] = [];
    let t = start;
    for (let i = 0; i < 12; i++) {
      ep.push({ art: "phase", startMs: t, dauerS: 30 * 60, level: 1 });
      t += 30 * 60_000;
      ep.push({ art: "wach", startMs: t, dauerS: (i === 5 ? 25 : 5) * 60, level: 3 });
      t += (i === 5 ? 25 : 5) * 60_000;
    }
    ep.push({ art: "phase", startMs: t, dauerS: 10 * 60, level: 0 });
    n.epochen = ep;
    const z = analysiereZusammenfassung(n);
    expect(z.anzahlWachphasen).toBe(12);
    expect(z.laengsteWachphaseS).toBe(25 * 60);
    const r = regelBewertung(z, analysierePhasen(n))!;
    expect(r.teile.find((x) => x.regel.startsWith("Wachphasen"))!.punkte).toBe(0);
    const a = analysiereSchlaf(n, []);
    expect(a.auffaelligkeiten.join(" ")).toMatch(/Viele Wachphasen \(12\)/);
    expect(a.auffaelligkeiten.join(" ")).toMatch(/Lange Wachphase von 25 Min/);
  });

  it("Datenqualität erkennt Lücken (halbe HF-Reihe = lückenhaft)", () => {
    const n = basis();
    const erwartet = (8 * 3600) / 120;
    n.zeitreihen.hr = { punkte: [[0, 50]], rohAnzahl: Math.floor(erwartet / 2), rohAufloesungS: 120, quelle: "get_sleep_data" };
    const hr = datenqualitaet(n).find((d) => d.metrik === "hr")!;
    expect(hr.proz).toBe(50);
    expect(hr.status).toBe("lueckenhaft");
  });

  it("Kernwerte: Garmin-Zusammenfassung hat Vorrang vor den Reihen", () => {
    const { nacht } = fixtureNacht("2026-11-04");
    expect(kernwerte(nacht, { atemMittel: 99 }).atemMittel).toBe(99);
    expect(kernwerte(nacht).atemMittel).not.toBeNull();
  });
});
