/**
 * Laufende Plan-Anpassung — reine, deterministische Funktion.
 *
 * Der Wochenplan wird am Wochenanfang generiert und ist ab dann eine
 * Momentaufnahme. Die Realität weicht davon ab: ein spontaner Lauf am
 * Donnerstagabend macht den geplanten Freitagslauf zur zweiten harten
 * Einheit in Folge. Diese Funktion geht nach jedem Sync die noch offenen
 * Einheiten durch und schwächt ab oder streicht, wo es nötig ist.
 *
 * Grundsätze:
 *  - Nur nach vorn: Vergangenes wird nie umgeschrieben.
 *  - Nur abschwächen, nie verschärfen. Der Plan darf sich nicht selbst
 *    aufschaukeln, und eine automatische Verschärfung wäre gegenüber der
 *    Ermüdungslage nicht zu verantworten.
 *  - Höchstens eine Anpassung pro Einheit, und einmal angepasste Einheiten
 *    bleiben unangetastet — sonst degradiert jeder Sync die Woche weiter.
 */

import { MuskelId } from "./muscle";
import { addTage } from "@/lib/format";

export interface AnpassungsEinheit {
  id: string;
  datum: string;
  typ: string;
  titel: string;
  status: string; // geplant | gepusht | absolviert | verpasst
  erwarteterTrimp: number | null;
}

export interface AnpassungsAktivitaet {
  id: number;
  datum: string;
  istLauf: boolean;
  istKraft: boolean;
  trimp: number;
  /** true, wenn sie einer geplanten Einheit zugeordnet werden konnte */
  eingeplant: boolean;
}

export interface AnpassungsInput {
  heute: string;
  /** Einheiten der laufenden Woche */
  einheiten: AnpassungsEinheit[];
  /** Aktivitäten der letzten Tage */
  aktivitaeten: AnpassungsAktivitaet[];
  tsb: number | null;
  acwr: number | null;
  muskeln: Partial<Record<MuskelId, number>>;
  /** IDs, die bereits automatisch angepasst wurden */
  bereitsAngepasst?: string[];
}

export type AnpassungsZiel = "lauf_z2" | "ruhe";

export interface Anpassung {
  einheitId: string;
  datum: string;
  alterTyp: string;
  alterTitel: string;
  neuerTyp: AnpassungsZiel;
  neuerTitel: string;
  neueBeschreibung: string;
  /** Begründung in einem Satz — erscheint im Hinweis über dem Plan */
  grund: string;
  /** Einheit liegt schon auf der Uhr und muss dort neu gesendet werden */
  bereitsGepusht: boolean;
}

/** Einheiten, die echte Laufbelastung bedeuten */
const HARTE_LAEUFE = ["intervalle", "huegel_intervalle", "lastlauf", "langer_lauf"];
const LAUF_TYPEN = [...HARTE_LAEUFE, "lauf_z2", "probe_ep"];

export function istHarterLauf(typ: string): boolean {
  return HARTE_LAEUFE.includes(typ) || typ === "probe_ep";
}

function istLaufEinheit(typ: string): boolean {
  return LAUF_TYPEN.includes(typ);
}

/** Minuten aus dem Titel („Z2-Lauf 50 Min") — für den Ersatztitel */
function minutenAusTitel(titel: string, standard: number): number {
  const m = titel.match(/(\d{2,3})\s*min/i);
  const wert = m ? parseInt(m[1], 10) : NaN;
  return Number.isFinite(wert) ? Math.min(90, Math.max(20, wert)) : standard;
}

