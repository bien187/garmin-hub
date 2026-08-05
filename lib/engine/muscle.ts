/**
 * Muskel-Erschöpfungsmodell (Heuristik, im UI als Schätzung gekennzeichnet).
 *
 * Jede Einheit erzeugt Last L pro Muskelgruppe; Erholung als exponentieller
 * Abbau Rest(t) = Σ Lᵢ × e^(−Δtᵢ/τ) mit muskelspezifischem τ.
 */

export type MuskelId =
  | "nacken_trapez"
  | "schultern"
  | "brust"
  | "bizeps"
  | "trizeps"
  | "unterarme"
  | "bauch"
  | "seitlicher_rumpf"
  | "unterer_ruecken"
  | "oberer_ruecken_lat"
  | "gesaess"
  | "quadrizeps"
  | "hamstrings"
  | "adduktoren"
  | "waden"
  | "schienbeine";

export const MUSKELGRUPPEN: { id: MuskelId; name: string; tauH: number }[] = [
  { id: "nacken_trapez", name: "Nacken/Trapez", tauH: 36 },
  { id: "schultern", name: "Schultern", tauH: 36 },
  { id: "brust", name: "Brust", tauH: 48 },
  { id: "bizeps", name: "Bizeps", tauH: 36 },
  { id: "trizeps", name: "Trizeps", tauH: 36 },
  { id: "unterarme", name: "Unterarme", tauH: 36 },
  { id: "bauch", name: "Bauch", tauH: 36 },
  { id: "seitlicher_rumpf", name: "Seitlicher Rumpf", tauH: 36 },
  { id: "unterer_ruecken", name: "Unterer Rücken", tauH: 48 },
  { id: "oberer_ruecken_lat", name: "Oberer Rücken/Lat", tauH: 48 },
  { id: "gesaess", name: "Gesäss", tauH: 48 },
  { id: "quadrizeps", name: "Quadrizeps", tauH: 48 },
  { id: "hamstrings", name: "Hamstrings", tauH: 48 },
  { id: "adduktoren", name: "Adduktoren", tauH: 48 },
  { id: "waden", name: "Waden", tauH: 30 },
  { id: "schienbeine", name: "Schienbeine/Fussheber", tauH: 30 },
];

export const MUSKEL_NAME: Record<MuskelId, string> = Object.fromEntries(
  MUSKELGRUPPEN.map((m) => [m.id, m.name])
) as Record<MuskelId, string>;

const TAU_H: Record<MuskelId, number> = Object.fromEntries(
  MUSKELGRUPPEN.map((m) => [m.id, m.tauH])
) as Record<MuskelId, number>;

/** Mapping Garmin-Exercise-Key (category) → Muskelgruppen (Haupt 1.0 / Neben 0.4) */
interface UebungsMapping {
  haupt: MuskelId[];
  neben: MuskelId[];
}

