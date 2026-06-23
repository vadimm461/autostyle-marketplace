// AutoStyle service worker: не держит старый сайт неделями.
const CACHE_NAME = 'autostyle-shell-v' + Date.now();
const RUNTIME_CACHE = 'autostyle-runtime-v' + Date.now();

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'CLEAR_AUTOSTYLE_CACHE') {
    event.waitUntil((async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    })());
  }
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isStaticPageOrAsset = /\.(html|js|css)$/i.test(url.pathname) || req.mode === 'navigate';

  if (isStaticPageOrAsset) {
    event.respondWith(fetch(req, { cache: 'no-store' }).catch(() => caches.match(req)));
    return;
  }

  event.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res && res.ok && !url.href.includes('firestore.googleapis.com')) {
        const cache = await caches.open(RUNTIME_CACHE);
        cache.put(req, res.clone()).catch(() => {});
      }
      return res;
    } catch (e) {
      return (await caches.match(req)) || Response.error();
    }
  })());
});
