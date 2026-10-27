/* HCM Lite service worker — defensive only.
   - Never caches API responses (/api/* is always network).
   - Navigations are network-first, so a new deploy's index.html (with
     new hashed bundle names) is picked up, never a stale shell.
   - Same-origin static assets (.js/.css/.svg/.png) are cache-first;
     bundle filenames are content-hashed by Vite, so a cached asset
     cannot shadow a newer build.
   If registration fails, the app works exactly as before (no SW). */
const CACHE = 'hcm-lite-static-v1';
self.addEventListener('install', (event) => {
  // Pre-cache the app shell, otherwise the navigation fallback below
  // can never hit: nothing else ever stored /index.html in this cache,
  // so an offline navigation fell through to Response.error() and
  // Chrome logged a FetchEvent network-error warning (2026-10-27).
  event.waitUntil((async () => {
    try {
      const c = await caches.open(CACHE);
      await c.add('/index.html');
    } catch { /* offline on first install: app still works online */ }
  })());
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  if (url.pathname.startsWith('/api')) return; // never cache API
  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(event.request);
        // Keep the shell fresh for the next offline fallback.
        if (res.ok) {
          const c = await caches.open(CACHE);
          await c.put('/index.html', res.clone());
        }
        return res;
      } catch { const c = await caches.open(CACHE); return (await c.match('/index.html')) || Response.error(); }
    })());
    return;
  }
  if (url.origin === self.location.origin && /\.(js|css|svg|png|webmanifest)$/.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(event.request);
      if (hit) return hit;
      const res = await fetch(event.request);
      if (res.ok) cache.put(event.request, res.clone());
      return res;
    })());
  }
});
