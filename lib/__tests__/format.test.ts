import { describe, expect, it } from "vitest";
import { formatPaceKurz, formatStundenMinuten, relativerTag, stundeZuerich, tageszeitGruss } from "../format";
import { motivation } from "../dashboard-texte";

describe("Formatierung", () => {
  it("Pace ohne Einheit", () => {
    expect(formatPaceKurz(312)).toBe("5:12");
    expect(formatPaceKurz(359.6)).toBe("6:00");
    expect(formatPaceKurz(null)).toBe("–");
  });
  it("Stunden:Minuten", () => {
    expect(formatStundenMinuten(13500)).toBe("3:45");
    expect(formatStundenMinuten(0)).toBe("0:00");
  });
  it("relativer Tag", () => {
    expect(relativerTag("2026-11-24", "2026-11-24")).toBe("Heute");
    expect(relativerTag("2026-11-25", "2026-11-24")).toBe("Morgen");
    expect(relativerTag("2026-11-23", "2026-11-24")).toBe("Gestern");
    expect(relativerTag("2026-11-27", "2026-11-24")).toMatch(/27/);
  });
  it("Stunde in Zürich und Gruss", () => {
    expect(stundeZuerich(Date.parse("2026-11-24T06:30:00Z"))).toBe(7); // MEZ
    expect(stundeZuerich(Date.parse("2026-07-01T06:30:00Z"))).toBe(8); // MESZ
    expect(tageszeitGruss(7)).toBe("Guten Morgen");
    expect(tageszeitGruss(14)).toBe("Hallo");
    expect(tageszeitGruss(20)).toBe("Guten Abend");
    expect(tageszeitGruss(2)).toMatch(/Nacht/);
  });
});

describe("motivation", () => {
  const leer = { erledigt: 0, geplant: 0 };
  it("heutige Einheit hat Vorrang", () => {
    expect(
      motivation({ heute: "2026-11-24", naechste: { datum: "2026-11-24", titel: "Intervalle 5×3 Min", typ: "intervalle" }, fortschritt: leer })
    ).toMatch(/Heute steht «Intervalle 5×3 Min» an/);
  });
  it("Woche komplett erledigt", () => {
    expect(motivation({ heute: "2026-11-27", naechste: null, fortschritt: { erledigt: 4, geplant: 4 } })).toMatch(/Alle 4/);
  });
  it("morgen geplant", () => {
    expect(
      motivation({ heute: "2026-11-23", naechste: { datum: "2026-11-24", titel: "Tempo 5×1 km", typ: "intervalle" }, fortschritt: leer })
    ).toMatch(/^Morgen/);
  });
  it("Wochenende frei", () => {
    expect(motivation({ heute: "2026-11-28", naechste: null, fortschritt: leer })).toMatch(/Wochenende/);
  });
});
