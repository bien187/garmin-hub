import { afterEach, describe, expect, it, vi } from "vitest";
import { rateLimit } from "../rate-limit";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => { throw new Error("DB-Limiter aufgerufen"); }),
  tables: {},
}));

afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("Lokaler Testserver ohne Datenbank", () => {
  it("begrenzt Loginversuche und gibt sie nach Ablauf wieder frei", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DATABASE_URL", undefined);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T12:00:00Z"));
    for (let i = 0; i < 8; i++) {
      expect((await rateLimit("login", { max: 8, windowSec: 900 })).ok).toBe(true);
    }
    expect(await rateLimit("login", { max: 8, windowSec: 900 })).toEqual({
      ok: false, retryAfterS: 900, verbleibend: 0,
    });
    vi.advanceTimersByTime(900_000);
    expect((await rateLimit("login", { max: 8, windowSec: 900 })).ok).toBe(true);
  });

  it("verwendet in Produktion auch ohne Konfiguration keinen lokalen Ersatz", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", undefined);
    await expect(rateLimit("login", { max: 8, windowSec: 900 })).rejects.toThrow("DB-Limiter aufgerufen");
  });

  it("verwendet eine konfigurierte Datenbank auch im Entwicklungsmodus", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DATABASE_URL", "postgres://localhost/test");
    await expect(rateLimit("login", { max: 8, windowSec: 900 })).rejects.toThrow("DB-Limiter aufgerufen");
  });
});
