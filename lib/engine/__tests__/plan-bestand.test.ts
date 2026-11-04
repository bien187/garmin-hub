import { describe, expect, it } from "vitest";
import { BestandsEintrag, belegteTage, entscheideEintrag, planeBestand } from "../plan-bestand";
import { generiereWochenplan, PlanInput } from "../plan";
import { planeVerfuegbarkeit } from "../verfuegbarkeit";

const zonen = { z2: { von: 137, bis: 152 }, z4: { von: 168, bis: 183 }, z5: { von: 183, bis: 197 } };
const basis: PlanInput = {
  wochenstart: "2026-11-02",
  phaseNr: 3,
  restwochen: 3,
  wochenIndex: 16,
  vorwocheLaufMin: 170,
  tsb: 0,
  acwr: 1,
  muscleState: {},
  benchmarks: { klimmzuege: 7 },
  readiness: 60,
  paces: null,
  zonen,
  letztesLastKg: 20,
};

let n = 0;
const eintrag = (datum: string, typ: string, titel: string, status = "geplant", garmin: number | null = null): BestandsEintrag => ({
  id: `e${++n}`,
  datum,
  typ,
  titel,
  status,
  garminWorkoutId: garmin,
});

/* Stand der echten DB (04.11.2026) für die Woche 02.–08.11., alte Logik */
const bestand = [
  eintrag("2026-11-02", "kraft", "Gym: Brust/Trizeps", "absolviert"),
  eintrag("2026-11-04", "lauf_z2", "Z2-Lauf 30 Min", "absolviert", 3),
  eintrag("2026-11-05", "klimmzuege", "Gym: Rücken/Bizeps + Klimmzüge schwer"),
  eintrag("2026-11-05", "rumpf", "Rumpf im Sekundentakt (78s/120s)", "gepusht", 4),
  eintrag("2026-11-06", "lauf_z2", "Z2-Lauf 30 Min", "gepusht", 5),
  eintrag("2026-11-07", "probe_ep", "Probe-EP: Alle 5 Disziplinen"),
  eintrag("2026-11-07", "rumpf", "Rumpf im Sekundentakt (78s/120s)", "gepusht", 6),
  eintrag("2026-11-08", "kraft", "Gym: Ganzkörper + Klimmzug-Volumen"),
];
const heute = "2026-11-05";
const id = (datum: string, typ: string) => bestand.find((e) => e.datum === datum && e.typ === typ)!.id;

function neuGenerieren(bestehende: BestandsEintrag[], gesperrt: string[] = []) {
  const plan = generiereWochenplan(basis);
  const belegt = belegteTage(bestehende);
  const verteilt = planeVerfuegbarkeit(plan, gesperrt, heute, belegt);
  return planeBestand({ bestehende, neu: verteilt.einheiten, generiert: plan.einheiten, heute, gesperrt, belegt });
}

