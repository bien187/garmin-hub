/**
 * EP-Checkliste — reine Daten + reine Funktionen, client-sicher (keine
 * DB-Imports). Die UI (components/plan/ep-checkliste.tsx) kennt nur Gruppen
 * und IDs; Texte und Ernährungsvorschläge werden ausschliesslich hier gepflegt.
 *
 * WICHTIG: Die IDs sind der Schlüssel des Abhakzustands in app_settings
 * (`ep_checkliste_<datum>`). Eine ID umbenennen = der Punkt gilt wieder als
 * offen. Texte dürfen sich jederzeit ändern, IDs nicht.
 */
import { EP_DATUM, EP_TAG_2 } from "./konstanten";

export interface ChecklistenPunkt {
  id: string;
  text: string;
  hinweis?: string;
}

export interface ChecklistenGruppe {
  id: string;
  titel: string;
  punkte: ChecklistenPunkt[];
}

/** Gespeicherter Zustand je EP-Tag (app_settings-Wert) */
export interface ChecklistenZustand {
  abgehakt: string[];
  startzeit: string;
}

export const STANDARD_STARTZEIT = "08:00";

/** app_settings-Schlüssel für den Abhakzustand eines EP-Tags */
export function checklistenSchluessel(datum: string): string {
  return `ep_checkliste_${datum}`;
}

/**
 * Ernährung: allgemeine Vorschläge, keine Vorgaben. Hier anpassen, wenn
 * sich Vorlieben ändern — die Checklisten beider Tage lesen diese Texte.
 */
export const ERNAEHRUNG = {
  abendessen:
    "Vorschlag: kohlenhydratreiche, leichte Mahlzeit, z. B. Reis oder Pasta mit magerem Protein, wenig Fett und wenig Ballaststoffe.",
  fruehstueck:
    "Vorschlag: leicht verdaulich und kohlenhydratbetont, z. B. Haferflocken mit Banane und Honig, Weissbrot mit Konfitüre oder Joghurt.",
  snack: "Vorschlag: Banane, Reiswaffel oder ein Riegel einer bekannten Marke.",
  danach:
    "Vorschlag: eine Mahlzeit mit Kohlenhydraten und Protein, z. B. Reis mit Poulet oder ein Sandwich mit Käse oder Ei.",
  trinken: "Wasser über den Morgen verteilt, bei Bedarf Elektrolyte (wie im Training erprobt).",
} as const;

const TAG_1: ChecklistenGruppe[] = [
  {
    id: "t1-vorabend",
    titel: "Vorabend",
    punkte: [
      { id: "t1-vorabend-tasche", text: "Tasche packen", hinweis: "Sportkleidung, Schuhe, Wechselkleidung, Handtuch." },
      { id: "t1-vorabend-ausweis", text: "Ausweis und Unterlagen bereitlegen", hinweis: "ID, Aufgebot und alles, was verlangt wird." },
      { id: "t1-vorabend-kleidung", text: "Kleidung für den Morgen bereitlegen" },
      { id: "t1-vorabend-wecker", text: "Wecker stellen", hinweis: "Mit Puffer für Frühstück und Anfahrt." },
      { id: "t1-vorabend-anfahrt", text: "Anfahrt und Parkplatz prüfen", hinweis: "Route, Fahrzeit mit Reserve, Parkmöglichkeit oder ÖV-Verbindung." },
      { id: "t1-vorabend-essen", text: "Abendessen: kohlenhydratreich und leicht", hinweis: ERNAEHRUNG.abendessen },
      { id: "t1-vorabend-schlafen", text: "Früh schlafen gehen" },
    ],
  },
  {
    id: "t1-morgens",
    titel: "Morgens",
    punkte: [
      { id: "t1-morgens-fruehstueck", text: "Frühstück 2–3 h vor Startzeit", hinweis: ERNAEHRUNG.fruehstueck },
      { id: "t1-morgens-nichts-neues", text: "Nichts Neues ausprobieren", hinweis: "Nur Essen und Getränke, die du aus dem Training kennst." },
      { id: "t1-morgens-trinken", text: "Wasser und Elektrolyte", hinweis: ERNAEHRUNG.trinken },
      { id: "t1-morgens-kaffee", text: "Kaffee nur wie gewohnt" },
    ],
  },
  {
    id: "t1-vor-ort",
    titel: "Vor Ort",
    punkte: [
      { id: "t1-vor-ort-frueh", text: "Früh ankommen" },
      { id: "t1-vor-ort-anmeldung", text: "Anmeldung, Ausweis vorzeigen" },
      { id: "t1-vor-ort-toilette", text: "Toilette" },
      { id: "t1-vor-ort-aufwaermen", text: "Aufwärmen und Mobilisation" },
      { id: "t1-vor-ort-wasser", text: "Wasserflasche dabei" },
      { id: "t1-vor-ort-snack", text: "Snack für zwischendurch", hinweis: ERNAEHRUNG.snack },
      { id: "t1-vor-ort-handy", text: "Handy lautlos" },
      { id: "t1-vor-ort-atmung", text: "Kurze Atemübungen", hinweis: "Z. B. ein paar Atemzüge ruhig ein und länger aus." },
    ],
  },
  {
    id: "t1-danach",
    titel: "Danach",
    punkte: [
      { id: "t1-danach-essen", text: "Essen: Kohlenhydrate und Protein", hinweis: ERNAEHRUNG.danach },
      { id: "t1-danach-trinken", text: "Trinken und Salz" },
      { id: "t1-danach-erholung", text: "Kurze Erholung", hinweis: "Hinsetzen, Beine hochlegen, locker gehen statt herumstehen." },
      { id: "t1-danach-schlaf", text: "Schlaf", hinweis: "Morgen ist Tag 2 — früh ins Bett." },
    ],
  },
];

