import "server-only";

/**
 * Server-seitiger Client für die Python-Garmin-Bridge (/api/bridge/*).
 * Authentifiziert sich mit dem Shared Secret INTERNAL_API_KEY.
 */

export class BridgeError extends Error {
  constructor(
    message: string,
    public code: string | null,
    public status: number
  ) {
    super(message);
  }
}

function bridgeBaseUrl(): string {
  if (process.env.BRIDGE_URL) return process.env.BRIDGE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export async function bridgeFetch<T = Record<string, unknown>>(
  pfad: string,
  init?: { method?: "GET" | "POST"; body?: unknown; timeoutMs?: number }
): Promise<T> {
  const key = process.env.INTERNAL_API_KEY;
  if (!key) throw new BridgeError("INTERNAL_API_KEY ist nicht gesetzt", null, 500);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init?.timeoutMs ?? 55_000);
  try {
    const res = await fetch(`${bridgeBaseUrl()}${pfad}`, {
      method: init?.method ?? "GET",
      headers: {
        "x-internal-key": key,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new BridgeError(
        (data.error as string) ?? `Bridge-Fehler ${res.status}`,
        (data.code as string) ?? null,
        res.status
      );
    }
    return data as T;
  } finally {
    clearTimeout(timeout);
  }
}
