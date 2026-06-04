const CACHE_NAME = 'autostyle-mobile-v3';
const RUNTIME_CACHE = 'autostyle-mobile-runtime-v3';
const APP_SHELL = [
  './', './mobile.html', './mobile-catalog.html', './mobile-product.html', './mobile-cart.html', './mobile-favorites.html', './mobile-profile.html', './mobile-about.html', './mobile-contacts.html', './mobile-installment.html', './mobile-certificates.html', './mobile-more.html',
  './css/mobile-market.css', './js/mobile-app.js', './js/data-cache.js', './js/firebase.js', './assets/logo.jpeg', './assets/icon-192.png', './assets/icon-512.png', './assets/placeholder.svg', './manifest.webmanifest'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).catch(() => null));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => ![CACHE_NAME, RUNTIME_CACHE].includes(k)).map(k => caches.delete(k)))));
  self.clients.claim();
});
async function cacheFirst(req){
  const cached = await caches.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res && res.ok) caches.open(RUNTIME_CACHE).then(cache => cache.put(req, res.clone())).catch(()=>{});
  return res;
}
async function staleWhileRevalidate(req){
  const cached = await caches.match(req);
  const fresh = fetch(req).then(res => {
    if (res && res.ok) caches.open(RUNTIME_CACHE).then(cache => cache.put(req, res.clone())).catch(()=>{});
    return res;
  }).catch(()=>cached);
  return cached || fresh;
}
async function networkFirst(req){
  try{
    const res = await fetch(req);
    if (res && res.ok) caches.open(RUNTIME_CACHE).then(cache => cache.put(req, res.clone())).catch(()=>{});
    return res;
  }catch(e){
    return (await caches.match(req)) || (await caches.match('./mobile.html'));
  }
}
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const dest = req.destination;
  if (dest === 'image' || /\.(png|jpe?g|webp|svg|gif|avif)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(req));
    return;
  }
  if (dest === 'style' || dest === 'script' || /\.(css|js|webmanifest)$/i.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }
  event.respondWith(networkFirst(req));
});
