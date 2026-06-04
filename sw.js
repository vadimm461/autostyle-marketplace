const CACHE_NAME = 'autostyle-mobile-v2';
const APP_SHELL = [
  './', './mobile.html', './mobile-catalog.html', './mobile-product.html', './mobile-cart.html', './mobile-favorites.html', './mobile-profile.html', './mobile-about.html', './mobile-contacts.html', './mobile-installment.html', './mobile-certificates.html', './mobile-more.html',
  './css/mobile-market.css', './js/mobile-app.js', './js/data-cache.js', './js/firebase.js', './assets/logo.jpeg', './assets/icon-192.png', './assets/icon-512.png', './assets/placeholder.svg', './manifest.webmanifest'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).catch(() => null));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  event.respondWith(caches.match(req).then(cached => cached || fetch(req).then(res => {
    const copy = res.clone();
    caches.open(CACHE_NAME).then(cache => cache.put(req, copy)).catch(() => null);
    return res;
  }).catch(() => caches.match('./mobile.html'))));
});
