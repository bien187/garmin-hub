/**
 * Demo-API: beantwortet die /api-Aufrufe der App-Komponenten im Browser aus
 * dem statischen, FIKTIVEN Datenstand in public/demo/daten/.
 *
 * - Nur lesend: jede Methode ausser GET wird mit 403 abgelehnt. In der Demo
 *   wird nichts geplant, gespeichert, gelöscht oder an Garmin gesendet.
 * - Kein Netz zu App-Endpunkten, keine DB, kein Garmin: Es gibt keinen
 *   Code-Pfad zu echten Endpunkten oder zu DATABASE_URL. Unbekannte Pfade
 *   antworten mit 404.
 */
import { aktuellePhase } from "@/lib/ep/phasen";
import { istEpTag } from "@/lib/ep/konstanten";
import { checklisteFuer, leseZustand } from "@/lib/ep/checkliste";
import type { DashboardDaten } from "@/lib/server/dashboard-service";
import type { SchlafDetail } from "@/lib/server/sleep-service";
import { addTage, montagVon } from "@/lib/format";

/* ------------------------------------------------------------ Typen */

export interface DemoAktivitaet {
  id: number;
  typ: string;
  name: string | null;
  startZeit: string;
  dauerS: number;
  distanzM: number | null;
  hmAuf: number | null;
  avgHr: number | null;
  avgPace: number | null;
  polyline: string | null;
}

export interface DemoPlanEinheit {
  id: string;
  datum: string;
  phase: number;
  typ: string;
  titel: string;
  beschreibung: string | null;
  struktur: unknown;
  erwarteterTrimp: number | null;
  garminWorkoutId: number | null;
  garminScheduleId: number | null;
  syncToGarmin: boolean;
  status: string;
  matchedActivityId: number | null;
}

export interface DemoBenchmark {
  id: string;
  datum: string;
  disziplin: string;
  wert: number;
  notiz: string | null;
}

/** Inhalt von public/demo/daten/kern.json (scripts/demo/aufnahme.aufnahme.ts) */
export interface DemoKern {
  heute: string;
  jetzt: string;
  dashboard: DashboardDaten;
  schlafKachel: SchlafDetail | null;
  schlafNaechte: string[];
  insights: unknown;
  body: unknown;
  model: unknown;
  courses: unknown[];
  polylines: string[];
  aktivitaeten: DemoAktivitaet[];
  lastSync: string;
  benchmarks: DemoBenchmark[];
  benchmarkPrognose: unknown;
  plan: {
    einheiten: DemoPlanEinheit[];
    hinweise: Record<string, string[]>;
    anpassungen: Record<string, unknown[]>;
    verfuegbarkeit: Record<string, string[]>;
  };
}

export interface DemoAntwort {
  status: number;
  daten: unknown;
}

/** Lädt eine Datei aus public/demo/daten/ (z. B. "aktivitaeten/123.json") */
export type DateiLader = (pfad: string) => Promise<unknown>;

export const IN_DER_DEMO_DEAKTIVIERT = "In der Demo deaktiviert.";

const ok = (daten: unknown): DemoAntwort => ({ status: 200, daten });
const fehler = (status: number, error: string): DemoAntwort => ({ status, daten: { error } });
const isoDatum = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

export class DemoApi {
  readonly kern: DemoKern;
  private readonly lade: DateiLader;

  constructor(kern: DemoKern, lade: DateiLader) {
    this.kern = kern;
    this.lade = lade;
  }

  async beantworte(methode: string, url: URL): Promise<DemoAntwort> {
    // Nur lesend — Sync, Push, Plan-Generierung, Benchmarks, Löschen … sind aus
    if (methode.toUpperCase() !== "GET") return fehler(403, IN_DER_DEMO_DEAKTIVIERT);

    const [a, b, c] = url.pathname.replace(/^\/api\//, "").split("/").filter(Boolean);
    const q = url.searchParams;
    switch (a) {
      case "activities":
        if (!b) return this.aktivitaetenListe(q);
        if (b === "polylines" && !c) return ok({ polylines: this.kern.polylines });
        return c ? fehler(404, IN_DER_DEMO_DEAKTIVIERT) : this.aktivitaet(Number(b));
      case "insights":
        return ok(this.kern.insights);
      case "body":
        return ok(this.kern.body);
      case "model":
        return ok(this.kern.model);
      case "courses":
        return b ? fehler(404, IN_DER_DEMO_DEAKTIVIERT) : ok({ courses: this.kern.courses });
      case "benchmarks":
        return ok({ benchmarks: this.kern.benchmarks, prognose: this.kern.benchmarkPrognose });
      case "plan":
        return b ? fehler(404, IN_DER_DEMO_DEAKTIVIERT) : this.planWoche(q);
      case "ep-checkliste":
        return this.checkliste(q);
      case "schlaf":
        return this.schlaf(b);
      default:
        return fehler(404, IN_DER_DEMO_DEAKTIVIERT);
    }
  }

  private aktivitaetenListe(q: URLSearchParams): DemoAntwort {
    const cursor = q.get("cursor");
    const typ = q.get("typ");
    const von = q.get("von");
    let rows = this.kern.aktivitaeten;
    if (cursor) rows = rows.filter((x) => Date.parse(x.startZeit) < Date.parse(cursor));
    if (typ && typ !== "alle") rows = rows.filter((x) => x.typ.includes(typ));
    if (von) rows = rows.filter((x) => Date.parse(x.startZeit) >= Date.parse(von));
    rows = [...rows].sort((x, y) => y.startZeit.localeCompare(x.startZeit)).slice(0, 20);
    return ok({
      aktivitaeten: rows,
      nextCursor: rows.length === 20 ? rows[rows.length - 1].startZeit : null,
      lastSync: cursor ? null : this.kern.lastSync,
    });
  }

  private async aktivitaet(id: number): Promise<DemoAntwort> {
    if (!Number.isFinite(id) || !this.kern.aktivitaeten.some((x) => x.id === id)) return fehler(404, "Nicht gefunden");
    return ok(await this.lade(`aktivitaeten/${id}.json`));
  }

  private planWoche(q: URLSearchParams): DemoAntwort {
    const montag = montagVon(q.get("woche") ?? this.kern.heute);
    const sonntag = addTage(montag, 6);
    const p = this.kern.plan;
    return ok({
      montag,
      phase: aktuellePhase(montag),
      einheiten: p.einheiten.filter((e) => e.datum >= montag && e.datum <= sonntag),
      hinweise: p.hinweise[montag] ?? [],
      anpassungen: p.anpassungen[montag] ?? [],
      nichtVerfuegbar: p.verfuegbarkeit[montag] ?? [],
    });
  }

  private checkliste(q: URLSearchParams): DemoAntwort {
    const datum = q.get("datum") ?? "";
    if (!isoDatum(datum) || !istEpTag(datum)) return fehler(400, "Nur für die EP-Tage verfügbar.");
    return ok({ datum, ...leseZustand(checklisteFuer(datum) ?? [], undefined) });
  }

  private async schlaf(datum: string | undefined): Promise<DemoAntwort> {
    if (!datum || !isoDatum(datum)) return fehler(400, "Ungültiges Datum");
    if (!this.kern.schlafNaechte.includes(datum)) return ok({ datum, detail: null });
    return ok(await this.lade(`schlaf/${datum}.json`));
  }
}