describe("entscheideEintrag", () => {
  const ctx = { heute, gesperrt: [], belegt: ["2026-11-05", "2026-11-07"] };
  it("absolviert bleibt, auch wenn er nicht zum Taper passt", () => {
    expect(entscheideEintrag(eintrag("2026-11-07", "probe_ep", "Probe-EP", "absolviert"), ctx).aktion).toBe("behalten");
  });
  it("gepusht und regelwidrig → Hinweis, nicht löschen", () => {
    const d = entscheideEintrag(eintrag("2026-11-11", "lauf_z2", "Z2-Lauf 35 Min", "gepusht", 9), ctx);
    expect(d.aktion).toBe("melden");
    expect(d.grund).toContain("30 Min");
  });
  it("gepusht und regelkonform → bleibt", () => {
    expect(entscheideEintrag(eintrag("2026-11-06", "lauf_z2", "Z2-Lauf 30 Min", "gepusht", 9), ctx).aktion).toBe("behalten");
  });
  it("geplant und regelwidrig auf belegtem Tag → ersetzt", () => {
    expect(entscheideEintrag(eintrag("2026-11-07", "probe_ep", "Probe-EP"), ctx).aktion).toBe("ersetzen");
  });
  it("geplant auf belegtem Taper-Tag → durch die Taper-Version ersetzt (Umfang −40 %)", () => {
    const d = entscheideEintrag(eintrag("2026-11-05", "klimmzuege", "Gym: Rücken/Bizeps + Klimmzüge schwer"), ctx);
    expect(d.aktion).toBe("ersetzen");
    expect(d.grund).toContain("Taper-Version");
  });
  it("geplant auf belegtem Tag vor dem Taper → bleibt (wie bisher)", () => {
    const vorher = { heute: "2026-11-02", gesperrt: [], belegt: ["2026-11-03"] };
    expect(entscheideEintrag(eintrag("2026-11-03", "klimmzuege", "Gym: Klimmzüge schwer"), vorher).aktion).toBe("behalten");
  });
  it("geplant auf freiem Tag → ersetzt (wie bisher)", () => {
    expect(entscheideEintrag(eintrag("2026-11-08", "kraft", "Gym: Ganzkörper"), ctx).aktion).toBe("ersetzen");
  });
  it("EP-Eintrag bleibt immer", () => {
    const ep = eintrag("2026-11-18", "ep", "EP – Tag 1");
    expect(entscheideEintrag(ep, { heute: "2026-11-16", gesperrt: ["2026-11-18"], belegt: [] }).aktion).toBe("behalten");
  });
  it("Vergangenheit bleibt", () => {
    expect(entscheideEintrag(eintrag("2026-11-03", "intervalle", "EP-Tempo"), ctx).aktion).toBe("behalten");
  });
});

describe("planeBestand — Woche 02.–08.11. aus der echten DB", () => {
  const r = neuGenerieren(bestand);

  it("Probe-EP am 07.11. (geplant neben gepushtem Rumpf) wird ersetzt", () => {
    expect(r.loeschen).toContain(id("2026-11-07", "probe_ep"));
    const sa = r.einfuegen.filter((e) => e.datum === "2026-11-07");
    expect(sa.map((e) => e.typ)).toEqual(["intervalle"]); // Rumpf liegt schon auf der Uhr
    expect(sa[0].titel).toContain("Letzte Intensität");
  });

  it("gepushte und absolvierte Einträge werden nie gelöscht", () => {
    for (const e of bestand.filter((b) => b.status !== "geplant")) expect(r.loeschen).not.toContain(e.id);
  });

  it("Klimmzüge schwer am 05.11. (geplant neben gepushtem Rumpf) → abgeschwächte Taper-Version", () => {
    expect(r.loeschen).toContain(id("2026-11-05", "klimmzuege"));
    const ersatz = r.einfuegen.filter((e) => e.datum === "2026-11-05");
    expect(ersatz.map((e) => e.typ)).toEqual(["klimmzuege"]); // Rumpf liegt schon auf der Uhr
    expect(ersatz[0].beschreibung).toContain("Taper");
  });

  it("gepushte Kraft/Rumpf mit vollem Umfang → Hinweis zum Kürzen, keiner für den Z2-Lauf", () => {
    expect(r.hinweise).toHaveLength(2);
    expect(r.hinweise.every((h) => h.startsWith("«Rumpf im Sekundentakt"))).toBe(true);
    expect(r.hinweise[0]).toContain("(Do 5.11.)");
    expect(r.hinweise[1]).toContain("(Sa 7.11.)");
    expect(r.hinweise[0]).toContain("−40 %");
    expect(r.hinweise.some((h) => h.includes("Z2-Lauf"))).toBe(false);
  });

  it("gepushte Einheit mit Taper-Anpassung in der Beschreibung → kein Hinweis", () => {
    const angepasst = bestand.map((e) =>
      e.typ === "rumpf" ? { ...e, beschreibung: "Rumpf. Taper: Sätze ca. −40 %, nichts steigern." } : e
    );
    expect(neuGenerieren(angepasst).hinweise).toEqual([]);
  });

  it("freier Taper-Tag 08.11. wird neu und abgeschwächt geplant", () => {
    expect(r.loeschen).toContain(id("2026-11-08", "kraft"));
    expect(r.einfuegen.filter((e) => e.datum === "2026-11-08").every((e) => e.beschreibung.includes("Taper"))).toBe(true);
  });

  it("keine neuen Einheiten auf Tagen vor heute und keine Probe-EP", () => {
    expect(r.einfuegen.every((e) => e.datum >= heute)).toBe(true);
    expect(r.einfuegen.some((e) => e.typ === "probe_ep" || e.typ === "lastlauf")).toBe(false);
  });

  it("gepushter regelwidriger Eintrag → Hinweis mit «Von der Uhr entfernen»", () => {
    const mitUhr = [...bestand, eintrag("2026-11-08", "intervalle", "Taper: Kurze Spitzen", "gepusht", 7)];
    const res = neuGenerieren(mitUhr);
    const uhr = res.hinweise.filter((h) => h.includes("liegt bereits auf der Uhr"));
    expect(uhr).toHaveLength(1);
    expect(uhr[0]).toContain("«Taper: Kurze Spitzen» (So 8.11.)");
    expect(uhr[0]).toContain("«Von der Uhr entfernen»");
    expect(res.loeschen).not.toContain(mitUhr[mitUhr.length - 1].id);
  });
});

