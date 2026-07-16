/**
 * Eignungsprüfung (EP) Schweizer Armee-Grenadiere — Domänendaten.
 *
 * Notentabellen als stückweise lineare Interpolation zwischen den bekannten
 * Stützpunkten aus dem offiziellen Bewertungsraster. Zwischenwerte sind
 * interpoliert (Annäherung, im README dokumentiert).
 */

export type DisziplinId =
  | "lastlauf"
  | "klimmzuege"
  | "liegestuetze"
  | "rumpf_seitlich"
  | "rumpf_dorsal";

export interface Disziplin {
  id: DisziplinId;
  /** Reihenfolge am Prüfungstag */
  reihenfolge: number;
  name: string;
  kurzname: string;
  einheit: "sekunden" | "wiederholungen";
  /** true = höherer Wert ist besser (Wdh., Haltezeit); false = Zeit, tiefer besser */
  hoeherIstBesser: boolean;
  /** Physisches/reglementarisches Maximum (z.B. 120 s Halten), falls vorhanden */
  maxWert?: number;
  /** Stützpunkte [wert, note], aufsteigend nach Wert sortiert */
  stuetzpunkte: [number, number][];
  /** Persönliches Ziel (von/bis im Wert der Disziplin) */
  ziel: { von: number; bis: number };
  beschreibung: string;
  /** Bemerkenswerte Nichtlinearität, im UI markieren (Wert, an dem es steil abfällt) */
  stolperkante?: { vonWert: number; nachWert: number; hinweis: string };
}

export const EP_DISZIPLINEN: Record<DisziplinId, Disziplin> = {
  lastlauf: {
    id: "lastlauf",
    reihenfolge: 5,
    name: "5-km-Einzellauf mit 20 kg",
    kurzname: "5-km-Lastlauf",
    einheit: "sekunden",
    hoeherIstBesser: false,
    // ≤30:00 = 5.0 · ≤33:00 ≈ 4.6 · 35:01–36:00 = 4.0 · >40:00 = 1.0
    stuetzpunkte: [
      [1800, 5.0],
      [1980, 4.6],
      [2160, 4.0],
      [2400, 1.5],
    ],
    ziel: { von: 1800, bis: 1980 }, // ≤ 33 Min
    beschreibung:
      "5 km mit 20-kg-Rucksack, Kampfstiefeln und Tarnanzug. Note 5.0 ab 30:00, Ziel ≤ 33:00.",
  },
  klimmzuege: {
    id: "klimmzuege",
    reihenfolge: 1,
    name: "Klimmzüge (Ristgriff)",
    kurzname: "Klimmzüge",
    einheit: "wiederholungen",
    hoeherIstBesser: true,
    stuetzpunkte: [
      [5, 1.0],
      [6, 3.6],
      [7, 3.9],
      [8, 4.5],
      [9, 4.7],
      [10, 5.0],
    ],
    ziel: { von: 9, bis: 10 },
    beschreibung:
      "Ristgriff, keine Zeitlimite, sauber ausgeführt. Ziel: 9–10 Wiederholungen.",
    stolperkante: {
      vonWert: 8,
      nachWert: 7,
      hinweis: "Achtung: zwischen 8 (4.5) und 7 (3.9) fällt die Note steil ab.",
    },
  },
  liegestuetze: {
    id: "liegestuetze",
    reihenfolge: 2,
    name: "EP-Liegestütze (60 s)",
    kurzname: "Liegestütze",
    einheit: "wiederholungen",
    hoeherIstBesser: true,
    stuetzpunkte: [
      [20, 1.0],
      [30, 4.5],
      [35, 5.0],
    ],
    ziel: { von: 30, bis: 40 },
    beschreibung:
      "Spezialform: Start in Bauchlage mit Händen auf dem Rücken, oben abwechselnde Handberührung. 60 Sekunden.",
  },
  rumpf_seitlich: {
    id: "rumpf_seitlich",
    reihenfolge: 3,
    name: "Seitliche Rumpfkraft",
    kurzname: "Rumpf seitlich",
    einheit: "sekunden",
    hoeherIstBesser: true,
    maxWert: 120,
    // 120 s = 5.0 · 70–74 s = 4.0 · ≤45 s = 1.0 (Mittelwert 72 als Stützpunkt)
    stuetzpunkte: [
      [45, 1.0],
      [72, 4.0],
      [120, 5.0],
    ],
    ziel: { von: 95, bis: 110 },
    beschreibung:
      "Im Sekundentakt (Metronom 60 bpm), maximal 120 s. Ziel: 95–110 s.",
  },
  rumpf_dorsal: {
    id: "rumpf_dorsal",
    reihenfolge: 4,
    name: "Dorsale Rumpfkette",
    kurzname: "Rumpf dorsal",
    einheit: "sekunden",
    hoeherIstBesser: true,
    maxWert: 150,
    // 150 s = 5.0 · 100–104 s = 4.0 · ≤71 s = 1.0 (Mittelwert 102)
    stuetzpunkte: [
      [71, 1.0],
      [102, 4.0],
      [150, 5.0],
    ],
    ziel: { von: 120, bis: 135 },
    beschreibung:
      "Im Sekundentakt (Metronom 60 bpm), maximal 150 s. Ziel: 120–135 s.",
  },
};