const TAG_2: ChecklistenGruppe[] = [
  {
    id: "t2-vorabend",
    titel: "Vorabend (nach Tag 1)",
    punkte: [
      { id: "t2-vorabend-erholung", text: "Erholung nach Tag 1", hinweis: "Locker gehen oder leicht mobilisieren, kein zusätzliches Training." },
      { id: "t2-vorabend-essen", text: "Abendessen: Speicher auffüllen", hinweis: ERNAEHRUNG.abendessen },
      { id: "t2-vorabend-tasche", text: "Tasche für Tag 2 packen", hinweis: "Frische Sportkleidung und Socken, verschwitzte Sachen von Tag 1 raus." },
      { id: "t2-vorabend-ausweis", text: "Ausweis und Unterlagen wieder einpacken" },
      { id: "t2-vorabend-kleidung", text: "Kleidung für den Morgen bereitlegen" },
      { id: "t2-vorabend-wecker", text: "Wecker stellen", hinweis: "Startzeit von Tag 2 prüfen, sie kann von Tag 1 abweichen." },
      { id: "t2-vorabend-anfahrt", text: "Anfahrt und Parkplatz für Tag 2 prüfen", hinweis: "Nur nötig, wenn Ort oder Zeit anders sind als an Tag 1." },
      { id: "t2-vorabend-schlafen", text: "Früh schlafen gehen" },
    ],
  },
  {
    id: "t2-morgens",
    titel: "Morgens",
    punkte: [
      { id: "t2-morgens-fruehstueck", text: "Frühstück 2–3 h vor Startzeit", hinweis: ERNAEHRUNG.fruehstueck },
      { id: "t2-morgens-nichts-neues", text: "Nichts Neues ausprobieren", hinweis: "Am besten dasselbe Frühstück wie an Tag 1, wenn es gut getan hat." },
      { id: "t2-morgens-trinken", text: "Wasser und Elektrolyte", hinweis: ERNAEHRUNG.trinken },
      { id: "t2-morgens-kaffee", text: "Kaffee nur wie gewohnt" },
      { id: "t2-morgens-lockern", text: "Kurz lockern", hinweis: "Ein paar Minuten Mobilisation gegen steife Beine von Tag 1." },
    ],
  },
  {
    id: "t2-vor-ort",
    titel: "Vor Ort",
    punkte: [
      { id: "t2-vor-ort-frueh", text: "Früh ankommen" },
      { id: "t2-vor-ort-anmeldung", text: "Anmeldung, Ausweis vorzeigen" },
      { id: "t2-vor-ort-toilette", text: "Toilette" },
      { id: "t2-vor-ort-aufwaermen", text: "Aufwärmen und Mobilisation", hinweis: "Etwas länger als an Tag 1, die Muskulatur ist vorbelastet." },
      { id: "t2-vor-ort-wasser", text: "Wasserflasche dabei" },
      { id: "t2-vor-ort-snack", text: "Snack für zwischendurch", hinweis: ERNAEHRUNG.snack },
      { id: "t2-vor-ort-handy", text: "Handy lautlos" },
      { id: "t2-vor-ort-atmung", text: "Kurze Atemübungen", hinweis: "Z. B. ein paar Atemzüge ruhig ein und länger aus." },
    ],
  },
  {
    id: "t2-danach",
    titel: "Danach",
    punkte: [
      { id: "t2-danach-essen", text: "Essen: Kohlenhydrate und Protein", hinweis: ERNAEHRUNG.danach },
      { id: "t2-danach-trinken", text: "Trinken und Salz" },
      { id: "t2-danach-erholung", text: "Kurze Erholung", hinweis: "Die nächsten Tage stehen im Plan auf Regeneration (Spazieren)." },
      { id: "t2-danach-schlaf", text: "Schlaf" },
    ],
  },
];