describe("planeBestand — EP-Einträge idempotent", () => {
  const woche: PlanInput = { ...basis, wochenstart: "2026-11-16", phaseNr: 4, restwochen: 1 };
  const generieren = (bestehende: BestandsEintrag[], heuteW = "2026-11-16") => {
    const plan = generiereWochenplan(woche);
    const belegt = belegteTage(bestehende);
    const verteilt = planeVerfuegbarkeit(plan, [], heuteW, belegt);
    return planeBestand({ bestehende, neu: verteilt.einheiten, generiert: plan.einheiten, heute: heuteW, gesperrt: [], belegt });
  };

  it("erstmalig: je ein EP-Eintrag 18./19.11., veraltete Einheiten dort werden ersetzt", () => {
    const alt = [eintrag("2026-11-18", "lauf_z2", "Z2-Lauf 35 Min"), eintrag("2026-11-19", "klimmzuege", "Gym: Rücken/Bizeps + Klimmzüge schwer")];
    const r = generieren(alt);
    expect(r.loeschen).toEqual(alt.map((e) => e.id));
    const ep = r.einfuegen.filter((e) => e.typ === "ep");
    expect(ep.map((e) => e.datum)).toEqual(["2026-11-18", "2026-11-19"]);
    expect(r.einfuegen.filter((e) => e.datum === "2026-11-18" || e.datum === "2026-11-19")).toHaveLength(2);
  });

  it("zweiter Lauf: bestehende EP-Einträge bleiben unverändert, nichts doppelt", () => {
    const ep1 = eintrag("2026-11-18", "ep", "EP – Tag 1");
    const ep2 = eintrag("2026-11-19", "ep", "EP – Tag 2", "absolviert");
    const r = generieren([ep1, ep2]);
    expect(r.loeschen).toEqual([]);
    expect(r.einfuegen.some((e) => e.typ === "ep")).toBe(false);
    expect(r.entscheide.every((d) => d.aktion === "behalten")).toBe(true);
  });

  it("EP-Eintrag wird auch nach dem EP-Tag nie gelöscht", () => {
    const ep1 = eintrag("2026-11-18", "ep", "EP – Tag 1");
    const r = generieren([ep1], "2026-11-20");
    expect(r.loeschen).toEqual([]);
  });
});
