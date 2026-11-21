import { describe, expect, it } from "vitest";
import { analysiereLauf, type LaufStreams } from "../aerobe-abschnitte";
import { medianPaceBeiHr } from "../pace-bei-hr";

interface Phase {
  dauerS: number;
  /** Geschwindigkeit in m/s */
  v: number;
  /** Zielpuls; der echte Puls folgt verzögert (Zeitkonstante 20 s) */
  hr: number;
  steigung?: number;
}

/** Synthetischer Lauf im Sekundentakt mit leichtem, reproduzierbarem Rauschen */
function lauf(phasen: Phase[], startPuls = 105): LaufStreams & { ele: number[] } {
  let seed = 7;
  const zufall = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647 - 0.5;
  };
  const zeitS: number[] = [];
  const distanzM: number[] = [];
  const hr: (number | null)[] = [];
  const ele: number[] = [];
  let t = 0;
  let d = 0;
  let e = 520;
  let puls = startPuls;
  for (const p of phasen) {
    for (let i = 0; i < p.dauerS; i++) {
      puls += (p.hr - puls) * (1 - Math.exp(-1 / 20));
      zeitS.push(t);
      distanzM.push(Math.round(d * 10) / 10);
      hr.push(Math.round(puls + zufall() * 2));
      ele.push(Math.round(e * 10) / 10);
      const v = p.v * (1 + zufall() * 0.04);
      t += 1;
      d += v;
      e += v * (p.steigung ?? 0);
    }
  }
  return { zeitS, distanzM, hr, ele };
}

const gleichmaessig = (hr: number, v: number, dauerS = 2700) => lauf([{ dauerS, v, hr }]);
const alteMethode = (s: LaufStreams) => medianPaceBeiHr(s, { refHr: 148 });

describe("Abschnitte: lockere und gleichmässige Läufe", () => {
  it("1 · Zone-2-Lauf mit 135 bpm liefert stabile Abschnitte — die bisherige 148-bpm-Methode verwirft ihn", () => {
    const s = gleichmaessig(135, 2.63);
    const a = analysiereLauf(s);
    expect(a.status).toBe("ok");
    // 45 Min. − 8 Min. Aufwärmen − 2 Min. Auslaufen ≈ 35 Min. → 6–7 Abschnitte à 5 Min.
    expect(a.abschnitte.length).toBeGreaterThanOrEqual(6);
    expect(a.abschnitte.length).toBeLessThanOrEqual(7);
    for (const [hf, v, dauer] of a.abschnitte) {
      expect(hf).toBeGreaterThan(133.5);
      expect(hf).toBeLessThan(136.5);
      expect(v).toBeCloseTo(2.63, 1);
      expect(dauer).toBeGreaterThanOrEqual(295);
    }
    expect(alteMethode(s)).toBeNull();
  });

  it("2 · lockerer Lauf mit 140 bpm zählt ebenfalls", () => {
    const s = gleichmaessig(140, 2.77);
    const a = analysiereLauf(s);
    expect(a.status).toBe("ok");
    expect(a.abschnitte.length).toBeGreaterThanOrEqual(6);
    expect(alteMethode(s)).toBeNull();
  });

  it("3 · Dauerlauf mit 148 bpm: Abschnitte direkt am Referenzpuls, auch die alte Methode greift", () => {
    const s = gleichmaessig(148, 3.0);
    const a = analysiereLauf(s);
    expect(a.status).toBe("ok");
    expect(a.abschnitte.every(([hf]) => Math.abs(hf - 148) <= 1.5)).toBe(true);
    expect(alteMethode(s)?.paceSKm).toBeCloseTo(1000 / 3, -1);
  });

  it("4 · Lauf mit 155 bpm wird erkannt (die alte Methode verwirft ihn)", () => {
    const s = gleichmaessig(155, 3.22);
    const a = analysiereLauf(s);
    expect(a.status).toBe("ok");
    expect(a.abschnitte[0][0]).toBeGreaterThan(153);
    expect(alteMethode(s)).toBeNull();
  });

  it("ignoriert die Aufwärmphase, in der der Puls noch steigt", () => {
    const s = lauf([
      { dauerS: 600, v: 2.4, hr: 125 },
      { dauerS: 2100, v: 2.7, hr: 140 },
    ]);
    const a = analysiereLauf(s);
    expect(a.status).toBe("ok");
    // kein Abschnitt mischt den Übergang 125 → 140 bpm
    expect(a.abschnitte.every(([hf]) => hf > 137)).toBe(true);
  });

  it("rechnet Steigungen heraus (GAP): bergauf zählt flachäquivalent schneller", () => {
    const flach = analysiereLauf(gleichmaessig(145, 2.5));
    const berg = analysiereLauf(lauf([{ dauerS: 2700, v: 2.5, hr: 145, steigung: 0.04 }]));
    expect(berg.hoehe).toBe(true);
    expect(berg.abschnitte[0][1]).toBeGreaterThan(flach.abschnitte[0][1] * 1.1);
  });

  it("überspringt Gehpausen statt sie in den Abschnitt zu mischen", () => {
    const s = lauf([
      { dauerS: 1500, v: 2.7, hr: 140 },
      { dauerS: 120, v: 1.1, hr: 120 },
      { dauerS: 1500, v: 2.7, hr: 140 },
    ]);
    const a = analysiereLauf(s);
    expect(a.status).toBe("ok");
    expect(a.abschnitte.every(([, v]) => Math.abs(v - 2.7) < 0.05)).toBe(true);
  });
});

