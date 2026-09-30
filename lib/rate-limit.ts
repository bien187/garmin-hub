import { sql } from "drizzle-orm";
import { getDb, tables } from "@/lib/db";

export interface RateLimitOptions {
  /** maximale Treffer pro Fenster */
  max: number;
  /** Fensterlänge in Sekunden */
  windowSec: number;
}

export interface RateLimitResult {
  ok: boolean;
  /** Sekunden bis zum nächsten erlaubten Versuch (nur wenn !ok) */
  retryAfterS: number;
  verbleibend: number;
}

const lokaleLimits = new Map<string, { count: number; startMs: number }>();

/**
 * Fixed-Window-Limiter, atomar über ein einziges UPSERT: Bei abgelaufenem
 * Fenster wird zurückgesetzt, sonst inkrementiert. Race-fest bei parallelen
 * Lambdas, da Zählung und Fensterlogik in der DB passieren.
 */
export async function rateLimit(
  key: string,
  { max, windowSec }: RateLimitOptions
): Promise<RateLimitResult> {
  // Lokaler Testserver ohne Datenbank: dieselben Limits im Arbeitsspeicher.
  // Produktion und konfigurierte Datenbanken verwenden immer den DB-Limiter.
  if (process.env.NODE_ENV === "development" && !process.env.DATABASE_URL) {
    const jetzt = Date.now();
    const vorhanden = lokaleLimits.get(key);
    const fenster = vorhanden && jetzt < vorhanden.startMs + windowSec * 1000
      ? vorhanden
      : { count: 0, startMs: jetzt };
    fenster.count += 1;
    lokaleLimits.set(key, fenster);
    const ok = fenster.count <= max;
    return {
      ok,
      retryAfterS: ok ? 0 : Math.max(0, Math.ceil((fenster.startMs + windowSec * 1000 - jetzt) / 1000)),
      verbleibend: Math.max(0, max - fenster.count),
    };
  }

  const db = getDb();
  const rows = await db
    .insert(tables.rateLimits)
    .values({ key, count: 1, windowStart: new Date() })
    .onConflictDoUpdate({
      target: tables.rateLimits.key,
      set: {
        count: sql`case when ${tables.rateLimits.windowStart} < now() - make_interval(secs => ${windowSec})
                        then 1 else ${tables.rateLimits.count} + 1 end`,
        windowStart: sql`case when ${tables.rateLimits.windowStart} < now() - make_interval(secs => ${windowSec})
                        then now() else ${tables.rateLimits.windowStart} end`,
      },
    })
    .returning({
      count: tables.rateLimits.count,
      windowStart: tables.rateLimits.windowStart,
    });

  const { count, windowStart } = rows[0];
  const ablaufMs = new Date(windowStart).getTime() + windowSec * 1000;
  const retryAfterS = Math.max(0, Math.ceil((ablaufMs - Date.now()) / 1000));

  if (count > max) {
    return { ok: false, retryAfterS, verbleibend: 0 };
  }
  return { ok: true, retryAfterS: 0, verbleibend: max - count };
}

/** 429-Antwort mit Retry-After-Header */
export function tooManyRequests(retryAfterS: number): Response {
  return new Response(
    JSON.stringify({ error: "Zu viele Anfragen. Bitte kurz warten." }),
    {
      status: 429,
      headers: {
        "content-type": "application/json",
        "retry-after": String(retryAfterS),
      },
    }
  );
}