const EXERCISE_MAPPING: Record<string, UebungsMapping> = {
  BENCH_PRESS: { haupt: ["brust"], neben: ["trizeps", "schultern"] },
  INCLINE_BENCH_PRESS: { haupt: ["brust", "schultern"], neben: ["trizeps"] },
  CHEST_PRESS: { haupt: ["brust"], neben: ["trizeps", "schultern"] },
  FLYE: { haupt: ["brust"], neben: ["schultern"] },
  PUSH_UP: { haupt: ["brust", "trizeps"], neben: ["schultern", "bauch"] },
  DIP: { haupt: ["trizeps", "brust"], neben: ["schultern"] },
  TRICEPS_EXTENSION: { haupt: ["trizeps"], neben: [] },
  TRICEP_PRESS: { haupt: ["trizeps"], neben: [] },
  PULL_UP: { haupt: ["oberer_ruecken_lat", "bizeps"], neben: ["unterarme", "bauch"] },
  CHIN_UP: { haupt: ["bizeps", "oberer_ruecken_lat"], neben: ["unterarme"] },
  LAT_PULLDOWN: { haupt: ["oberer_ruecken_lat"], neben: ["bizeps"] },
  PULLDOWN: { haupt: ["oberer_ruecken_lat"], neben: ["bizeps"] },
  ROW: { haupt: ["oberer_ruecken_lat"], neben: ["bizeps", "nacken_trapez"] },
  PULLOVER: { haupt: ["oberer_ruecken_lat", "brust"], neben: [] },
  CURL: { haupt: ["bizeps"], neben: ["unterarme"] },
  BICEPS_CURL: { haupt: ["bizeps"], neben: ["unterarme"] },
  WRIST_CURL: { haupt: ["unterarme"], neben: [] },
  SHOULDER_PRESS: { haupt: ["schultern"], neben: ["trizeps", "nacken_trapez"] },
  LATERAL_RAISE: { haupt: ["schultern"], neben: [] },
  FRONT_RAISE: { haupt: ["schultern"], neben: [] },
  REAR_LATERAL_RAISE: { haupt: ["schultern"], neben: ["oberer_ruecken_lat"] },
  SHRUG: { haupt: ["nacken_trapez"], neben: ["unterarme"] },
  UPRIGHT_ROW: { haupt: ["schultern", "nacken_trapez"], neben: ["bizeps"] },
  SQUAT: { haupt: ["quadrizeps", "gesaess"], neben: ["hamstrings", "unterer_ruecken", "adduktoren"] },
  LEG_PRESS: { haupt: ["quadrizeps", "gesaess"], neben: ["hamstrings"] },
  LUNGE: { haupt: ["quadrizeps", "gesaess"], neben: ["hamstrings", "adduktoren", "waden"] },
  STEP_UP: { haupt: ["quadrizeps", "gesaess"], neben: ["waden"] },
  DEADLIFT: { haupt: ["unterer_ruecken", "gesaess", "hamstrings"], neben: ["nacken_trapez", "unterarme", "quadrizeps"] },
  ROMANIAN_DEADLIFT: { haupt: ["hamstrings", "gesaess"], neben: ["unterer_ruecken"] },
  LEG_CURL: { haupt: ["hamstrings"], neben: [] },
  LEG_EXTENSION: { haupt: ["quadrizeps"], neben: [] },
  LEG_RAISE: { haupt: ["bauch"], neben: [] },
  HIP_RAISE: { haupt: ["gesaess"], neben: ["hamstrings", "unterer_ruecken"] },
  GLUTE_BRIDGE: { haupt: ["gesaess"], neben: ["hamstrings"] },
  HIP_THRUST: { haupt: ["gesaess"], neben: ["hamstrings"] },
  ADDUCTION: { haupt: ["adduktoren"], neben: [] },
  ABDUCTION: { haupt: ["gesaess"], neben: [] },
  CALF_RAISE: { haupt: ["waden"], neben: [] },
  CALF_PRESS: { haupt: ["waden"], neben: [] },
  PLANK: { haupt: ["bauch", "seitlicher_rumpf"], neben: ["unterer_ruecken", "schultern"] },
  SIDE_PLANK: { haupt: ["seitlicher_rumpf"], neben: ["bauch"] },
  SIT_UP: { haupt: ["bauch"], neben: [] },
  CRUNCH: { haupt: ["bauch"], neben: [] },
  RUSSIAN_TWIST: { haupt: ["seitlicher_rumpf", "bauch"], neben: [] },
  HYPEREXTENSION: { haupt: ["unterer_ruecken"], neben: ["gesaess", "hamstrings"] },
  BACK_EXTENSION: { haupt: ["unterer_ruecken"], neben: ["gesaess", "hamstrings"] },
  GOOD_MORNING: { haupt: ["unterer_ruecken", "hamstrings"], neben: ["gesaess"] },
  CLEAN: { haupt: ["gesaess", "quadrizeps", "nacken_trapez"], neben: ["unterer_ruecken", "waden", "schultern"] },
  SNATCH: { haupt: ["gesaess", "quadrizeps", "schultern"], neben: ["unterer_ruecken", "nacken_trapez"] },
  THRUSTER: { haupt: ["quadrizeps", "schultern"], neben: ["gesaess", "trizeps"] },
  BURPEE: { haupt: ["quadrizeps", "brust"], neben: ["bauch", "schultern", "waden"] },
  FARMERS_CARRY: { haupt: ["unterarme", "nacken_trapez"], neben: ["bauch", "seitlicher_rumpf"] },
};