describe("Abschnitte: was nicht vergleichbar ist", () => {
  it("5 · Intervalle mit stark schwankendem Puls ergeben keinen Abschnitt (kein Mittel aus Belastung und Trabpause)", () => {
    const phasen: Phase[] = [{ dauerS: 480, v: 2.6, hr: 130 }];
    for (let i = 0; i < 10; i++) phasen.push({ dauerS: 90, v: 4.2, hr: 168 }, { dauerS: 90, v: 2.0, hr: 132 });
    phasen.push({ dauerS: 120, v: 2.4, hr: 135 });
    const a = analysiereLauf(lauf(phasen));
    expect(a.status).toBe("instabil");
    expect(a.abschnitte).toEqual([]);
  });

  it("6a · ohne Herzfrequenz: keine Auswertung", () => {
    const s = gleichmaessig(140, 2.8);
    const a = analysiereLauf({ ...s, hr: s.hr.map(() => null) });
    expect(a.status).toBe("keine_hf");
    expect(a.abschnitte).toEqual([]);
  });

  it("6b · lückenhafte Herzfrequenz (alle 2 Min. 40 s Ausfall): Fenster werden verworfen", () => {
    const s = gleichmaessig(140, 2.8);
    const a = analysiereLauf({ ...s, hr: s.hr.map((h, i) => (i % 120 < 40 ? null : h)) });
    expect(a.status).toBe("hf_luecken");
    expect(a.hfAbdeckung).toBeLessThan(0.7);
  });

  it("6c · ein einzelner Sensorausfall kostet nur die betroffenen Fenster", () => {
    const s = gleichmaessig(140, 2.8, 3000);
    const a = analysiereLauf({ ...s, hr: s.hr.map((h, i) => (i >= 1500 && i < 1560 ? null : h)) });
    expect(a.status).toBe("ok");
    expect(a.abschnitte.length).toBeGreaterThanOrEqual(5);
    expect(a.hfAbdeckung).toBeLessThan(1);
  });

  it("7 · GPS-Ausreisser verfälschen die Geschwindigkeit nicht", () => {
    const s = gleichmaessig(142, 2.8);
    let sprung = 0;
    const distanzM = s.distanzM.map((d, i) => {
      if ([700, 1100, 1500, 1900].includes(i)) sprung += 60; // Sprung um 60 m
      if (i === 2300) sprung += 3; // kleiner Ausreisser: 5.8 m/s statt 2.8 m/s
      return (d as number) + sprung;
    });
    const a = analysiereLauf({ ...s, distanzM });
    expect(a.status).toBe("ok");
    expect(a.ausreisser).toBeGreaterThanOrEqual(5);
    for (const [, v] of a.abschnitte) expect(Math.abs(v - 2.8) / 2.8).toBeLessThan(0.01);
  });

  it("zu kurze Läufe und fehlende Zeitreihen werden gekennzeichnet", () => {
    expect(analysiereLauf(gleichmaessig(140, 2.8, 700)).status).toBe("zu_kurz");
    expect(analysiereLauf({ zeitS: [], distanzM: [], hr: [] }).status).toBe("keine_streams");
  });

  it("ohne Höhenprofil bleibt die Geschwindigkeit roh und ist so markiert", () => {
    const s = gleichmaessig(140, 2.8);
    const a = analysiereLauf({ ...s, ele: null });
    expect(a.status).toBe("ok");
    expect(a.hoehe).toBe(false);
  });

  it("speichert die Pulsverteilung der Bewegungszeit (2-bpm-Klassen)", () => {
    const a = analysiereLauf(gleichmaessig(140, 2.8));
    expect(a.hfVon).not.toBeNull();
    const summe = a.hfS.reduce((x, y) => x + y, 0);
    expect(summe).toBeGreaterThan(2600);
    // der grösste Teil liegt in der Klasse 140–141 oder direkt daneben
    const spitze = a.hfS.indexOf(Math.max(...a.hfS));
    expect(Math.abs((a.hfVon as number) + 2 * spitze - 140)).toBeLessThanOrEqual(2);
  });
});
