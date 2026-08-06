/**
 * Garmin Hub Service Worker (v4)
 *  - App-Shell + statische Assets: cache-first
 *  - Navigationen: network-first mit Cache-Fallback (offline lesbar)
 *  - Safari-sicher: kein skipWaiting (kein Controller-Wechsel mitten in
 *    der Session), Redirect-Antworten auf Navigationen werden als echte
 *    Redirects weitergereicht statt als "redirected response" (Safari
 *    bricht letztere mit "Load failed" ab)
 *  - Externe Karten-Tiles werden NICHT gecacht (Speicher)
 */
const VERSION = "ghq-v4";
const SHELL = ["/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  // API-Aufrufe nie aus dem Cache beantworten (Sync, Push, Auth)
  if (url.pathname.startsWith("/api/")) return;

  // Statische Next-Assets: cache-first (immutable Hashes)
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const kopie = res.clone();
            caches.open(VERSION).then((c) => c.put(req, kopie)).catch(() => {});
            return res;
          })
      )
    );
    return;
  }

  // Navigationen: network-first, Fallback letzter Stand
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res.redirected) {
            // Safari akzeptiert keine redirected Response auf eine
            // Navigation → als sauberen Redirect weiterreichen
            return Response.redirect(res.url, 302);
          }
          if (res.ok) {
            const kopie = res.clone();
            caches.open(VERSION).then((c) => c.put(req, kopie)).catch(() => {});
          }
          return res;
        } catch {
          const hit = await caches.match(req);
          if (hit) return hit;
          const shell = await caches.match("/");
          return shell ?? Response.error();
        }
      })()
    );
  }
});