/** Übungs-Key → Muskelgruppen; unbekannte Keys per Substring-Heuristik */
export function mappeUebung(exerciseKey: string): UebungsMapping {
  const key = (exerciseKey || "").toUpperCase();
  if (EXERCISE_MAPPING[key]) return EXERCISE_MAPPING[key];
  for (const [k, v] of Object.entries(EXERCISE_MAPPING)) {
    if (key.includes(k)) return v;
  }
  // Substring-Heuristik über Wortbestandteile
  const heuristik: [string, UebungsMapping][] = [
    ["BENCH", EXERCISE_MAPPING.BENCH_PRESS],
    ["CHEST", EXERCISE_MAPPING.CHEST_PRESS],
    ["PUSH", EXERCISE_MAPPING.PUSH_UP],
    ["PULL", EXERCISE_MAPPING.PULL_UP],
    ["ROW", EXERCISE_MAPPING.ROW],
    ["CURL", EXERCISE_MAPPING.CURL],
    ["SQUAT", EXERCISE_MAPPING.SQUAT],
    ["LUNGE", EXERCISE_MAPPING.LUNGE],
    ["DEADLIFT", EXERCISE_MAPPING.DEADLIFT],
    ["CALF", EXERCISE_MAPPING.CALF_RAISE],
    ["PLANK", EXERCISE_MAPPING.PLANK],
    ["CORE", EXERCISE_MAPPING.PLANK],
    ["AB", EXERCISE_MAPPING.CRUNCH],
    ["SHOULDER", EXERCISE_MAPPING.SHOULDER_PRESS],
    ["TRICEP", EXERCISE_MAPPING.TRICEPS_EXTENSION],
    ["LEG", EXERCISE_MAPPING.LEG_PRESS],
    ["HIP", EXERCISE_MAPPING.HIP_RAISE],
    ["BACK", EXERCISE_MAPPING.BACK_EXTENSION],
  ];
  for (const [sub, m] of heuristik) {
    if (key.includes(sub)) return m;
  }
  // Unbekannt: Ganzkörper-Restlast, klein
  return { haupt: [], neben: ["bauch", "unterer_ruecken"] };
}

export type Lasten = Partial<Record<MuskelId, number>>;

export interface KraftSatz {
  uebungKey: string;
  saetze: number;
  wdh: number | null;
  gewichtKg: number | null;
}

/**
 * Last aus Krafttraining: Volumen (Sätze × Wdh × Gewicht) pro Muskelgruppe,
 * Haupt 1.0 / Neben 0.4, normiert auf Referenzvolumen (≈ meine harte
 * Einheit) → Last ~0–100 pro Muskel.
 */
export function lastenAusKraft(
  saetze: KraftSatz[],
  koerpergewichtKg: number,
  referenzVolumenKg = 6000
): Lasten {
  const lasten: Lasten = {};
  for (const s of saetze) {
    const mapping = mappeUebung(s.uebungKey);
    const wdh = s.wdh ?? 8;
    // Körpergewichtsübungen (Klimmzüge, Liegestütze, Planks): effektive Last schätzen
    const gewicht =
      s.gewichtKg != null && s.gewichtKg > 0
        ? s.gewichtKg
        : koerpergewichtKg * 0.55;
    const volumen = s.saetze * wdh * gewicht;
    const beitrag = (volumen / referenzVolumenKg) * 80;
    for (const m of mapping.haupt) {
      lasten[m] = (lasten[m] ?? 0) + beitrag;
    }
    for (const m of mapping.neben) {
      lasten[m] = (lasten[m] ?? 0) + beitrag * 0.4;
    }
  }
  // Deckeln: eine einzelne Einheit erschöpft maximal "sehr hoch"
  for (const k of Object.keys(lasten) as MuskelId[]) {
    lasten[k] = Math.min(110, lasten[k] as number);
  }
  return lasten;
}

