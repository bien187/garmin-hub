import { describe, expect, it } from "vitest";
import {
  bereinigeAbgehakt,
  checklisteFuer,
  checklistenSchluessel,
  fortschritt,
  fruehstueckFenster,
  leseZustand,
  normalisiereStartzeit,
  punktIds,
  STANDARD_STARTZEIT,
  type ChecklistenGruppe,
} from "../checkliste";
import { EP_DATUM, EP_TAG_2 } from "../konstanten";

const tag1 = checklisteFuer(EP_DATUM) as ChecklistenGruppe[];
const tag2 = checklisteFuer(EP_TAG_2) as ChecklistenGruppe[];

describe("fruehstueckFenster", () => {
  it("08:00 → 05:00 bis 06:00", () => {
    expect(fruehstueckFenster("08:00")).toEqual({
      von: "05:00",
      bis: "06:00",
      vonVortag: false,
      bisVortag: false,
    });
  });

  it("07:15 → 04:15 bis 05:15", () => {
    const f = fruehstueckFenster("07:15");
    expect([f.von, f.bis]).toEqual(["04:15", "05:15"]);
  });

  it("01:30 → Fenster liegt am Vortag (22:30 bis 23:30)", () => {
    expect(fruehstueckFenster("01:30")).toEqual({
      von: "22:30",
      bis: "23:30",
      vonVortag: true,
      bisVortag: true,
    });
  });

  it("02:30 → beginnt am Vortag, endet am EP-Tag", () => {
    expect(fruehstueckFenster("02:30")).toEqual({
      von: "23:30",
      bis: "00:30",
      vonVortag: true,
      bisVortag: false,
    });
  });

  it("Grenzen 00:00 und 23:59", () => {
    expect(fruehstueckFenster("00:00")).toMatchObject({ von: "21:00", bis: "22:00", vonVortag: true });
    expect(fruehstueckFenster("23:59")).toMatchObject({ von: "20:59", bis: "21:59", vonVortag: false });
  });

  it("ungültige Eingabe → Standard 08:00", () => {
    const standard = fruehstueckFenster("08:00");
    for (const x of ["", "8:00", "24:00", "12:60", "abc", "08:00:00", " 08:00"]) {
      expect(fruehstueckFenster(x)).toEqual(standard);
    }
    expect(STANDARD_STARTZEIT).toBe("08:00");
    expect(normalisiereStartzeit(undefined)).toBe("08:00");
    expect(normalisiereStartzeit(800)).toBe("08:00");
    expect(normalisiereStartzeit("09:45")).toBe("09:45");
  });
});

describe("fortschritt", () => {
  it("leer → 0 von gesamt", () => {
    expect(fortschritt(tag1, [])).toEqual({ erledigt: 0, gesamt: punktIds(tag1).length });
  });

  it("zählt nur IDs, die in der Liste existieren", () => {
    const [a, b] = punktIds(tag1);
    expect(fortschritt(tag1, [a, "gibt-es-nicht", b, "t2-morgens-kaffee"]).erledigt).toBe(2);
  });

  it("Duplikate zählen einmal", () => {
    const [a] = punktIds(tag1);
    expect(fortschritt(tag1, [a, a, a]).erledigt).toBe(1);
  });

  it("alles abgehakt → gesamt von gesamt", () => {
    const ids = punktIds(tag2);
    expect(fortschritt(tag2, ids)).toEqual({ erledigt: ids.length, gesamt: ids.length });
  });

  it("bereinigeAbgehakt: bekannte IDs, ohne Duplikate, in Listenreihenfolge", () => {
    const ids = punktIds(tag1);
    expect(bereinigeAbgehakt(tag1, [ids[3], "x", ids[0], ids[3]])).toEqual([ids[0], ids[3]]);
  });
});

describe("Checklisten-Inhalt", () => {
  it("nur die beiden EP-Tage haben eine Checkliste", () => {
    expect(tag1).not.toBeNull();
    expect(tag2).not.toBeNull();
    expect(checklisteFuer("2026-11-17")).toBeNull();
    expect(checklisteFuer("2026-11-20")).toBeNull();
  });

  it("gleiche Gruppenstruktur Vorabend / Morgens / Vor Ort / Danach", () => {
    expect(tag1.map((g) => g.titel)).toEqual(["Vorabend", "Morgens", "Vor Ort", "Danach"]);
    expect(tag2).toHaveLength(4);
    expect(tag2[0].titel).toMatch(/^Vorabend/);
    expect(tag2.slice(1).map((g) => g.titel)).toEqual(["Morgens", "Vor Ort", "Danach"]);
  });

  it("IDs (Gruppen und Punkte) sind eindeutig — auch über beide Tage", () => {
    const alle = [...tag1, ...tag2].flatMap((g) => [g.id, ...g.punkte.map((p) => p.id)]);
    expect(new Set(alle).size).toBe(alle.length);
  });

  it("Tag 1 ≠ Tag 2 (eigene IDs, Vorabend von Tag 2 = Abend nach Tag 1)", () => {
    const ids1 = new Set(punktIds(tag1));
    expect(punktIds(tag2).some((id) => ids1.has(id))).toBe(false);
    expect(tag2).not.toEqual(tag1);
    const vorabend2 = tag2[0].punkte.map((p) => p.text).join(" ");
    expect(vorabend2).toMatch(/Erholung/);
    expect(vorabend2).toMatch(/Tag 2/);
  });

  it("enthält die Punkte aus C1", () => {
    const text = (gs: ChecklistenGruppe[]) =>
      gs.flatMap((g) => g.punkte.map((p) => `${p.text} ${p.hinweis ?? ""}`)).join("\n");
    for (const gs of [tag1, tag2]) {
      const t = text(gs);
      for (const muss of [
        "Tasche",
        "Ausweis",
        "Wecker",
        "Früh schlafen",
        "Frühstück 2–3 h vor Startzeit",
        "Haferflocken",
        "Nichts Neues",
        "Elektrolyte",
        "Kaffee nur wie gewohnt",
        "Früh ankommen",
        "Toilette",
        "Aufwärmen und Mobilisation",
        "Wasserflasche",
        "Reiswaffel",
        "Handy lautlos",
        "Atemübungen",
        "Kohlenhydrate und Protein",
        "Trinken und Salz",
        "Schlaf",
      ]) {
        expect(t).toContain(muss);
      }
    }
    expect(text(tag1)).toContain("Anfahrt und Parkplatz");
  });

  it("Schweizer Schreibweise: kein ß", () => {
    expect(JSON.stringify([tag1, tag2])).not.toContain("ß");
  });
});

describe("Persistenz-Hilfen", () => {
  it("Schlüssel je Datum", () => {
    expect(checklistenSchluessel(EP_DATUM)).toBe("ep_checkliste_2026-11-18");
    expect(checklistenSchluessel(EP_TAG_2)).toBe("ep_checkliste_2026-11-19");
  });

  it("leseZustand: robust gegen fehlende/kaputte Werte", () => {
    expect(leseZustand(tag1, undefined)).toEqual({ abgehakt: [], startzeit: "08:00" });
    expect(leseZustand(tag1, "quatsch")).toEqual({ abgehakt: [], startzeit: "08:00" });
    const [a] = punktIds(tag1);
    expect(
      leseZustand(tag1, { abgehakt: [a, 42, "weg", a], startzeit: "25:00" })
    ).toEqual({ abgehakt: [a], startzeit: "08:00" });
    expect(leseZustand(tag1, { abgehakt: [], startzeit: "07:30" }).startzeit).toBe("07:30");
  });
});
