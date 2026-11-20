import { describe, expect, it } from "vitest";
import {
  bewerteAlle,
  bewerteMessung,
  bewerteNeu,
  gleitenderMedian,
  kennzahlen,
  klasseFuer,
  komposition,
  LEERE_BEDINGUNGEN,
  minuteDesTages,
  standardTrend,
  tageswerte,
  trainingAbstand,
  veraenderung,
  type GewichtMessung,
  type Messbedingungen,
} from "../gewicht";

/** Ortszeit Zürich (Winter, MEZ = UTC+1) → ISO-UTC */
const zh = (datum: string, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(+datum.slice(0, 4), +datum.slice(5, 7) - 1, +datum.slice(8, 10), h - 1, m)).toISOString();
};

let n = 0;
const messung = (datum: string, hhmm: string, kg: number, extra: Partial<GewichtMessung> = {}): GewichtMessung => ({
  id: `m${++n}`,
  zeitpunkt: zh(datum, hhmm),
  datum,
  gewichtKg: kg,
  bmi: null,
  koerperfettProz: null,
  koerperwasserProz: null,
  muskelmasseKg: null,
  knochenmasseKg: null,
  quelle: "INDEX_SCALE",
  ...extra,
});

const b = (x: Partial<Messbedingungen>): Messbedingungen => ({ ...LEERE_BEDINGUNGEN, ...x });
const ohneSport = { aktivitaeten: [], referenzMinute: null };
const VOLL = b({ nuechtern: true, vorFruehstueck: true, nachToilette: true, mahlzeitVorMin: 600, fluessigkeitVorMin: 480 });

