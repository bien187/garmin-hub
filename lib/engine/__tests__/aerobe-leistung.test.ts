import { describe, expect, it } from "vitest";
import type { Abschnitt, LaufStatus } from "../aerobe-abschnitte";
import {
  altersGewicht,
  anteilBis,
  berechneAerobeLeistung,
  datenqualitaet,
  istZone2Lauf,
  modellFuer,
  normiere,
  robusteGerade,
  rollierenderTrend,
  type AerobLauf,
  type AerobPunkt,
  type Zone2Info,
} from "../aerobe-leistung";
import { addTage } from "@/lib/format";

/* Wahre Beziehung der fiktiven Läuferin: ln v = A + B·HF, 3.0 m/s (5:33/km) bei 148 bpm */
const B = 0.01;
const A0 = Math.log(3) - B * 148;
const vBei = (hf: number, a = A0) => Math.exp(a + B * hf);
const PACE_148 = 1000 / 3;

const ZONE2: Zone2Info = { von: 126, bis: 145, quelle: "garmin" };

function aLauf(
  id: number,
  datum: string,
  pulse: number[],
  opt: { a?: number; hoehe?: boolean; status?: LaufStatus; hmProKm?: number | null; alt?: number | null } = {}
): AerobLauf {
  const abschnitte: Abschnitt[] = pulse.map((h) => [h, Math.round(vBei(h, opt.a ?? A0) * 1000) / 1000, 300]);
  // Pulsverteilung: 8 Min. Aufwärmen 15 bpm tiefer, dazu die Abschnitte
  const klassen = new Map<number, number>();
  const plus = (hf: number, s: number) => klassen.set(Math.floor(hf / 2) * 2, (klassen.get(Math.floor(hf / 2) * 2) ?? 0) + s);
  plus((pulse[0] ?? 140) - 15, 480);
  for (const h of pulse) plus(h, 300);
  const von = Math.min(...klassen.keys());
  const bis = Math.max(...klassen.keys());
  const hfS: number[] = [];
  for (let k = von; k <= bis; k += 2) hfS.push(klassen.get(k) ?? 0);
  return {
    id,
    datum,
    status: opt.status ?? "ok",
    abschnitte: opt.status && opt.status !== "ok" ? [] : abschnitte,
    hoehe: opt.hoehe ?? true,
    hmProKm: opt.hmProKm === undefined ? 6 : opt.hmProKm,
    hfAbdeckung: 1,
    hfVon: von,
    hfS,
    alt: opt.alt ?? null,
  };
}

/**
 * Zwölf Wochen realistisches Training: überwiegend lockere Läufe bei
 * 135–140 bpm, dazu einige Dauerläufe bei 148 und Tempoläufe bei 155–160.
 */
function trainingsblock(start = "2026-09-01", wochen = 12): AerobLauf[] {
  const muster = [
    [135, 136, 137, 136, 138, 137],
    [140, 141, 140, 142, 141],
    [148, 149, 148, 147],
    [137, 136, 135, 136, 137, 138],
    [155, 156, 157, 158],
    [139, 140, 139, 141, 140],
  ];
  const out: AerobLauf[] = [];
  let id = 1;
  for (let w = 0; w < wochen; w++) {
    for (const [tag, m] of [
      [1, muster[(w * 3) % 6]],
      [3, muster[(w * 3 + 1) % 6]],
      [5, muster[(w * 3 + 2) % 6]],
    ] as const) {
      // leichte Tagesform: ±1 % Geschwindigkeit, reproduzierbar
      const form = Math.sin(id * 1.7) * 0.01;
      out.push(aLauf(id, addTage(start, w * 7 + tag), [...m], { a: A0 + form, alt: m.some((h) => Math.abs(h - 148) <= 3) ? 333 : null }));
      id++;
    }
  }
  return out;
}