/**
 * Manuelle Muskel-Templates für Gym-Einheiten ohne (brauchbare)
 * Übungsdetails. Gewichte 0–1 relativ zum Hauptmuskel; werden mit der
 * Einheiten-Intensität skaliert.
 */
export const MUSKEL_TEMPLATES: {
  id: string;
  name: string;
  gewichte: Partial<Record<MuskelId, number>>;
}[] = [
  {
    id: "oberkoerper_push",
    name: "Oberkörper Push",
    gewichte: { brust: 1.0, trizeps: 0.7, schultern: 0.7, bauch: 0.2 },
  },
  {
    id: "oberkoerper_pull",
    name: "Oberkörper Pull",
    gewichte: {
      oberer_ruecken_lat: 1.0,
      bizeps: 0.7,
      nacken_trapez: 0.4,
      unterarme: 0.3,
    },
  },
  {
    id: "beine",
    name: "Beine",
    gewichte: {
      quadrizeps: 1.0,
      gesaess: 0.9,
      hamstrings: 0.8,
      waden: 0.6,
      adduktoren: 0.4,
    },
  },
  {
    id: "ganzkoerper",
    name: "Ganzkörper",
    gewichte: {
      brust: 0.6,
      oberer_ruecken_lat: 0.6,
      schultern: 0.5,
      quadrizeps: 0.6,
      gesaess: 0.5,
      hamstrings: 0.4,
      bizeps: 0.4,
      trizeps: 0.4,
      bauch: 0.4,
    },
  },
  {
    id: "core",
    name: "Core",
    gewichte: { bauch: 1.0, seitlicher_rumpf: 0.8, unterer_ruecken: 0.6 },
  },
];

const TEMPLATE_MAP = Object.fromEntries(MUSKEL_TEMPLATES.map((t) => [t.id, t]));

export const MUSKEL_TEMPLATE_NAME: Record<string, string> = Object.fromEntries(
  MUSKEL_TEMPLATES.map((t) => [t.id, t.name])
);

/**
 * Last aus einem manuellen Template: Gewichte × Intensität (aus TRIMP der
 * Einheit, geklemmt), sodass der Hauptmuskel ~50–85 erreicht.
 */
export function lastenAusTemplate(templateId: string, trimp: number): Lasten {
  const t = TEMPLATE_MAP[templateId];
  if (!t) return {};
  const intensitaet = Math.min(85, Math.max(35, trimp || 45));
  const lasten: Lasten = {};
  for (const [m, w] of Object.entries(t.gewichte) as [MuskelId, number][]) {
    lasten[m] = Math.min(110, w * intensitaet);
  }
  return lasten;
}

export interface LaufLastInput {
  trimp: number;
  hmAuf: number;
  hmAb: number;
  distanzM: number;
  istLastlauf: boolean;
}

/**
 * Last aus Läufen: Beinmuskulatur gewichtet nach TRIMP; Hm-Anteil verschiebt
 * Richtung Waden+Gesäss (bergauf) bzw. Quadrizeps (bergab, exzentrisch).
 * Lastläufe belasten zusätzlich Trapez/unteren Rücken/Rumpf.
 */