describe("Messqualität", () => {
  it("Ortszeit Zürich", () => {
    expect(minuteDesTages(zh("2026-12-01", "06:45"))).toBe(6 * 60 + 45);
  });

  it("ideale Morgenmessung mit vollständigem Protokoll = 100", () => {
    const q = bewerteMessung(messung("2026-12-01", "06:30", 80), VOLL, { aktivitaeten: [], referenzMinute: 6 * 60 + 40 });
    expect(q.score).toBe(100);
    expect(q.klasse).toBe("sehr_gut");
    expect(q.datenstatus).toBe("vollstaendig");
    expect(q.trendTauglich).toBe(true);
  });

  it("fehlende Angaben zählen nie als erfüllt — die Uhrzeit beweist kein Nüchternsein", () => {
    const q = bewerteMessung(messung("2026-12-01", "06:30", 80), LEERE_BEDINGUNGEN, ohneSport);
    // nur morgens (15) und Sport aus Garmin-Aktivitäten (10)
    expect(q.score).toBe(25);
    expect(q.kriterien.find((k) => k.id === "nuechtern")!.status).toBe("unbekannt");
    expect(q.datenstatus).toBe("keine_angaben");
    expect(q.fehlend).toContain("Nüchtern");
    // Morgenmessung ohne Gegenanzeige darf in den Trend (gekennzeichnet als gering)
    expect(q.klasse).toBe("gering");
    expect(q.trendTauglich).toBe(true);
  });

  it("ohne Aktivitätsdaten ist auch der Sport-Abstand unbekannt", () => {
    const q = bewerteMessung(messung("2026-12-01", "06:30", 80), LEERE_BEDINGUNGEN, { aktivitaeten: null, referenzMinute: null });
    expect(q.kriterien.find((k) => k.id === "sport")!.status).toBe("unbekannt");
    expect(q.score).toBe(15);
  });

  it("Widerspruch: nüchtern, aber nach dem Frühstück → keine Punkte, gemeldet, nicht trendtauglich", () => {
    const q = bewerteMessung(messung("2026-12-01", "08:00", 80), b({ nuechtern: true, vorFruehstueck: false }), ohneSport);
    expect(q.widersprueche).toHaveLength(1);
    expect(q.kriterien.find((k) => k.id === "nuechtern")!.status).toBe("widerspruch");
    expect(q.kriterien.find((k) => k.id === "nuechtern")!.punkte).toBe(0);
    expect(q.trendTauglich).toBe(false);
  });

  it("Widerspruch: nüchtern, aber vor 30 Min gegessen", () => {
    const q = bewerteMessung(messung("2026-12-01", "07:00", 80), b({ nuechtern: true, mahlzeitVorMin: 30 }), ohneSport);
    expect(q.widersprueche[0]).toMatch(/weniger als 2 Stunden/);
    expect(q.kriterien.find((k) => k.id === "mahlzeit")!.status).toBe("nicht_erfuellt");
  });

  it("«nüchtern» erfüllt abgeleitet auch «vor dem Frühstück» und «≥ 2 h nach dem Essen»", () => {
    const q = bewerteMessung(messung("2026-12-01", "06:30", 80), b({ nuechtern: true }), ohneSport);
    const vf = q.kriterien.find((k) => k.id === "vorFruehstueck")!;
    expect(vf).toMatchObject({ status: "erfuellt", herkunft: "abgeleitet" });
    expect(q.kriterien.find((k) => k.id === "mahlzeit")!.herkunft).toBe("abgeleitet");
    // Trinken lässt sich nicht ableiten
    expect(q.kriterien.find((k) => k.id === "fluessigkeit")!.status).toBe("unbekannt");
    expect(q.score).toBe(15 + 25 + 10 + 10 + 10);
  });

  it("Training aus Garmin: < 2 h vorher kostet Punkte, Bad/Sauna ebenso", () => {
    const start = Date.parse(zh("2026-12-01", "06:00"));
    const akt = [{ startMs: start, endeMs: start + 45 * 60_000 }];
    const m = messung("2026-12-01", "07:15", 80);
    expect(trainingAbstand(Date.parse(m.zeitpunkt), akt)).toBe(30);
    const q = bewerteMessung(m, LEERE_BEDINGUNGEN, { aktivitaeten: akt, referenzMinute: null });
    expect(q.kriterien.find((k) => k.id === "sport")).toMatchObject({ status: "nicht_erfuellt", herkunft: "garmin" });
    expect(q.trendTauglich).toBe(false);
    const sauna = bewerteMessung(messung("2026-12-01", "07:15", 80), b({ badSauna: true }), ohneSport);
    expect(sauna.kriterien.find((k) => k.id === "sport")!.status).toBe("nicht_erfuellt");
  });

  it("Abendmessung nach dem Essen ist gering vergleichbar und nicht trendtauglich", () => {
    const q = bewerteMessung(
      messung("2026-12-01", "19:30", 81.5),
      b({ nuechtern: false, vorFruehstueck: false, mahlzeitVorMin: 40, fluessigkeitVorMin: 10, nachToilette: false }),
      ohneSport
    );
    expect(q.klasse).toBe("gering");
    expect(q.tageszeit).toBe("abends");
    expect(q.trendTauglich).toBe(false);
  });

  it("Klassengrenzen", () => {
    expect([100, 85, 84, 70, 69, 45, 44, 0].map(klasseFuer)).toEqual([
      "sehr_gut", "sehr_gut", "gut", "gut", "eingeschraenkt", "eingeschraenkt", "gering", "gering",
    ]);
  });
});

describe("Übliche Messzeit", () => {
  it("entsteht erst nach drei früheren tauglichen Messungen, ohne Zirkelbezug", () => {
    const ms = ["2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04"].map((d) => messung(d, "06:30", 80));
    const bew = bewerteAlle(ms, {}, []);
    expect(bew[0].qualitaet.kriterien.find((k) => k.id === "messzeit")!.status).toBe("unbekannt");
    expect(bew[3].qualitaet.kriterien.find((k) => k.id === "messzeit")!.status).toBe("erfuellt");
    const spaet = bewerteAlle([...ms, messung("2026-12-05", "09:45", 80)], {}, []);
    expect(spaet.at(-1)!.qualitaet.kriterien.find((k) => k.id === "messzeit")!.status).toBe("nicht_erfuellt");
  });
});