describe("Statistik-Bausteine", () => {
  it("robuste Gerade findet die Steigung trotz Ausreisser", () => {
    const punkte = [130, 134, 138, 142, 146, 150, 154, 158].map((x) => ({ x, y: A0 + B * x, w: 1 }));
    punkte.push({ x: 140, y: A0 + B * 140 + 0.3, w: 1 }); // ein verkorkster Hitzelauf
    const g = robusteGerade(punkte)!;
    expect(g.b).toBeCloseTo(B, 3);
  });

  it("Altersgewichte: voll bis 14 Tage, dann abnehmend, ab 28 Tagen null", () => {
    expect(altersGewicht(0)).toBe(1);
    expect(altersGewicht(14)).toBe(1);
    expect(altersGewicht(21)).toBeCloseTo(0.5);
    expect(altersGewicht(27)).toBeCloseTo(0.2);
    expect(altersGewicht(28)).toBe(0);
    expect(altersGewicht(-1)).toBe(0);
  });

  it("Anteil der Bewegungszeit bis zur Obergrenze von Zone 2", () => {
    const locker = aLauf(1, "2026-09-01", [136, 137, 138, 137, 136, 137]);
    const tempo = aLauf(2, "2026-09-02", [156, 157, 158, 157]);
    expect(anteilBis(locker, 145)).toBe(1);
    expect(anteilBis(tempo, 145)!).toBeLessThan(0.4);
    expect(istZone2Lauf(locker, ZONE2)).toBe(true);
    expect(istZone2Lauf(tempo, ZONE2)).toBe(false);
  });
});

describe("Individuelles Modell und Normierung", () => {
  const laeufe = trainingsblock();

  it("schätzt die persönliche Puls-Tempo-Beziehung", () => {
    const m = modellFuer(laeufe, "2026-10-15")!;
    expect(m).not.toBeNull();
    expect(m.b).toBeGreaterThan(0.008);
    expect(m.b).toBeLessThan(0.012);
    expect(m.lo).toBeLessThanOrEqual(137);
    expect(m.hi).toBeGreaterThanOrEqual(155);
  });

  it("1 + 2 · Zone-2-Läufe (135–140 bpm) werden auf 148 bpm normiert statt verworfen", () => {
    const m = modellFuer(laeufe, "2026-10-15");
    const z2 = normiere(aLauf(99, "2026-10-15", [135, 136, 135, 134, 136]).abschnitte, 148, m, { hoehe: true, hfAbdeckung: 1 });
    expect("grund" in z2).toBe(false);
    if ("grund" in z2) return;
    expect(z2.art).toBe("geschaetzt");
    expect(Math.abs(z2.paceSKm - PACE_148)).toBeLessThan(3);
    expect(z2.q).toBeLessThan(1); // geschätzt zählt weniger als gemessen
  });

  it("3 · Lauf bei 148 bpm gilt als direkt gemessen", () => {
    const m = modellFuer(laeufe, "2026-10-15");
    const n = normiere(aLauf(98, "2026-10-15", [148, 148, 149, 147]).abschnitte, 148, m, { hoehe: true, hfAbdeckung: 1 });
    if ("grund" in n) throw new Error(n.grund);
    expect(n.art).toBe("gemessen");
    expect(n.q).toBe(1);
    expect(Math.abs(n.paceSKm - PACE_148)).toBeLessThan(2);
  });

  it("4 · Lauf bei 155 bpm wird nach unten normiert (langsamer als gelaufen)", () => {
    const m = modellFuer(laeufe, "2026-10-15");
    const abschnitte = aLauf(97, "2026-10-15", [155, 156, 155]).abschnitte;
    const n = normiere(abschnitte, 148, m, { hoehe: true, hfAbdeckung: 1 });
    if ("grund" in n) throw new Error(n.grund);
    expect(n.paceSKm).toBeGreaterThan(1000 / abschnitte[0][1]);
    expect(Math.abs(n.paceSKm - PACE_148)).toBeLessThan(3);
  });

  it("begrenzt die Extrapolation: ein Erholungslauf bei 118 bpm wird nicht auf 148 hochgerechnet", () => {
    const m = modellFuer(laeufe, "2026-10-15");
    const n = normiere(aLauf(96, "2026-10-15", [118, 119, 118]).abschnitte, 148, m, { hoehe: true, hfAbdeckung: 1 });
    expect(n).toEqual({ grund: "ausserhalb_modell" });
  });

  it("ohne Modell zählen nur Abschnitte direkt am Referenzpuls — unverändert", () => {
    const direkt = normiere(aLauf(95, "2026-10-15", [147, 148, 149]).abschnitte, 148, null, { hoehe: true, hfAbdeckung: 1 });
    expect("grund" in direkt).toBe(false);
    const fern = normiere(aLauf(94, "2026-10-15", [136, 137]).abschnitte, 148, null, { hoehe: true, hfAbdeckung: 1 });
    expect(fern).toEqual({ grund: "kein_modell" });
  });

  it("Läufe ohne Höhenprofil zählen nur auf flachen Strecken", () => {
    const r = berechneAerobeLeistung({
      laeufe: [
        ...laeufe,
        aLauf(201, "2026-11-10", [140, 141], { hoehe: false, hmProKm: 4 }),
        aLauf(202, "2026-11-11", [140, 141], { hoehe: false, hmProKm: 35 }),
        aLauf(203, "2026-11-12", [140, 141], { hoehe: false, hmProKm: null }),
      ],
      refHr: 148,
      zone2: ZONE2,
      heute: "2026-11-24",
    });
    const ids = r.hauptreihe.punkte.map((p) => p.id);
    expect(ids).toContain(201);
    expect(ids).not.toContain(202);
    expect(ids).not.toContain(203);
    expect(r.transparenz.ausgeschlossen.ohne_hoehe).toBe(2);
    expect(r.hauptreihe.punkte.find((p) => p.id === 201)!.hoehe).toBe(false);
  });
});