export const EP_REIHENFOLGE: DisziplinId[] = Object.values(EP_DISZIPLINEN)
  .sort((a, b) => a.reihenfolge - b.reihenfolge)
  .map((d) => d.id);

/**
 * Notenberechnung: stückweise lineare Interpolation über die Stützpunkte,
 * geklemmt auf [1.0, 5.0].
 */
export function berechneNote(disziplin: DisziplinId, wert: number): number {
  const d = EP_DISZIPLINEN[disziplin];
  const pts = d.stuetzpunkte;

  if (d.hoeherIstBesser) {
    if (wert <= pts[0][0]) return wert < pts[0][0] ? 1.0 : pts[0][1];
    if (wert >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  } else {
    if (wert <= pts[0][0]) return pts[0][1];
    if (wert >= pts[pts.length - 1][0]) return 1.0;
  }

  for (let i = 1; i < pts.length; i++) {
    const [w0, n0] = pts[i - 1];
    const [w1, n1] = pts[i];
    if (wert <= w1) {
      const f = (wert - w0) / (w1 - w0);
      const note = n0 + f * (n1 - n0);
      return Math.min(5, Math.max(1, note));
    }
  }
  return 1.0;
}

/** Umkehrung: welcher Wert ist für eine Zielnote nötig? */
export function wertFuerNote(disziplin: DisziplinId, zielNote: number): number {
  const d = EP_DISZIPLINEN[disziplin];
  const pts = [...d.stuetzpunkte].sort((a, b) => a[1] - b[1]); // nach Note
  if (zielNote <= pts[0][1]) return pts[0][0];
  if (zielNote >= pts[pts.length - 1][1]) return pts[pts.length - 1][0];
  for (let i = 1; i < pts.length; i++) {
    const [w0, n0] = pts[i - 1];
    const [w1, n1] = pts[i];
    if (zielNote <= n1) {
      const f = (zielNote - n0) / (n1 - n0);
      return w0 + f * (w1 - w0);
    }
  }
  return pts[pts.length - 1][0];
}

export interface EpErgebnis {
  noten: Partial<Record<DisziplinId, number>>;
  schnitt: number | null;
  bestanden: boolean | null;
  /** 1.0 in einer Disziplin → praktisch nicht kompensierbar */
  ausschluss: DisziplinId[];
}

/** Bestehenslogik: Schnitt aller 5 Noten ≥ 4.0; eine 1.0 gilt als Ausschluss. */
export function bewerteEp(noten: Partial<Record<DisziplinId, number>>): EpErgebnis {
  const ids = Object.keys(EP_DISZIPLINEN) as DisziplinId[];
  const vorhanden = ids.filter((id) => noten[id] != null);
  const ausschluss = vorhanden.filter((id) => (noten[id] as number) <= 1.0);
  if (vorhanden.length === 0) {
    return { noten, schnitt: null, bestanden: null, ausschluss };
  }
  const summe = vorhanden.reduce((s, id) => s + (noten[id] as number), 0);
  const schnitt = summe / vorhanden.length;
  const komplett = vorhanden.length === ids.length;
  return {
    noten,
    schnitt,
    bestanden: komplett ? schnitt >= 4.0 && ausschluss.length === 0 : null,
    ausschluss,
  };
}
