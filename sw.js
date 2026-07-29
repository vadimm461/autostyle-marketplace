// AutoStyle service worker: быстрый стабильный кеш изображений и статики.
const SHELL_CACHE = 'autostyle-shell-20260729-v12';
const RUNTIME_CACHE = 'autostyle-runtime-20260729-v12';
const IMAGE_CACHE = 'autostyle-images-20260729-v12';
const CACHE_PREFIX = 'autostyle-';
const IMAGE_CACHE_LIMIT = 400;

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith(CACHE_PREFIX) && ![SHELL_CACHE, RUNTIME_CACHE, IMAGE_CACHE].includes(key))
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

async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxItems) return;
  await Promise.all(keys.slice(0, keys.length - maxItems).map(key => cache.delete(key)));
}

function isImageRequest(request, url) {
  return request.destination === 'image' || /\.(?:png|jpe?g|webp|svg|gif|avif)(?:$|\?)/i.test(url.pathname + url.search);
}

function isFirebaseStorageImage(request, url) {
  return isImageRequest(request, url) && (
    url.hostname === 'firebasestorage.googleapis.com' ||
    url.hostname.endsWith('.appspot.com') ||
    /\/v0\/b\/[^/]+\/o\//.test(url.pathname)
  );
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  // Не вмешиваемся только в данные Firestore/Auth. Firebase Storage изображения кешируем ниже.
  const isFirestoreData = url.hostname === 'firestore.googleapis.com' ||
    url.hostname.endsWith('.firebaseio.com') ||
    url.hostname === 'identitytoolkit.googleapis.com' ||
    url.hostname === 'securetoken.googleapis.com';
  if (isFirestoreData) return;

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
        return (await caches.match(request, { ignoreSearch: true })) ||
          (await caches.match(new URL('index.html', self.registration.scope).href, { ignoreSearch: true })) ||
          Response.error();
      }
    })());
    return;
  }

  // Фото товаров и баннеры: сначала локальный кеш, сеть нужна только при первом открытии URL.
  if (isFirebaseStorageImage(request, url) || (sameOrigin && isImageRequest(request, url))) {
    event.respondWith((async () => {
      const cache = await caches.open(IMAGE_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;

      try {
        const response = await fetch(request);
        if (response.ok || response.type === 'opaque') {
          await cache.put(request, response.clone()).catch(() => {});
          trimCache(IMAGE_CACHE, IMAGE_CACHE_LIMIT).catch(() => {});
        }
        return response;
      } catch {
        return Response.error();
      }
    })());
    return;
  }

  const criticalMobileAsset = sameOrigin && (
    url.pathname.endsWith('/js/mobile-home-promo-row.js') ||
    url.pathname.endsWith('/css/mobile-home-promo-row.css') ||
    url.pathname.endsWith('/js/mobile-app.js')
  );

  if (criticalMobileAsset) {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      try {
        const response = await fetch(request, { cache: 'no-store' });
        if (response.ok) cache.put(request, response.clone()).catch(() => {});
        return response;
      } catch {
        return (await cache.match(request)) || Response.error();
      }
    })());
    return;
  }

  if (sameOrigin && /\.(?:js|css|woff2?)$/i.test(url.pathname)) {
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
