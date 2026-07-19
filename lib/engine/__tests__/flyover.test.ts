import { describe, expect, it } from "vitest";
import {
  baueGraphDaten,
  berechneK,
  FLYOVER_DAUER_S,
  FlyoverStreamsInput,
  ProcessedTrack,
  SampleCursor,
  sampleAt,
  verarbeiteStreams,
  wrapDelta,
} from "../flyover";

/** Synthetischer Track: Segmente mit [dauerS, geschwindigkeit m/s] nach Osten */
function syntheticTrack(
  segmente: [number, number][],
  schrittS = 1
): FlyoverStreamsInput {
  const zeitS: number[] = [];
  const lat: number[] = [];
  const lng: number[] = [];
  const ele: number[] = [];
  const hr: number[] = [];
  const distanzM: number[] = [];
  let t = 0;
  let x = 0; // Meter nach Osten
  const mProGradLng = 111_320 * Math.cos((47 * Math.PI) / 180);
  for (const [dauer, v] of segmente) {
    for (let s = 0; s < dauer; s += schrittS) {
      zeitS.push(t);
      lat.push(47);
      lng.push(8 + x / mProGradLng);
      ele.push(400);
      hr.push(140 + v * 5);
      distanzM.push(x);
      t += schrittS;
      x += v * schrittS;
    }
  }
  zeitS.push(t);
  lat.push(47);
  lng.push(8 + x / mProGradLng);
  ele.push(400);
  hr.push(150);
  distanzM.push(x);
  return { zeitS, lat, lng, ele, hr, distanzM };
}

function track(segmente: [number, number][], opt = {}): ProcessedTrack {
  const t = verarbeiteStreams(syntheticTrack(segmente), opt);
  if (!t) throw new Error("Track darf nicht null sein");
  return t;
}

describe("Dauer (DoD 1)", () => {
  it.each([[10], [300], [3600], [21600]])(
    "T_real=%ds: sampleAt bei t_v=30 trifft exakt den letzten Punkt",
    (dauer) => {
      const tr = track([[dauer, 3]], { maxPunkte: 2000 });
      const k = berechneK(tr);
      expect(k).toBeCloseTo(tr.totalDuration / FLYOVER_DAUER_S, 6);
      const ende = sampleAt(tr, FLYOVER_DAUER_S * k);
      expect(ende.distCum).toBeCloseTo(tr.totalDistance, 3);
      expect(ende.tRel).toBeCloseTo(tr.totalDuration, 6);
    }
  );
});

describe("Verhältnistreue (DoD 2 — wichtigster Test)", () => {
  it("7:00/km vs 3:00/km bleibt exakt 7/3", () => {
    // A: 7:00 min/km = 2.381 m/s über 600 s · B: 3:00 min/km = 5.556 m/s über 300 s
    const vA = 1000 / 420;
    const vB = 1000 / 180;
    const tr = track([
      [600, vA],
      [300, vB],
    ]);
    const k = berechneK(tr);
    // Videofenster mitten in A bzw. B (Realzeit / k = Videozeit)
    const fenster = 0.5; // Videosekunden
    const messe = (tvStart: number) => {
      const s1 = sampleAt(tr, tvStart * k);
      const s2 = sampleAt(tr, (tvStart + fenster) * k);
      return (s2.distCum - s1.distCum) / fenster;
    };
    const vVideoA = messe(300 / k / 1); // Realzeit 300 s → Video
    const vVideoB = messe(750 / k);
    const ratio = vVideoB / vVideoA;
    expect(Math.abs(ratio - 7 / 3)).toBeLessThan(0.01 * (7 / 3));
  });
});

describe("Monotonie (DoD 3)", () => {
  it("distCum über alle Frames streng monoton nicht fallend", () => {
    const tr = track([
      [200, 2],
      [50, 6],
      [200, 2.5],
    ]);
    const k = berechneK(tr);
    const cursor = new SampleCursor();
    let letzte = -1;
    for (let f = 0; f <= 300; f++) {
      const st = sampleAt(tr, (FLYOVER_DAUER_S * f * k) / 300, cursor);
      expect(st.distCum).toBeGreaterThanOrEqual(letzte);
      letzte = st.distCum;
    }
  });
});

describe("Skaleninvarianz (DoD 4)", () => {
  it("doppelte Realdauer → identische Position pro Videoframe", () => {
    const tr1 = track([
      [300, 3],
      [100, 5],
    ]);
    // gleiche Geometrie, halbe Geschwindigkeit = doppelte Dauer
    const tr2 = track([
      [600, 1.5],
      [200, 2.5],
    ]);
    const k1 = berechneK(tr1);
    const k2 = berechneK(tr2);
    expect(k2).toBeCloseTo(2 * k1, 5);
    for (const tv of [0, 7.5, 15, 22.5, 30]) {
      const a = sampleAt(tr1, tv * k1);
      const b = sampleAt(tr2, tv * k2);
      expect(b.distCum).toBeCloseTo(a.distCum, 0);
      expect(b.lng).toBeCloseTo(a.lng, 5);
    }
  });
});

