import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { DemoApi, IN_DER_DEMO_DEAKTIVIERT, type DemoKern } from "@/lib/demo/api";
import { DEMO_HEUTE } from "@/lib/demo/konstanten";
import { EP_DATUM } from "@/lib/ep/konstanten";

/**
 * Prüft die Demo gegen den eingecheckten, fiktiven Datenstand in
 * public/demo/daten/ (erzeugt mit `pnpm demo:daten`).
 */
const DATEN = path.resolve(__dirname, "../../../public/demo/daten");
const lese = (p: string) => JSON.parse(readFileSync(path.join(DATEN, p), "utf8"));

let kern: DemoKern;
let api: DemoApi;
const fetchSpion = vi.fn(() => {
  throw new Error("Netzwerkzugriff in der Demo-API");
});

beforeAll(() => {
  kern = lese("kern.json");
});
beforeEach(() => {
  vi.stubGlobal("fetch", fetchSpion);
  api = new DemoApi(kern, async (p) => lese(p));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const rufe = async (methode: string, pfad: string) => {
  const r = await api.beantworte(methode, new URL(pfad, "https://demo.local"));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Antworten bewusst lose typisiert
  return { status: r.status, d: r.daten as Record<string, any> };
};

const LESEPFADE = () => [
  "/api/activities",
  "/api/activities/polylines",
  `/api/activities/${kern.aktivitaeten[0].id}`,
  "/api/insights",
  "/api/body",
  "/api/model",
  "/api/courses",
  "/api/benchmarks",
  "/api/plan",
  `/api/ep-checkliste?datum=${EP_DATUM}`,
  `/api/schlaf/${kern.schlafNaechte.at(-1)}`,
];

describe("Demo-Datenstand", () => {
  it("existiert, ist fiktiv und enthält keine Zugangsdaten oder Einstellungen", () => {
    expect(existsSync(path.join(DATEN, "kern.json"))).toBe(true);
    expect(kern.heute).toBe(DEMO_HEUTE);
    expect(kern.dashboard.profil.name).toBe("Alex Muster");
    const roh = readFileSync(path.join(DATEN, "kern.json"), "utf8");
    expect(roh).not.toMatch(/token|passwort|password|oauth|garmin_hr_zonen|DATABASE_URL/i);
    expect(kern).not.toHaveProperty("settings");
  });

  it("füllt das Dashboard vollständig", () => {
    const d = kern.dashboard;
    expect(d.dbBereit).toBe(true);
    expect(d.fitness.length).toBeGreaterThan(100);
    expect(d.heuteHealth.trainingReadiness).not.toBeNull();
    expect(d.tsbHeute).not.toBeNull();
    expect(d.letzteAktivitaet).not.toBeNull();
    expect(d.naechsteEinheit).not.toBeNull();
    expect(d.allTime.aktivitaeten).toBeGreaterThan(80);
    expect(d.paceFortschritt.wochen.some((w) => w.paceSKm != null)).toBe(true);
    expect(Object.keys(d.muskelnHeute).length).toBeGreaterThan(5);
    expect(Object.values(d.epPrognose.disziplinen).every((x) => x.aktuellerWert != null)).toBe(true);
    expect(kern.schlafKachel).not.toBeNull();
  });

  it("hat zu jeder Aktivität eine Detaildatei mit passenden Streams", () => {
    const dateien = new Set(readdirSync(path.join(DATEN, "aktivitaeten")));
    for (const a of kern.aktivitaeten) expect(dateien.has(`${a.id}.json`)).toBe(true);
    const lauf = kern.aktivitaeten.find((a) => a.typ === "running")!;
    const det = lese(`aktivitaeten/${lauf.id}.json`);
    expect(det.streams.lat.length).toBe(det.streams.hr.length);
    expect(det.metriken.splits.length).toBeGreaterThan(2);
    expect(det.metriken.zonenZeit).not.toBeNull();
  });

  it("enthält verschiedene Sportarten rund um Bern", () => {
    const typen = new Set(kern.aktivitaeten.map((a) => a.typ));
    for (const t of ["running", "trail_running", "strength_training", "hiking", "cycling"]) expect(typen.has(t)).toBe(true);
    const det = lese(`aktivitaeten/${kern.aktivitaeten.find((a) => a.polyline)!.id}.json`);
    const lat = det.streams.lat.find((x: number | null) => x != null);
    const lng = det.streams.lng.find((x: number | null) => x != null);
    expect(lat).toBeGreaterThan(46.8);
    expect(lat).toBeLessThan(47.1);
    expect(lng).toBeGreaterThan(7.3);
    expect(lng).toBeLessThan(7.6);
  });

  it("zeigt absolvierte und geplante Einheiten sowie die fixen EP-Tage", () => {
    const status = new Set(kern.plan.einheiten.map((e) => e.status));
    expect(status.has("absolviert")).toBe(true);
    expect(status.has("geplant")).toBe(true);
    expect(kern.plan.einheiten.some((e) => e.typ === "ep" && e.datum === EP_DATUM)).toBe(true);
  });
});

describe("Demo-API (nur lesend)", () => {
  it("beantwortet alle Lesepfade ohne Netz", async () => {
    for (const p of LESEPFADE()) expect((await rufe("GET", p)).status, p).toBe(200);
    expect(fetchSpion).not.toHaveBeenCalled();
  });

  it("lehnt jede Methode ausser GET ab", async () => {
    const id = kern.aktivitaeten[0].id;
    const einheit = kern.plan.einheiten[0].id;
    for (const [m, p] of [
      ["POST", "/api/sync"],
      ["POST", "/api/plan/generate"],
      ["POST", `/api/plan/${einheit}/push`],
      ["PATCH", `/api/plan/${einheit}`],
      ["POST", "/api/plan/adhoc"],
      ["POST", "/api/benchmarks"],
      ["DELETE", "/api/benchmarks?id=x"],
      ["PUT", "/api/ep-checkliste"],
      ["DELETE", `/api/activities/${id}`],
      ["POST", `/api/activities/${id}/resync`],
      ["POST", "/api/courses"],
      ["POST", "/api/settings"],
    ] as const) {
      const r = await rufe(m, p);
      expect(r.status, `${m} ${p}`).toBe(403);
      expect(r.d.error).toBe(IN_DER_DEMO_DEAKTIVIERT);
    }
    expect(fetchSpion).not.toHaveBeenCalled();
  });

  it("kennt keine Einstellungs-, Login-, Garmin- oder Bridge-Endpunkte", async () => {
    for (const p of ["/api/settings", "/api/garmin/status", "/api/auth/login", "/api/bridge", "/api/cron/daily", "/api/sync"]) {
      expect((await rufe("GET", p)).status, p).toBe(404);
    }
  });

  it("blättert Aktivitäten seitenweise und filtert nach Typ", async () => {
    const s1 = await rufe("GET", "/api/activities");
    expect(s1.d.aktivitaeten).toHaveLength(20);
    const s2 = await rufe("GET", `/api/activities?cursor=${encodeURIComponent(s1.d.nextCursor)}`);
    expect(s2.d.aktivitaeten[0].startZeit < s1.d.aktivitaeten[19].startZeit).toBe(true);
    const kraft = await rufe("GET", "/api/activities?typ=strength");
    expect(kraft.d.aktivitaeten.every((a: { typ: string }) => a.typ.includes("strength"))).toBe(true);
  });

  it("liefert die Planwoche mit Phase", async () => {
    const w = await rufe("GET", "/api/plan?woche=2026-11-16");
    expect(w.d.montag).toBe("2026-11-16");
    expect(w.d.einheiten.filter((e: { typ: string }) => e.typ === "ep")).toHaveLength(2);
  });

  it("fällt bei fehlender Datei nicht auf eine andere Quelle zurück (fail-closed)", async () => {
    const kaputt = new DemoApi(kern, async () => {
      throw new Error("Demo-Datei fehlt");
    });
    await expect(kaputt.beantworte("GET", new URL(`/api/activities/${kern.aktivitaeten[0].id}`, "https://demo.local"))).rejects.toThrow();
    expect(fetchSpion).not.toHaveBeenCalled();
  });
});