export function lastenAusLauf(inp: LaufLastInput): Lasten {
  if (inp.trimp <= 0) return {};
  // Basisgewichte flacher Lauf
  const basis: Lasten = {
    waden: 0.5,
    quadrizeps: 0.42,
    hamstrings: 0.38,
    gesaess: 0.33,
    adduktoren: 0.18, // inkl. Hüftbeuger-Anteil
    schienbeine: 0.22,
    bauch: 0.08,
    unterer_ruecken: 0.08,
  };
  const km = Math.max(0.5, inp.distanzM / 1000);
  const aufProKm = inp.hmAuf / km;
  const abProKm = inp.hmAb / km;
  // Hügelfaktor: ab ~25 Hm/km deutlich spürbar
  const bergauf = Math.min(1, aufProKm / 50);
  const bergab = Math.min(1, abProKm / 50);
  basis.waden = (basis.waden ?? 0) + 0.35 * bergauf;
  basis.gesaess = (basis.gesaess ?? 0) + 0.3 * bergauf;
  basis.quadrizeps = (basis.quadrizeps ?? 0) + 0.45 * bergab; // exzentrisch
  if (inp.istLastlauf) {
    basis.nacken_trapez = 0.3;
    basis.unterer_ruecken = (basis.unterer_ruecken ?? 0) + 0.25;
    basis.bauch = (basis.bauch ?? 0) + 0.15;
    basis.seitlicher_rumpf = 0.15;
  }
  // Skala: TRIMP 100 ≈ fordernder Lauf → Hauptmuskeln ~50–60 Last
  const skala = inp.trimp;
  const lasten: Lasten = {};
  for (const [k, v] of Object.entries(basis) as [MuskelId, number][]) {
    lasten[k] = Math.min(110, v * skala * 1.15);
  }
  return lasten;
}

export interface LastEreignis {
  /** Zeitpunkt der Einheit (ms epoch) */
  zeitpunktMs: number;
  lasten: Lasten;
}

/**
 * Rest-Erschöpfung pro Muskel zum Zeitpunkt `jetztMs`:
 * Rest = Σ Lᵢ × e^(−Δtᵢ/τ), τ muskelspezifisch; nach sehr hoher Einzellast
 * (≥ 70) τ × 1.3. Ergebnis auf 0–100 % geklemmt.
 */
export function restErschoepfung(
  ereignisse: LastEreignis[],
  jetztMs: number
): Record<MuskelId, number> {
  const rest = {} as Record<MuskelId, number>;
  for (const m of MUSKELGRUPPEN) rest[m.id] = 0;

  for (const e of ereignisse) {
    const dtH = (jetztMs - e.zeitpunktMs) / 3_600_000;
    if (dtH < 0) continue;
    for (const [k, last] of Object.entries(e.lasten) as [MuskelId, number][]) {
      if (!last) continue;
      const tau = TAU_H[k] * (last >= 70 ? 1.3 : 1);
      rest[k] += last * Math.exp(-dtH / tau);
    }
  }
  for (const m of MUSKELGRUPPEN) {
    rest[m.id] = Math.min(100, Math.max(0, rest[m.id]));
  }
  return rest;
}

/** Stunden bis Rest-Erschöpfung ≤ zielProzent (Standard: 20 % = "voll belastbar") */
export function stundenBisBelastbar(
  aktuellProzent: number,
  muskel: MuskelId,
  zielProzent = 20
): number {
  if (aktuellProzent <= zielProzent) return 0;
  const tau = TAU_H[muskel];
  return tau * Math.log(aktuellProzent / zielProzent);
}

/** Ampelfarbe (HSL-interpoliert) für Rest-Erschöpfung 0–100 % */
export function erschoepfungFarbe(prozent: number): string {
  // 0 % = Grün (145°), 50 % = Gelb (55°), 100 % = Rot (12°)
  const p = Math.min(100, Math.max(0, prozent)) / 100;
  const hue = p <= 0.5 ? 145 - (145 - 55) * (p / 0.5) : 55 - (55 - 12) * ((p - 0.5) / 0.5);
  const sat = 60 + 15 * p;
  const light = 42 + 8 * (1 - p);
  return `hsl(${Math.round(hue)} ${Math.round(sat)}% ${Math.round(light)}%)`;
}