describe("Anti-Bogenlängen-Regression (DoD 5)", () => {
  it("ungleichmässiges Tempo ⇒ ungleichmässige Frame-Distanzschritte", () => {
    const tr = track([
      [600, 1000 / 420],
      [300, 1000 / 180],
    ]);
    const k = berechneK(tr);
    const cursor = new SampleCursor();
    const schritte: number[] = [];
    let vorher = sampleAt(tr, 0, cursor).distCum;
    for (let f = 1; f <= 120; f++) {
      const st = sampleAt(tr, (FLYOVER_DAUER_S * f * k) / 120, cursor);
      schritte.push(st.distCum - vorher);
      vorher = st.distCum;
    }
    const mittel = schritte.reduce((a, b) => a + b, 0) / schritte.length;
    const std = Math.sqrt(
      schritte.reduce((a, b) => a + (b - mittel) ** 2, 0) / schritte.length
    );
    // Bogenlängen-Parametrisierung hätte std ≈ 0 — verboten
    expect(std / mittel).toBeGreaterThan(0.05);
  });
});

describe("Pausen (DoD 6)", () => {
  it("compress kappt eine 10-Minuten-Pause, Bewegungs-Verhältnisse bleiben", () => {
    const segmente: [number, number][] = [
      [300, 3],
      [600, 0.05], // 10 min quasi Stillstand
      [300, 5],
    ];
    const keep = track(segmente, { pausen: "keep" });
    const comp = track(segmente, { pausen: "compress", pauseThresholdS: 20 });
    expect(comp.pausenKomprimiert).toBe(true);
    // Dauer sinkt um ~580 s
    expect(keep.totalDuration - comp.totalDuration).toBeGreaterThan(500);
    // Verhältnis der bewegten Abschnitte bleibt 5/3
    const k = berechneK(comp);
    const messe = (tRealStart: number) => {
      const s1 = sampleAt(comp, tRealStart);
      const s2 = sampleAt(comp, tRealStart + 10);
      return (s2.distCum - s1.distCum) / 10;
    };
    const ratio = messe(comp.totalDuration - 100) / messe(100);
    expect(Math.abs(ratio - 5 / 3)).toBeLessThan(0.15);
    expect(k).toBeGreaterThan(0);
  });
});

describe("Randfälle (DoD 7)", () => {
  it("leerer Track / einzelner Punkt / identische Punkte → null statt Crash", () => {
    const leer: FlyoverStreamsInput = { zeitS: [], lat: [], lng: [], ele: [], hr: [], distanzM: [] };
    expect(verarbeiteStreams(leer)).toBeNull();
    const einer: FlyoverStreamsInput = {
      zeitS: [0],
      lat: [47],
      lng: [8],
      ele: [400],
      hr: [120],
      distanzM: [0],
    };
    expect(verarbeiteStreams(einer)).toBeNull();
    const identisch: FlyoverStreamsInput = {
      zeitS: [0, 1, 2],
      lat: [47, 47, 47],
      lng: [8, 8, 8],
      ele: [400, 400, 400],
      hr: [120, 120, 120],
      distanzM: [0, 0, 0],
    };
    expect(verarbeiteStreams(identisch)).toBeNull();
  });

  it("Zeitsprünge rückwärts und fehlende Höhen werden bereinigt", () => {
    const s = syntheticTrack([[60, 3]]);
    s.zeitS[10] = 5; // Rücksprung
    s.ele = s.ele.map((_, i) => (i % 3 === 0 ? null : 400));
    const tr = verarbeiteStreams(s);
    expect(tr).not.toBeNull();
    for (let i = 1; i < tr!.punkte.length; i++) {
      expect(tr!.punkte[i].tRel).toBeGreaterThan(tr!.punkte[i - 1].tRel);
      expect(isFinite(tr!.punkte[i].ele)).toBe(true);
    }
  });

  it("Ausreisser (Teleport-Punkt) fliegt raus", () => {
    const s = syntheticTrack([[120, 3]]);
    s.lat[60] = 47.5; // ~55 km Sprung in 1 s
    const tr = verarbeiteStreams(s);
    expect(tr).not.toBeNull();
    expect(tr!.totalDistance).toBeLessThan(1000);
  });
});

describe("Graph-Aufbereitung (7.5)", () => {
  it("Min-Max-Decimation erhält Sprint-Spitzen (≥ 95 % des Rohmaximums)", () => {
    const tr = track([
      [1200, 2.4],
      [20, 5.5], // 20-s-Sprint
      [1200, 2.4],
    ]);
    const g = baueGraphDaten(tr, 400);
    const maxResampled = Math.max(...g.speed);
    const maxRoh = Math.max(...tr.punkte.map((p) => p.speed));
    expect(maxResampled).toBeGreaterThanOrEqual(maxRoh * 0.95);
  });

  it("Track ohne HF: hatHr=false, keine Exception", () => {
    const s = syntheticTrack([[120, 3]]);
    s.hr = s.hr.map(() => null);
    const tr = verarbeiteStreams(s)!;
    const g = baueGraphDaten(tr);
    expect(g.hatHr).toBe(false);
    expect(g.zeit.length).toBeGreaterThan(100);
  });
});

describe("wrapDelta", () => {
  it("liefert kürzeste Winkeldifferenz", () => {
    expect(wrapDelta(350 - 10)).toBeCloseTo(-20, 6);
    expect(wrapDelta(10 - 350)).toBeCloseTo(20, 6);
    expect(wrapDelta(180)).toBeCloseTo(-180, 6);
  });
});
