import { describe, expect, it } from "vitest";
import { archivTitel, imArchivSichtbar } from "../plan-archiv";

describe("plan-archiv", () => {
  it("zeigt ältere Einträge neutral nach Art und Dauer", () => {
    expect(archivTitel("lauf_z2", "Z2-Lauf 45 Min")).toBe("Lockerer Lauf · 45 Min");
    expect(archivTitel("intervalle", "Intervalle 5×3 Min Z5")).toBe("Intervalle");
    expect(archivTitel("ruhe", "Ruhetag")).toBe("Ruhetag");
    expect(archivTitel("irgendwas", "x")).toBe("Einheit");
  });
  it("blendet reine Termin-Marker aus", () => {
    expect(imArchivSichtbar("ep")).toBe(false);
    expect(imArchivSichtbar("kraft")).toBe(true);
  });
});
