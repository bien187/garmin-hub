import { describe, expect, it } from "vitest";
import { istDemoPfad, mitBasis, ohneBasis } from "@/lib/demo/pfade";
import { istDemoApiAufruf } from "@/lib/demo/fetch";

describe("Demo-Pfade", () => {
  it("erkennt nur /demo und Unterpfade", () => {
    expect(istDemoPfad("/demo")).toBe(true);
    expect(istDemoPfad("/demo/plan")).toBe(true);
    expect(istDemoPfad("/demonstration")).toBe(false);
    expect(istDemoPfad("/")).toBe(false);
  });

  it("entfernt die Basis", () => {
    expect(ohneBasis("/demo")).toBe("/");
    expect(ohneBasis("/demo/activities/5")).toBe("/activities/5");
    expect(ohneBasis("/plan")).toBe("/plan");
  });

  it("setzt die Basis nur in der Demo", () => {
    expect(mitBasis("", "/plan?tab=benchmarks")).toBe("/plan?tab=benchmarks");
    expect(mitBasis("/demo", "/plan?tab=benchmarks")).toBe("/demo/plan?tab=benchmarks");
    expect(mitBasis("/demo", "/")).toBe("/demo");
    expect(mitBasis("/demo", "https://benlinusmueller.com/")).toBe("https://benlinusmueller.com/");
    expect(mitBasis("/demo", "//cdn.example")).toBe("//cdn.example");
  });

  it("fängt nur /api der eigenen Origin ab", () => {
    const o = "https://hub.example";
    expect(istDemoApiAufruf(new URL("/api/plan?woche=2026-11-02", o), o)).toBe(true);
    expect(istDemoApiAufruf(new URL("/demo/daten/kern.json", o), o)).toBe(false);
    expect(istDemoApiAufruf(new URL("https://brouter.de/api/x"), o)).toBe(false);
    expect(istDemoApiAufruf(new URL("/apix", o), o)).toBe(false);
  });
});

describe("Portfolio-Link", () => {
  it("erscheint nur mit gültiger NEXT_PUBLIC_PORTFOLIO_URL", async () => {
    const { portfolioUrl } = await import("@/lib/demo/konstanten");
    expect(portfolioUrl("")).toBeNull();
    expect(portfolioUrl(undefined)).toBeNull();
    expect(portfolioUrl("https://benlinusmueller.com")).toBe("https://benlinusmueller.com/");
    expect(portfolioUrl("javascript:alert(1)")).toBeNull();
    expect(portfolioUrl("kein link")).toBeNull();
  });
});