describe("Standardisierter Trend", () => {
  it("pro Tag die beste Messung, Abendmessung zählt nicht", () => {
    const morgen = messung("2026-12-01", "06:30", 80);
    const abend = messung("2026-12-01", "20:00", 82);
    const bew = bewerteAlle([morgen, abend], { [morgen.id]: VOLL, [abend.id]: b({ nuechtern: false, mahlzeitVorMin: 30 }) }, []);
    const tw = tageswerte(bew);
    expect(tw).toHaveLength(1);
    expect(tw[0].id).toBe(morgen.id);
  });

  it("bei gleichem Score gewinnt die Morgenmessung", () => {
    const frueh = messung("2026-12-01", "06:00", 80);
    const mittag = messung("2026-12-01", "12:00", 80.6);
    const bed = { [frueh.id]: VOLL, [mittag.id]: { ...VOLL } };
    const tw = tageswerte(bewerteAlle([mittag, frueh], bed, []));
    expect(tw[0].id).toBe(frueh.id);
  });

  it("7-Tage-Median erst ab drei Tageswerten, ohne aufgefüllte Tage", () => {
    const werte = [
      { datum: "2026-12-01", wert: 80 },
      { datum: "2026-12-02", wert: 81 },
      { datum: "2026-12-04", wert: 79 },
      { datum: "2026-12-05", wert: 90 }, // Ausreisser
      { datum: "2026-12-20", wert: 78 },
    ];
    const t = gleitenderMedian(werte, 7, 3);
    expect(t.map((p) => p.datum)).toEqual(["2026-12-04", "2026-12-05"]);
    expect(t[0].kg).toBe(80);
    expect(t[1].kg).toBe(80.5); // Median dämpft den Ausreisser
    // 20.12.: allein im Fenster → kein Trendwert
  });

  it("Rohwerte bleiben unverändert — keine Kilogramm-Korrektur", () => {
    const ms = [messung("2026-12-01", "21:00", 82.3)];
    const bew = bewerteAlle(ms, {}, []);
    expect(bew[0].gewichtKg).toBe(82.3);
    expect(standardTrend(bew)).toEqual([]);
  });

  it("Veränderung über 7 Tage aus dem Trend, null ohne Vergleichspunkt", () => {
    const trend = [
      { datum: "2026-12-01", kg: 81, n: 3 },
      { datum: "2026-12-04", kg: 80.6, n: 4 },
      { datum: "2026-12-08", kg: 80.2, n: 5 },
    ];
    expect(veraenderung(trend, 7)).toEqual({ kg: -0.8, seit: "2026-12-01" });
    expect(veraenderung(trend, 30)).toBeNull();
  });
});

describe("Kennzahlen und Zusammensetzung", () => {
  const ms = Array.from({ length: 10 }, (_, i) =>
    messung(`2026-12-${String(i + 1).padStart(2, "0")}`, "06:30", 81 - i * 0.1, { koerperfettProz: 18 + (i % 2) * 0.4 })
  );
  const bew = bewerteAlle(ms, {}, []);
  const trend = standardTrend(bew);

  it("Zeitraum-Kennzahlen", () => {
    const k = kennzahlen(bew, trend, "2026-12-04", "2026-12-10");
    expect(k.aktuell?.kg).toBeCloseTo(80.1);
    expect(k.zeitraum.anzahl).toBe(7);
    expect(k.zeitraum.tiefst?.kg).toBeCloseTo(80.1);
    expect(k.zeitraum.hoechst?.kg).toBeCloseTo(80.7);
    expect(k.zeitraum.trendDelta).toBeLessThan(0);
    expect(k.veraenderung7?.kg).toBeLessThan(0);
    expect(k.zeitraum.qualitaet).not.toBeNull();
  });

  it("Körperfett getrennt vom Gewicht, mit eigenem Median", () => {
    const r = komposition(bew, "koerperfettProz");
    expect(r.punkte).toHaveLength(10);
    expect(r.trend.length).toBeGreaterThan(0);
    expect(komposition(bew, "bmi").punkte).toEqual([]);
  });
});

describe("bewerteNeu (Vorschau im Messprotokoll)", () => {
  it("rechnet mit denselben automatischen Informationen wie die Gesamtbewertung", () => {
    const start = Date.parse(zh("2026-12-05", "06:00"));
    const ms = ["2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04", "2026-12-05"].map((d) => messung(d, "07:10", 80));
    const bew = bewerteAlle(ms, {}, [{ startMs: start, endeMs: start + 40 * 60_000 }]);
    const letzte = bew.at(-1)!;
    expect(letzte.trainingAbstandMin).toBe(30);
    expect(bewerteNeu(letzte, letzte.bedingungen)).toEqual(letzte.qualitaet);
    const mitAngaben = bewerteNeu(letzte, { ...letzte.bedingungen, nuechtern: true, nachToilette: true });
    expect(mitAngaben.score).toBeGreaterThan(letzte.qualitaet.score);
  });
});

