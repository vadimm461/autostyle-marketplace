// AutoStyle unified service worker.
// HTML navigations are network-first; the page cache is only a fast offline/slow-network fallback.
// Static JS/CSS stay cached with background refresh, and images use a cache-first strategy.
const VERSION = 'autostyle-20260804-cache-v47-product-refresh';
const CACHE_PREFIX = 'autostyle-';
const STATIC_CACHE = VERSION + '-static';
const PAGE_CACHE = VERSION + '-pages';
const IMAGE_CACHE = VERSION + '-images';
const META_CACHE = VERSION + '-meta';

const PAGE_MAX_AGE = 3 * 24 * 60 * 60 * 1000;
const IMAGE_CACHE_LIMIT = 400;
const PAGE_CACHE_LIMIT = 80;
const NETWORK_FIRST_TIMEOUT = 1600;

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

function isNotificationPage(url) {
  const name = url.pathname.split('/').pop().toLowerCase();
  return name === 'notifications.html' || name === 'mobile-notifications.html';
}

function isNotificationAsset(url) {
  if (url.origin !== self.location.origin) return false;
  return /\/js\/(?:notifications|notify-service|notification-route|notification-hard-fix)\.js$/i.test(url.pathname) ||
    /\/css\/(?:notifications|final-request-clean-fix)\.css$/i.test(url.pathname);
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

async function staleWhileRevalidateStatic(request, event) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  const refresh = fetch(request, { cache: 'no-store' }).then(async response => {
    if (response && (response.ok || response.type === 'opaque')) {
      await cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  });
  if (cached) {
    // Keep the first paint fast, then refresh the asset for the next visit.
    event?.waitUntil(refresh.catch(() => {}));
    return cached;
  }
  try { return await refresh; } catch (_) { return Response.error(); }
}

async function fetchPageFromNetwork(request, event) {
  const response = await fetch(request, { cache: 'no-store' });
  if (!response || !response.ok) {
    throw new Error('network page request failed');
  }
  const write = putPage(request, response.clone());
  if (event && typeof event.waitUntil === 'function') {
    event.waitUntil(write.catch(() => {}));
  }
  return response;
}

async function offlinePageFallback(request) {
  const url = new URL(request.url);
  const fallbackName = url.pathname.toLowerCase().includes('mobile-')
    ? 'mobile.html'
    : 'index.html';
  return (await caches.match(new URL(fallbackName, self.registration.scope).href)) ||
    Response.error();
}

async function cachePageOrNetwork(request, event) {
  const cached = await getCachedPage(request);
  const network = fetchPageFromNetwork(request, event);

  // No cached copy exists: a new visitor waits for the current HTML.
  if (!cached) {
    try {
      return await network;
    } catch (_) {
      return offlinePageFallback(request);
    }
  }

  let timer = 0;
  const result = await Promise.race([
    network.then(response => ({ response }), error => ({ error })),
    new Promise(resolve => {
      timer = setTimeout(() => resolve({ timedOut: true }), NETWORK_FIRST_TIMEOUT);
    })
  ]);
  clearTimeout(timer);

  // Fresh HTML wins whenever the network answers promptly. If it is slow,
  // show the last good page after 1.6 s while the request continues updating
  // the cache for the next navigation.
  if (result.response) return result.response;
  if (result.timedOut && event && typeof event.waitUntil === 'function') {
    event.waitUntil(network.catch(() => {}));
  }
  return cached;
}

async function networkFirstStaticWithTimeout(request, event) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  const refresh = fetch(request, { cache: 'no-store' }).then(async response => {
    if (!response || (!response.ok && response.type !== 'opaque')) {
      throw new Error('network static asset request failed');
    }
    const write = cache.put(request, response.clone());
    if (event && typeof event.waitUntil === 'function') {
      event.waitUntil(write.catch(() => {}));
    }
    return response;
  });

  if (!cached) {
    try {
      return await refresh;
    } catch (_) {
      return Response.error();
    }
  }

  let timer = 0;
  const result = await Promise.race([
    refresh.then(response => ({ response }), error => ({ error })),
    new Promise(resolve => {
      timer = setTimeout(() => resolve({ timedOut: true }), NETWORK_FIRST_TIMEOUT);
    })
  ]);
  clearTimeout(timer);

  if (result.response) return result.response;
  if (result.timedOut && event && typeof event.waitUntil === 'function') {
    event.waitUntil(refresh.catch(() => {}));
  }
  return cached;
}

async function networkFirstNotification(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response && response.ok) await cache.put(request, response.clone()).catch(() => {});
    return response;
  } catch (_) {
    return (await cache.match(request)) || Response.error();
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
      isNotificationPage(url)
        ? networkFirstNotification(request, PAGE_CACHE)
        : isProductPage(url)
          ? networkOnlyProduct(request)
        : cachePageOrNetwork(request, event)
    );
    return;
  }

  if (isNotificationAsset(url)) {
    event.respondWith(networkFirstNotification(request, STATIC_CACHE));
    return;
  }

  // The page-cache script controls offline snapshots. Fetch this small runtime
  // file from the network first so a new visitor never restores an old DOM
  // snapshot just because the static cache still contains a previous copy.
  if (url.origin === self.location.origin &&
      /\/js\/mobile-page-cache\.js$/i.test(url.pathname)) {
    event.respondWith(networkFirstStaticWithTimeout(request, event));
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
    event.respondWith(staleWhileRevalidateStatic(request, event));
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

// v27 mobile home polish
