const VERSION = 'autostyle-v1-20260729-nav-clean';
const STATIC_CACHE = `${VERSION}-static`;
const IMAGE_CACHE = `${VERSION}-images`;
const PAGE_CACHE = `${VERSION}-pages`;
const IMAGE_LIMIT = 350;

const APP_SHELL = [
  './',
  './index.html',
  './mobile.html',
  './manifest.webmanifest',
  './assets/as-logo-192.png',
  './assets/icon-192.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(APP_SHELL))
      .catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys
        .filter(key => key.startsWith('autostyle-') && ![STATIC_CACHE, IMAGE_CACHE, PAGE_CACHE].includes(key))
        .map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

function isImageRequest(request) {
  if (request.destination === 'image') return true;
  try {
    const url = new URL(request.url);
    return /\.(?:png|jpe?g|webp|gif|svg|avif)(?:$|\?)/i.test(url.pathname + url.search) ||
      url.hostname.includes('firebasestorage.googleapis.com') ||
      url.hostname.includes('storage.googleapis.com');
  } catch (_) {
    return false;
  }
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  await Promise.all(keys.slice(0, keys.length - maxEntries).map(key => cache.delete(key)));
}

async function cacheFirst(request) {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response && (response.ok || response.type === 'opaque')) {
    cache.put(request, response.clone()).then(() => trimCache(IMAGE_CACHE, IMAGE_LIMIT));
  }
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request).then(response => {
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached || network || Response.error();
}

async function networkFirstPage(request) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (_) {
    return (await cache.match(request)) || (await caches.match('./mobile.html')) || (await caches.match('./index.html'));
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  if (isImageRequest(request)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(request));
    return;
  }

  if (['style', 'script', 'font'].includes(request.destination)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'CLEAR_IMAGE_CACHE') {
    event.waitUntil(caches.delete(IMAGE_CACHE));
  }
});