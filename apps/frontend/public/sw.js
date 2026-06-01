// ezmails service worker — conservative by design.
// Cache-first ONLY for Vite's immutable hashed assets (/assets/*). Everything else
// (HTML navigations, /api, /webmail-api, auth) is network-only, so there's no stale
// app shell after a deploy and no risk of serving cached private mail/API data.
const CACHE = "ezmails-assets-v1";

self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Immutable hashed build assets → cache-first.
  if (url.pathname.startsWith("/assets/")) {
    e.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
  }
  // Everything else: let the network handle it (no caching).
});
