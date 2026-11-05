import type { DemoApi } from "./api";

/** Pfade, die die Demo selbst beantwortet: alles unter /api/ der eigenen Origin */
export function istDemoApiAufruf(url: URL, origin: string): boolean {
  return url.origin === origin && (url.pathname === "/api" || url.pathname.startsWith("/api/"));
}

/**
 * Ersetzt window.fetch: /api-Aufrufe der eigenen Origin beantwortet die
 * (nur lesende) Demo-API im Browser. Sie verlassen den Tab nie und erreichen
 * damit keinen geschützten Endpunkt. Alles andere (Kartenkacheln,
 * BRouter, Demo-Dateien) geht unverändert ans Netz. Liefert eine Funktion,
 * die das ursprüngliche fetch wiederherstellt.
 */
export function installiereDemoFetch(api: DemoApi, echtesFetch: typeof fetch): () => void {
  const vorher = window.fetch;
  const demoFetch: typeof fetch = async (input, init) => {
    const roh = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(roh, window.location.href);
    if (!istDemoApiAufruf(url, window.location.origin)) return echtesFetch(input, init);
    const methode = init?.method ?? (input instanceof Request ? input.method : "GET");
    const antwort = await api.beantworte(methode, url);
    return new Response(JSON.stringify(antwort.daten), {
      status: antwort.status,
      headers: { "Content-Type": "application/json", "X-Garmin-Hub-Demo": "1" },
    });
  };
  window.fetch = demoFetch;
  return () => {
    if (window.fetch === demoFetch) window.fetch = vorher;
  };
}
