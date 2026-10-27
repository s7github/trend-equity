// Trend Equity service worker — offline app shell.
//
// Scope is deliberately narrow:
//  - GET requests to our own origin only; POSTs (every /api/generate/* call) pass
//    through untouched, so API behaviour can never be changed by a stale worker.
//  - No API response caching: those responses are per-user. A shared disk cache
//    would hand one visitor's feed to the next one on the same device.
//  - Navigations are network-first so a deployment is picked up on the next load;
//    the cached shell is the offline fallback, not a way to pin users to old code.
//  - Hashed build assets are content-addressed by Vite, so cache-first is safe.

const CACHE_NAME = 'te-shell-v2';
const SHELL_ASSETS = ['/', '/index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .catch(() => {}) // a failed shell pre-cache must not fail the install
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(CACHE_NAME);
          await cache.put('/index.html', fresh.clone());
          return fresh;
        } catch {
          const cached = await caches.match('/index.html');
          return cached || Response.error();
        }
      })()
    );
    return;
  }

  if (/\.(js|css|woff2?|png|jpe?g|webp|svg|ico)$/i.test(url.pathname)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const fresh = await fetch(request);
        if (fresh.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, fresh.clone());
        }
        return fresh;
      })()
    );
  }
});
