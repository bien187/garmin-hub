import { describe, expect, it } from "vitest";
import { istOeffentlicherPfad } from "@/lib/oeffentliche-pfade";

describe("istOeffentlicherPfad", () => {
  it("gibt die Demo ohne Login frei", () => {
    for (const p of ["/demo", "/demo/activities", "/demo/activities/123", "/demo/plan", "/demo/daten/kern.json"]) {
      expect(istOeffentlicherPfad(p)).toBe(true);
    }
  });

  it("lässt die reguläre App und alle App-APIs geschützt", () => {
    for (const p of ["/", "/activities", "/plan", "/settings", "/schlaf/2026-11-05", "/api/activities", "/api/demo", "/api/sync", "/api/garmin/status", "/demonstration", "/demo-daten/x.json"]) {
      expect(istOeffentlicherPfad(p)).toBe(false);
    }
  });

  it("behält die bisherigen öffentlichen Pfade", () => {
    for (const p of ["/login", "/api/auth/login", "/api/cron/daily", "/api/bridge"]) {
      expect(istOeffentlicherPfad(p)).toBe(true);
    }
  });
});