describe("Gesamtauswertung und Vergleich mit der bisherigen 148-bpm-Methode", () => {
  const laeufe = trainingsblock();
  const r = berechneAerobeLeistung({ laeufe, refHr: 148, zone2: ZONE2, heute: "2026-11-24" });

  it("berücksichtigt alle 36 Läufe statt nur der 6 mit Abschnitten bei 148 ± 3 bpm", () => {
    expect(r.hauptreihe.punkte).toHaveLength(36);
    expect(r.transparenz.bisherigeMethode).toBe(6);
    expect(r.hauptreihe.nichtVergleichbar).toBe(0);
    // alle normierten Werte liegen nahe an der wahren Pace bei 148 bpm (±1 % Tagesform)
    for (const p of r.hauptreihe.punkte) expect(Math.abs(p.paceSKm - PACE_148)).toBeLessThan(5);
  });

  it("Zone 2 Efficiency nutzt die überwiegend aeroben Läufe und ihren tatsächlichen Puls", () => {
    expect(r.zone2.laeufe).toBe(24); // alle Läufe mit Muster bis 142 bpm
    expect(r.zone2.reihe.ziel).toBeGreaterThanOrEqual(136);
    expect(r.zone2.reihe.ziel).toBeLessThanOrEqual(140);
    expect(r.zone2.reihe.punkte).toHaveLength(24);
  });

  it("meldet das Modell rund um heute", () => {
    expect(r.modell?.b).toBeCloseTo(B, 2);
  });

  it("zählt ausgeschlossene Läufe nach Grund", () => {
    const mit = berechneAerobeLeistung({
      laeufe: [...laeufe, aLauf(301, "2026-11-20", [], { status: "instabil" }), aLauf(302, "2026-11-21", [], { status: "keine_hf" })],
      refHr: 148,
      zone2: ZONE2,
      heute: "2026-11-24",
      offen: 3,
    });
    expect(mit.transparenz.ausgeschlossen.instabil).toBe(1);
    expect(mit.transparenz.ausgeschlossen.keine_hf).toBe(1);
    expect(mit.transparenz.offen).toBe(3);
    expect(mit.transparenz.laeufe).toBe(41);
  });

  it("10 · Zeitraum mit ausschliesslich lockeren Läufen: keine erfundenen 148-bpm-Werte, Zone 2 bleibt", () => {
    const locker: AerobLauf[] = [];
    for (let i = 0; i < 16; i++) locker.push(aLauf(i + 1, addTage("2026-09-01", i * 3), [135 + (i % 4), 136 + (i % 4), 137]));
    const nur = berechneAerobeLeistung({ laeufe: locker, refHr: 148, zone2: ZONE2, heute: "2026-10-20" });
    expect(nur.modell).toBeNull(); // Pulsspanne zu klein für ein belastbares Modell
    expect(nur.hauptreihe.punkte).toHaveLength(0);
    expect(nur.hauptreihe.nichtVergleichbar).toBe(16);
    expect(nur.zone2.reihe.punkte).toHaveLength(16);
  });
});

