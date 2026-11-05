/**
 * Eignungsprüfung (EP) Schweizer Armee-Grenadiere — Domänendaten.
 *
 * Notentabellen exakt nach der offiziellen „Notentabelle Eignungsprüfung
 * EP_AZ SK": jede Note gilt für einen festen Wertebereich (Stufen, keine
 * Interpolation). Zeiten in Sekunden, Wiederholungen als Anzahl.
 *
 * Bestanden ist die EP, wenn der Durchschnitt aller Disziplinen mindestens
 * „genügend" ist (≥ 3.60).
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
  /**
   * Offizielle Stufen [grenzwert, note], von der besten Note abwärts.
   * hoeherIstBesser: Note gilt ab `grenzwert` (wert ≥ grenzwert).
   * Zeit (tiefer besser): Note gilt bis einschliesslich `grenzwert` (wert ≤ grenzwert).
   * Werte ausserhalb aller Stufen ergeben 1.0.
   */
  stufen: [number, number][];
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
    // Marsch 5 km, Zeitlimite 40 Min: ≤ 30:00 = 5.0, danach je 30 s bzw. 1 Min eine Stufe
    stufen: [
      [1800, 5.0], // 30:00 und weniger
      [1830, 4.9], // 30:01–30:30
      [1860, 4.8], // 30:31–31:00
      [1890, 4.7], // 31:01–31:30
      [1920, 4.6], // 31:31–32:00
      [1950, 4.5], // 32:01–32:30
      [1980, 4.4], // 32:31–33:00
      [2010, 4.3], // 33:01–33:30
      [2040, 4.2], // 33:31–34:00
      [2100, 4.1], // 34:01–35:00
      [2160, 4.0], // 35:01–36:00
      [2220, 3.9], // 36:01–37:00
      [2280, 3.8], // 37:01–38:00
      [2340, 3.7], // 38:01–39:00
      [2400, 3.6], // 39:01–40:00 · ab 40:01 = 1.0
    ],
    ziel: { von: 1800, bis: 1980 }, // ≤ 33 Min
    beschreibung:
      "5 km mit 20-kg-Rucksack, Kampfstiefeln und Tarnanzug, Zeitlimite 40 Min. Note 5.0 bis 30:00, Ziel ≤ 33:00.",
  },
  klimmzuege: {
    id: "klimmzuege",
    reihenfolge: 1,
    name: "Klimmzüge (Ristgriff)",
    kurzname: "Klimmzüge",
    einheit: "wiederholungen",
    hoeherIstBesser: true,
    // Keine Zeitlimite, ohne Unterbruch · 5 und weniger = 1.0
    stufen: [
      [10, 5.0],
      [9, 4.7],
      [8, 4.5],
      [7, 3.9],
      [6, 3.6],
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
    // Zeitlimite 60 s: 35 = 5.0, je Wiederholung 0.1 weniger bis 21 = 3.6 · 20 und weniger = 1.0
    stufen: Array.from({ length: 15 }, (_, i) => [35 - i, Math.round((5.0 - i * 0.1) * 10) / 10] as [number, number]),
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
    // Zeitlimite 120 s: 120 = 5.0, je 5 s eine Stufe bis 70–74 = 4.0, dann 64/58/52/46 · ≤ 45 = 1.0
    stufen: [
      [120, 5.0],
      [115, 4.9],
      [110, 4.8],
      [105, 4.7],
      [100, 4.6],
      [95, 4.5],
      [90, 4.4],
      [85, 4.3],
      [80, 4.2],
      [75, 4.1],
      [70, 4.0],
      [64, 3.9],
      [58, 3.8],
      [52, 3.7],
      [46, 3.6],
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
    // Zeitlimite 150 s: 150 = 5.0, je 5 s eine Stufe bis 85–89 = 3.7, 72–84 = 3.6 · ≤ 71 = 1.0
    stufen: [
      [150, 5.0],
      [145, 4.9],
      [140, 4.8],
      [135, 4.7],
      [130, 4.6],
      [125, 4.5],
      [120, 4.4],
      [115, 4.3],
      [110, 4.2],
      [105, 4.1],
      [100, 4.0],
      [95, 3.9],
      [90, 3.8],
      [85, 3.7],
      [72, 3.6],
    ],
    ziel: { von: 120, bis: 135 },
    beschreibung:
      "Im Sekundentakt (Metronom 60 bpm), maximal 150 s. Ziel: 120–135 s.",
  },
};

export const EP_REIHENFOLGE: DisziplinId[] = Object.values(EP_DISZIPLINEN)
  .sort((a, b) => a.reihenfolge - b.reihenfolge)
  .map((d) => d.id);

/** Mindestnote für „genügend" und damit für das Bestehen (Durchschnitt) */
export const BESTEHEN_SCHNITT = 3.6;

/**
 * Note nach offizieller Stufentabelle. Bruchteile zählen wie auf der Uhr
 * abgelesen: Zeiten ≤ Grenze (30:00.4 ist schon über 30:00), Haltezeiten und
 * Wiederholungen ≥ Grenze (69.9 s zählt als 69 s).
 */
export function berechneNote(disziplin: DisziplinId, wert: number): number {
  const d = EP_DISZIPLINEN[disziplin];
  for (const [grenze, note] of d.stufen) {
    if (d.hoeherIstBesser ? wert >= grenze : wert <= grenze) return note;
  }
  return 1.0;
}

/**
 * Umkehrung: der am wenigsten anspruchsvolle Wert, der mindestens `zielNote`
 * ergibt (höher besser: kleinster Wert; Zeit: grösste Zeit). Über 5.0 → Wert für 5.0.
 */
export function wertFuerNote(disziplin: DisziplinId, zielNote: number): number {
  const d = EP_DISZIPLINEN[disziplin];
  const passend = d.stufen.filter(([, note]) => note >= zielNote - 1e-9);
  if (passend.length === 0) return d.stufen[0][0];
  return passend[passend.length - 1][0];
}

export type NotenStufe = "sehr gut" | "gut" | "genügend" | "ungenügend";

/** Benotung laut Tabelle: 5.00–4.50 sehr gut · 4.49–4.00 gut · 3.99–3.60 genügend · darunter ungenügend */
export function notenStufe(note: number): NotenStufe {
  if (note >= 4.5) return "sehr gut";
  if (note >= 4.0) return "gut";
  if (note >= BESTEHEN_SCHNITT) return "genügend";
  return "ungenügend";
}

/** Statusfarbe je Notenstufe: sehr gut grün · gut gelb · genügend orange · ungenügend rot */
export function notenFarbe(note: number | null | undefined): string {
  if (note == null) return "var(--muted-foreground)";
  const stufe = notenStufe(note);
  return stufe === "sehr gut"
    ? "var(--status-green)"
    : stufe === "gut"
      ? "var(--status-yellow)"
      : stufe === "genügend"
        ? "var(--status-orange)"
        : "var(--status-red)";
}

export interface EpErgebnis {
  noten: Partial<Record<DisziplinId, number>>;
  schnitt: number | null;
  bestanden: boolean | null;
  /** Disziplinen mit 1.0 — kein formeller Ausschluss, aber ein starker Schnitt-Killer */
  ausschluss: DisziplinId[];
}

/**
 * Bestehenslogik laut offizieller Tabelle: bestanden, wenn der Durchschnitt
 * aller fünf Disziplinen mindestens „genügend" ist (≥ 3.60). Eine 1.0 wird
 * nur als Warnung gemeldet; die Tabelle nennt dafür keinen Ausschluss.
 */
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
    bestanden: komplett ? schnitt >= BESTEHEN_SCHNITT - 1e-9 : null,
    ausschluss,
  };
}

/* ---------- Eingabe von Benchmark-Werten (Erfassen/Anpassen) ---------- */

/** "mm:ss" (Lastlauf) bzw. Zahl → Wert in der Einheit der Disziplin; null bei ungültiger Eingabe */
export function parseBenchmarkWert(disziplin: DisziplinId, text: string): number | null {
  const t = text.trim().replace(",", ".");
  if (disziplin === "lastlauf") {
    const m = /^(\d{1,3}):([0-5]?\d)$/.exec(t);
    if (m) return Number(m[1]) * 60 + Number(m[2]);
    const min = Number(t);
    return isFinite(min) && min > 0 ? Math.round(min * 60) : null;
  }
  const n = Number(t);
  return isFinite(n) && n > 0 ? n : null;
}

export function benchmarkWertAlsText(b: { disziplin: DisziplinId; wert: number }): string {
  if (b.disziplin !== "lastlauf") return String(b.wert);
  const s = Math.round(b.wert);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
