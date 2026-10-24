/* HCM Lite service worker — defensive only.
   - Never caches API responses (/api/* is always network).
   - Navigations are network-first, so a new deploy's index.html (with
     new hashed bundle names) is picked up, never a stale shell.
   - Same-origin static assets (.js/.css/.svg/.png) are cache-first;
     bundle filenames are content-hashed by Vite, so a cached asset
     cannot shadow a newer build.
   If registration fails, the app works exactly as before (no SW). */
const CACHE = 'hcm-lite-static-v1';
self.addEventListener('install', (event) => { self.skipWaiting(); });
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
      try { return await fetch(event.request); }
      catch { const c = await caches.open(CACHE); return (await c.match('/index.html')) || Response.error(); }
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