describe("Rollierender 28-Tage-Trend", () => {
  const punkt = (datum: string, paceSKm: number, q = 1, id = 0): AerobPunkt => ({
    id,
    datum,
    paceSKm,
    art: "gemessen",
    hf: 148,
    q,
    hoehe: true,
  });

  it("9 · mehrere Läufe in einer Woche fliessen gemeinsam ein", () => {
    const t = rollierenderTrend([punkt("2026-10-05", 340, 1, 1), punkt("2026-10-07", 336, 1, 2), punkt("2026-10-09", 338, 1, 3)], "2026-10-05", "2026-10-09");
    const letzter = t.at(-1)!;
    expect(letzter.anzahl).toBe(3);
    expect(letzter.paceSKm).toBeCloseTo(338, 0);
    expect(letzter.status).toBe("gemessen");
  });

  it("8 · Woche ohne Lauf: Trend bleibt, ist aber als fortgeschrieben markiert; nach 28 Tagen bricht er ab", () => {
    const punkte = [punkt("2026-10-01", 340), punkt("2026-10-03", 338), punkt("2026-10-05", 336)];
    const t = rollierenderTrend(punkte, "2026-10-01", "2026-11-10");
    const am = (d: string) => t.find((x) => x.datum === d)!;
    expect(am("2026-10-08").status).toBe("gemessen");
    expect(am("2026-10-13").status).toBe("fortgeschrieben");
    expect(am("2026-10-13").paceSKm).not.toBeNull();
    // 28 Tage nach dem letzten Lauf: keine Fortschreibung mehr
    expect(am("2026-11-02").paceSKm).toBeNull();
    expect(am("2026-11-02").status).toBeNull();
  });

  it("ein einzelner ungewöhnlicher Lauf verschiebt den Trend kaum", () => {
    const basis = ["2026-10-01", "2026-10-04", "2026-10-07", "2026-10-10", "2026-10-13"].map((d, i) => punkt(d, 335 + (i % 2), 1, i));
    const ohne = rollierenderTrend(basis, "2026-10-14", "2026-10-14")[0].paceSKm!;
    const mit = rollierenderTrend([...basis, punkt("2026-10-14", 380, 1, 9)], "2026-10-14", "2026-10-14")[0].paceSKm!;
    expect(Math.abs(mit - ohne)).toBeLessThan(4);
  });

  it("neuere Läufe zählen mehr als ältere", () => {
    const t = rollierenderTrend([punkt("2026-10-01", 350, 1, 1), punkt("2026-10-25", 330, 1, 2)], "2026-10-26", "2026-10-26")[0];
    expect(t.paceSKm!).toBeLessThan(340);
  });

  it("wenig Gewicht (ein alter, geschätzter Lauf) gilt als unsicher", () => {
    const t = rollierenderTrend([punkt("2026-10-01", 340, 0.6)], "2026-10-20", "2026-10-20")[0];
    expect(t.status).toBe("unsicher");
    expect(datenqualitaet(t)).toBe("gering");
  });

  it("Datenqualität: gut bei mehreren aktuellen, guten Läufen", () => {
    const punkte = ["2026-10-10", "2026-10-13", "2026-10-16", "2026-10-19"].map((d, i) => punkt(d, 336, 0.9, i));
    const t = rollierenderTrend(punkte, "2026-10-20", "2026-10-20")[0];
    expect(datenqualitaet(t)).toBe("gut");
    expect(datenqualitaet(null)).toBeNull();
  });
});