/** Checkliste für einen EP-Tag, `null` für alle anderen Daten. */
export function checklisteFuer(datum: string): ChecklistenGruppe[] | null {
  if (datum === EP_DATUM) return TAG_1;
  if (datum === EP_TAG_2) return TAG_2;
  return null;
}

/** Alle Punkt-IDs einer Liste in Anzeigereihenfolge */
export function punktIds(gruppen: ChecklistenGruppe[]): string[] {
  return gruppen.flatMap((g) => g.punkte.map((p) => p.id));
}

/** Nur bekannte IDs, ohne Duplikate, in Listenreihenfolge */
export function bereinigeAbgehakt(gruppen: ChecklistenGruppe[], abgehakt: readonly string[]): string[] {
  const gesetzt = new Set(abgehakt);
  return punktIds(gruppen).filter((id) => gesetzt.has(id));
}

/** Fortschritt „x von y": zählt nur IDs, die in der Liste existieren, jede einmal. */
export function fortschritt(
  gruppen: ChecklistenGruppe[],
  abgehakt: readonly string[]
): { erledigt: number; gesamt: number } {
  return { erledigt: bereinigeAbgehakt(gruppen, abgehakt).length, gesamt: punktIds(gruppen).length };
}

const ZEIT_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function istGueltigeStartzeit(wert: unknown): wert is string {
  return typeof wert === "string" && ZEIT_RE.test(wert);
}

/** Ungültige Eingaben fallen auf die Standard-Startzeit 08:00 zurück. */
export function normalisiereStartzeit(wert: unknown): string {
  return istGueltigeStartzeit(wert) ? wert : STANDARD_STARTZEIT;
}

function alsZeit(minuten: number): { zeit: string; vortag: boolean } {
  const vortag = minuten < 0;
  const m = ((minuten % 1440) + 1440) % 1440;
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return { zeit: `${hh}:${mm}`, vortag };
}

/**
 * Frühstück-Zeitfenster: Startzeit −3 h bis −2 h. Bei sehr frühen
 * Startzeiten (vor 03:00) rutscht das Fenster ganz oder teilweise auf den
 * Vortag — das zeigen `vonVortag`/`bisVortag` an. Ungültige Startzeit →
 * Standard 08:00.
 */
export function fruehstueckFenster(startzeit: string): {
  von: string;
  bis: string;
  vonVortag: boolean;
  bisVortag: boolean;
} {
  const [h, m] = normalisiereStartzeit(startzeit).split(":").map(Number);
  const start = h * 60 + m;
  const von = alsZeit(start - 180);
  const bis = alsZeit(start - 120);
  return { von: von.zeit, bis: bis.zeit, vonVortag: von.vortag, bisVortag: bis.vortag };
}

/**
 * Gespeicherten app_settings-Wert lesen (robust gegen Altlasten und
 * Handarbeit in der DB): unbekannte IDs fallen weg, Startzeit wird normalisiert.
 */
export function leseZustand(gruppen: ChecklistenGruppe[], wert: unknown): ChecklistenZustand {
  const roh = (wert && typeof wert === "object" ? wert : {}) as { abgehakt?: unknown; startzeit?: unknown };
  const abgehakt = Array.isArray(roh.abgehakt)
    ? roh.abgehakt.filter((v): v is string => typeof v === "string")
    : [];
  return { abgehakt: bereinigeAbgehakt(gruppen, abgehakt), startzeit: normalisiereStartzeit(roh.startzeit) };
}
