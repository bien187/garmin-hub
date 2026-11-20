import { describe, expect, it } from "vitest";
import { BestandsEintrag, belegteTage, entscheideEintrag, planeBestand } from "../plan-bestand";
import { generiereWochenplan, PlanInput } from "../plan";
import { planeVerfuegbarkeit } from "../verfuegbarkeit";

const zonen = { z2: { von: 137, bis: 152 }, z4: { von: 168, bis: 183 }, z5: { von: 183, bis: 197 } };
// Woche Mo 07.12.–So 13.12.2026
const basis: PlanInput = {
  wochenstart: "2026-12-07",
  blockWoche: 3,
  vorwocheLaufMin: 130,
  tsb: 0,
  acwr: 1,
  muscleState: {},
  klimmzugMax: 8,
  readiness: 60,
  paces: null,
  zonen,
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

const bestand = [
  eintrag("2026-12-07", "kraft", "Gym: Brust/Trizeps + Rumpf", "absolviert"),
  eintrag("2026-12-08", "intervalle", "Tempo 5×1 km", "gepusht", 3),
  eintrag("2026-12-09", "lauf_z2", "Z2-Lauf 40 Min"),
  eintrag("2026-12-10", "kraft", "Gym: Rücken/Bizeps + Beine"),
  eintrag("2026-12-11", "ruhe", "Ruhetag"),
  eintrag("2026-12-12", "lauf_z2", "Z2-Lauf 45 Min"), // alter Wochenend-Eintrag
];
const heute = "2026-12-08";
const id = (datum: string) => bestand.find((e) => e.datum === datum)!.id;

function neuGenerieren(bestehende: BestandsEintrag[], gesperrt: string[] = []) {
  const plan = generiereWochenplan(basis);
  const belegt = belegteTage(bestehende);
  const verteilt = planeVerfuegbarkeit(plan, gesperrt, heute, belegt);
  return planeBestand({ bestehende, neu: verteilt.einheiten, heute, gesperrt, belegt });
}

describe("entscheideEintrag", () => {
  const ctx = { heute, gesperrt: [], belegt: ["2026-12-07", "2026-12-08"] };
  it("absolviert und Vergangenes bleibt", () => {
    expect(entscheideEintrag(bestand[0], ctx).aktion).toBe("behalten");
  });
  it("auf der Uhr → bleibt", () => {
    expect(entscheideEintrag(bestand[1], ctx).aktion).toBe("behalten");
  });
  it("geplant auf freiem Tag → ersetzt", () => {
    expect(entscheideEintrag(bestand[2], ctx).aktion).toBe("ersetzen");
  });
  it("geplant auf belegtem Tag → bleibt", () => {
    const e = eintrag("2026-12-08", "kraft", "Zusatz");
    expect(entscheideEintrag(e, ctx).aktion).toBe("behalten");
  });
  it("geplant auf gesperrtem Tag → ersetzt", () => {
    expect(entscheideEintrag(bestand[2], { ...ctx, gesperrt: ["2026-12-09"] }).aktion).toBe("ersetzen");
  });
});

describe("planeBestand", () => {
  const r = neuGenerieren(bestand);

  it("löscht nur offene, nicht übertragene Einträge ab heute", () => {
    expect(r.loeschen.sort()).toEqual(
      [id("2026-12-09"), id("2026-12-10"), id("2026-12-11"), id("2026-12-12")].sort()
    );
  });

  it("plant ab heute neu — ohne belegte Tage, ohne Wochenend-Einheit", () => {
    const daten = r.einfuegen.map((e) => e.datum);
    expect(daten).not.toContain("2026-12-07"); // Vergangenheit
    expect(daten).not.toContain("2026-12-08"); // liegt auf der Uhr
    expect(daten).toEqual(["2026-12-09", "2026-12-10", "2026-12-11"]);
    expect(r.einfuegen.some((e) => e.datum >= "2026-12-12")).toBe(false);
  });

  it("ist idempotent: zweimal generieren ergibt denselben Plan", () => {
    const zweite = neuGenerieren([
      ...bestand.filter((e) => !r.loeschen.includes(e.id)),
      ...r.einfuegen.map((e, i) => ({ ...eintrag(e.datum, e.typ, e.titel), id: `neu${i}` })),
    ]);
    expect(zweite.einfuegen.map((e) => [e.datum, e.typ])).toEqual(r.einfuegen.map((e) => [e.datum, e.typ]));
  });
});
