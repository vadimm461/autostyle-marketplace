// AutoStyle unified service worker.
// Ordinary pages and static assets may stay cached for 3 days.
// Product pages and Firebase/Auth data always go to the network.
const VERSION = 'autostyle-20260730-cache-v14-notifications';
const CACHE_PREFIX = 'autostyle-';
const STATIC_CACHE = VERSION + '-static';
const PAGE_CACHE = VERSION + '-pages';
const IMAGE_CACHE = VERSION + '-images';
const META_CACHE = VERSION + '-meta';

const PAGE_MAX_AGE = 3 * 24 * 60 * 60 * 1000;
const IMAGE_CACHE_LIMIT = 400;
const PAGE_CACHE_LIMIT = 80;

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith(CACHE_PREFIX) &&
        ![STATIC_CACHE, PAGE_CACHE, IMAGE_CACHE, META_CACHE].includes(key))
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

function isImageRequest(request, url) {
  return request.destination === 'image' ||
    /\.(?:png|jpe?g|webp|svg|gif|avif)(?:$|\?)/i.test(url.pathname + url.search);
}

function isFirebaseStorageImage(request, url) {
  return isImageRequest(request, url) && (
    url.hostname === 'firebasestorage.googleapis.com' ||
    url.hostname.endsWith('.appspot.com') ||
    url.hostname === 'storage.googleapis.com' ||
    /\/v0\/b\/[^/]+\/o\//.test(url.pathname)
  );
}

function isFirebaseData(url) {
  return url.hostname === 'firestore.googleapis.com' ||
    url.hostname.endsWith('.firebaseio.com') ||
    url.hostname === 'identitytoolkit.googleapis.com' ||
    url.hostname === 'securetoken.googleapis.com' ||
    url.hostname === 'firebaseinstallations.googleapis.com';
}

function isProductPage(url) {
  const name = url.pathname.split('/').pop().toLowerCase();
  return name === 'product.html' || name === 'mobile-product.html';
}

function metaRequest(request) {
  const suffix = request.url.includes('?') ? '&' : '?';
  return new Request(request.url + suffix + '__autostyle_page_meta=1');
}

async function readPageTimestamp(request) {
  const cache = await caches.open(META_CACHE);
  const response = await cache.match(metaRequest(request));
  if (!response) return 0;
  try {
    return Number(await response.text()) || 0;
  } catch (_) {
    return 0;
  }
}

async function putPage(request, response) {
  if (!response || !response.ok) return;
  const pages = await caches.open(PAGE_CACHE);
  const meta = await caches.open(META_CACHE);
  await pages.put(request, response.clone());
  await meta.put(
    metaRequest(request),
    new Response(String(Date.now()), {
      headers: { 'content-type': 'text/plain; charset=utf-8' }
    })
  );
  trimCache(PAGE_CACHE, PAGE_CACHE_LIMIT).catch(() => {});
}

async function getCachedPage(request) {
  const pages = await caches.open(PAGE_CACHE);
  const cached = await pages.match(request);
  if (!cached) return null;
  const savedAt = await readPageTimestamp(request);
  if (savedAt && Date.now() - savedAt <= PAGE_MAX_AGE) return cached;
  return cached;
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  await Promise.all(keys.slice(0, keys.length - maxEntries).map(key => cache.delete(key)));
}

async function cacheFirstImage(request) {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && (response.ok || response.type === 'opaque')) {
      await cache.put(request, response.clone()).catch(() => {});
      trimCache(IMAGE_CACHE, IMAGE_CACHE_LIMIT).catch(() => {});
    }
    return response;
  } catch (_) {
    return Response.error();
  }
}

async function cacheFirstStatic(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && (response.ok || response.type === 'opaque')) {
      await cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (_) {
    return cached || Response.error();
  }
}

async function cachePageOrNetwork(request) {
  const cached = await getCachedPage(request);
  const savedAt = await readPageTimestamp(request);
  const isFresh = !!cached && !!savedAt && Date.now() - savedAt <= PAGE_MAX_AGE;

  if (isFresh) return cached;

  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response && response.ok) await putPage(request, response.clone());
    return response;
  } catch (_) {
    if (cached) return cached;

    const url = new URL(request.url);
    const fallbackName = url.pathname.toLowerCase().includes('mobile-')
      ? 'mobile.html'
      : 'index.html';
    return (await caches.match(new URL(fallbackName, self.registration.scope).href)) ||
      Response.error();
  }
}

async function networkOnlyProduct(request) {
  try {
    return await fetch(request, { cache: 'no-store' });
  } catch (_) {
    // Карточка товара намеренно не берётся из page cache.
    return Response.error();
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (isFirebaseData(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      isProductPage(url)
        ? networkOnlyProduct(request)
        : cachePageOrNetwork(request)
    );
    return;
  }

  if (isFirebaseStorageImage(request, url) ||
      (url.origin === self.location.origin && isImageRequest(request, url))) {
    event.respondWith(cacheFirstImage(request));
    return;
  }

  const isStaticAsset = url.origin === self.location.origin &&
    /(?:\.js|\.css|\.woff2?|\.webmanifest)$/i.test(url.pathname);
  if (isStaticAsset) {
    event.respondWith(cacheFirstStatic(request));
  }
});

self.addEventListener('message', event => {
  if (!event.data) return;

  if (event.data.type === 'CLEAR_IMAGE_CACHE') {
    event.waitUntil(caches.delete(IMAGE_CACHE));
  }

  if (event.data.type === 'CLEAR_AUTOSTYLE_CACHE') {
    event.waitUntil((async () => {
      const keys = await caches.keys();
      await Promise.all(keys
        .filter(key => key.startsWith(CACHE_PREFIX))
        .map(key => caches.delete(key)));
    })());
  }
});
