/**
 * Garmin Hub Service Worker
 *  - App-Shell + statische Assets: cache-first
 *  - Navigationen (Dashboard etc.): network-first mit Cache-Fallback,
 *    damit die letzten Daten offline lesbar bleiben
 *  - Externe Karten-Tiles werden NICHT gecacht (Speicher)
 */
const VERSION = "ghq-v1";
const SHELL = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
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
            caches.open(VERSION).then((c) => c.put(req, kopie));
            return res;
          })
      )
    );
    return;
  }

  // Navigationen: network-first, Fallback letzter Stand
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const kopie = res.clone();
          caches.open(VERSION).then((c) => c.put(req, kopie));
          return res;
        })
        .catch(() =>
          caches.match(req).then((hit) => hit || caches.match("/"))
        )
    );
  }
});