export function berechneAnpassungen(inp: AnpassungsInput): Anpassung[] {
  const bereits = new Set(inp.bereitsAngepasst ?? []);

  const belastungAm = (datum: string, nurUngeplant = false): number =>
    inp.aktivitaeten
      .filter((a) => a.datum === datum && (!nurUngeplant || !a.eingeplant))
      .reduce((s, a) => s + a.trimp, 0);

  const spontanerLaufAm = (datum: string): boolean =>
    inp.aktivitaeten.some(
      (a) => a.datum === datum && a.istLauf && !a.eingeplant && a.trimp > 25
    );

  const beineMuede = Math.max(
    inp.muskeln.quadrizeps ?? 0,
    inp.muskeln.waden ?? 0,
    inp.muskeln.hamstrings ?? 0
  );

  const anpassungen: Anpassung[] = [];

  for (const e of inp.einheiten) {
    if (e.datum < inp.heute) continue; // Vergangenes bleibt stehen
    if (e.status !== "geplant" && e.status !== "gepusht") continue;
    if (bereits.has(e.id)) continue;
    if (e.typ === "ruhe" || e.typ === "gtg") continue;

    const vortag = addTage(e.datum, -1);
    const belastungVortag = belastungAm(vortag);
    const gepusht = e.status === "gepusht";

    const zuRuhe = (grund: string): Anpassung => ({
      einheitId: e.id,
      datum: e.datum,
      alterTyp: e.typ,
      alterTitel: e.titel,
      neuerTyp: "ruhe",
      neuerTitel: "Ruhetag (automatisch angepasst)",
      neueBeschreibung: `Ursprünglich «${e.titel}». ${grund}`,
      grund,
      bereitsGepusht: gepusht,
    });

    const zuLocker = (grund: string): Anpassung => {
      const min = minutenAusTitel(e.titel, 40);
      return {
        einheitId: e.id,
        datum: e.datum,
        alterTyp: e.typ,
        alterTitel: e.titel,
        neuerTyp: "lauf_z2",
        neuerTitel: `Lockerer Z2-Lauf ${min} Min`,
        neueBeschreibung: `Abgeschwächt von «${e.titel}». ${grund}`,
        grund,
        bereitsGepusht: gepusht,
      };
    };

    /* 1. Spontane Einheit am Vortag — der Klassiker: abends spontan
          gelaufen, am nächsten Tag stand schon ein Lauf im Plan. */
    if (istLaufEinheit(e.typ) && spontanerLaufAm(vortag)) {
      if (istHarterLauf(e.typ)) {
        anpassungen.push(
          zuLocker(`Am ${kurz(vortag)} bist du ungeplant gelaufen — zwei harte Tage in Folge wären zu viel.`)
        );
        continue;
      }
      if (belastungVortag >= 90) {
        anpassungen.push(
          zuRuhe(`Der ungeplante Lauf am ${kurz(vortag)} war fordernd genug — heute erholst du dich.`)
        );
        continue;
      }
    }

    /* 2. Zwei fordernde Tage in Folge, egal ob geplant oder nicht */
    if (istHarterLauf(e.typ) && belastungVortag >= 110) {
      anpassungen.push(
        zuLocker(`Der ${kurz(vortag)} war mit TRIMP ${Math.round(belastungVortag)} bereits hart.`)
      );
      continue;
    }

    /* 3. Beine noch nicht erholt — harte Läufe darauf bringen nichts */
    if (istHarterLauf(e.typ) && e.datum <= addTage(inp.heute, 1) && beineMuede >= 65) {
      anpassungen.push(
        zuLocker(`Beinmuskulatur noch zu ${Math.round(beineMuede)} % belastet.`)
      );
      continue;
    }

    /* 4. Form im Keller bzw. Belastungssprung — nächste harte Einheit raus */
    const tsb = inp.tsb;
    const acwr = inp.acwr;
    if (istHarterLauf(e.typ) && e.datum <= addTage(inp.heute, 2)) {
      if (tsb != null && tsb < -25) {
        anpassungen.push(zuRuhe(`Form (TSB ${Math.round(tsb)}) tief im Minus — Erholung geht vor.`));
        continue;
      }
      if (acwr != null && acwr > 1.5) {
        anpassungen.push(
          zuLocker(`ACWR ${acwr.toFixed(2)} in der roten Zone — Umfang jetzt nicht weiter steigern.`)
        );
        continue;
      }
    }
  }

  // Höchstens zwei Eingriffe pro Lauf: sonst bleibt vom Plan nichts übrig
  return anpassungen.slice(0, 2);
}

/** „Do, 13.8." — kurzer Datumsbezug im Begründungssatz */
function kurz(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("de-CH", { weekday: "short", day: "numeric", month: "numeric" });
}

/** Wurde `gestern` überhaupt trainiert? (für Tests/Debug nützlich) */
export function belastungAmTag(
  aktivitaeten: AnpassungsAktivitaet[],
  datum: string
): number {
  return aktivitaeten
    .filter((a) => a.datum === datum)
    .reduce((s, a) => s + a.trimp, 0);
}
