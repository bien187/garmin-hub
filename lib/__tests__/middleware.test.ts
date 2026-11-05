import { beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

/**
 * Middleware: Demo öffentlich und nur lesend, alles andere unverändert
 * geschützt. Gefälschte Demo-Header haben keine Wirkung.
 */
let middleware: (req: NextRequest) => Promise<Response>;
beforeAll(async () => {
  process.env.SESSION_SECRET = "nur-fuer-tests";
  ({ middleware } = await import("@/middleware"));
});

const anfrage = (pfad: string, init: { method?: string; headers?: Record<string, string> } = {}) =>
  new NextRequest(new URL(pfad, "https://hub.example"), init);

describe("Middleware", () => {
  it("lässt die Demo ohne Session durch", async () => {
    for (const p of ["/demo", "/demo/activities", "/demo/activities/9200000001", "/demo/plan", "/demo/body", "/demo/schlaf/2026-11-05", "/demo/daten/kern.json"]) {
      const res = await middleware(anfrage(p));
      expect(res.headers.get("x-middleware-next"), p).toBe("1");
    }
  });

  it("schützt die reguläre App weiterhin", async () => {
    for (const p of ["/", "/plan", "/activities", "/settings", "/settings/garmin", "/body"]) {
      const res = await middleware(anfrage(p));
      expect(res.status, p).toBe(307);
      expect(res.headers.get("location"), p).toMatch(/\/login/);
    }
    for (const p of ["/api/activities", "/api/plan", "/api/sync", "/api/settings", "/api/schlaf/2026-11-05"]) {
      expect((await middleware(anfrage(p))).status, p).toBe(401);
    }
  });

  it("ignoriert gefälschte Demo-Header auf geschützten Pfaden", async () => {
    const falsch = { "x-demo": "1", "x-ghq-demo": "true", "X-Demo-Mode": "on" };
    expect((await middleware(anfrage("/", { headers: falsch }))).status).toBe(307);
    expect((await middleware(anfrage("/api/activities", { headers: falsch }))).status).toBe(401);
    expect((await middleware(anfrage("/api/activities", { method: "POST", headers: falsch }))).status).toBe(401);
  });

  it("entfernt Demo-Header aus weitergeleiteten Anfragen", async () => {
    const res = await middleware(anfrage("/demo", { headers: { "x-demo": "1", "x-ghq-demo": "1", "user-agent": "test" } }));
    const weitergegeben = (res.headers.get("x-middleware-override-headers") ?? "").split(",");
    expect(weitergegeben).toContain("user-agent");
    expect(weitergegeben.some((h) => /demo/i.test(h))).toBe(false);
    expect(res.headers.get("x-middleware-request-x-demo")).toBeNull();
  });

  it("erlaubt in der Demo nur GET und HEAD", async () => {
    for (const m of ["POST", "PUT", "PATCH", "DELETE"]) {
      const res = await middleware(anfrage("/demo/plan", { method: m }));
      expect(res.status, m).toBe(405);
    }
    expect((await middleware(anfrage("/demo", { method: "HEAD" }))).headers.get("x-middleware-next")).toBe("1");
  });
});
