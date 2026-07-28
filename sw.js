// AutoStyle service worker: быстрый стабильный кеш с обновлением в фоне.
const SHELL_CACHE = 'autostyle-shell-20260728-v6';
const RUNTIME_CACHE = 'autostyle-runtime-20260728-v6';
const CACHE_PREFIX = 'autostyle-';

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith(CACHE_PREFIX) && key !== SHELL_CACHE && key !== RUNTIME_CACHE)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'CLEAR_AUTOSTYLE_CACHE') {
    event.waitUntil((async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX)).map(key => caches.delete(key)));
    })());
  }
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  const isFirebase = /firestore\.googleapis\.com|firebaseio\.com|googleapis\.com/.test(url.hostname);
  if (isFirebase) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(SHELL_CACHE);
          cache.put(request, response.clone()).catch(() => {});
        }
        return response;
      } catch {
        return (await caches.match(request, {ignoreSearch:true})) ||
          (await caches.match(new URL('index.html', self.registration.scope).href, {ignoreSearch:true})) ||
          Response.error();
      }
    })());
    return;
  }

  if (sameOrigin && /\.(?:js|css|png|jpe?g|webp|svg|gif|woff2?)$/i.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const cached = await cache.match(request);
      const update = fetch(request).then(response => {
        if (response.ok) cache.put(request, response.clone()).catch(() => {});
        return response;
      }).catch(() => null);
      if (cached) {
        event.waitUntil(update);
        return cached;
      }
      return (await update) || Response.error();
    })());
  }
});
