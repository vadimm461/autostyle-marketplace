import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';

import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { addDoc, setDoc, doc, collection, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

import { getStorage } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';

const firebaseConfig = {
  apiKey: 'AIzaSyBZ-AW6XoMR14KmBtlz2q06Z0jPGXnWMTw',
  authDomain: 'auto-style-4dbb7.firebaseapp.com',
  projectId: 'auto-style-4dbb7',

  /* ВАЖНО */
  storageBucket: 'auto-style-4dbb7.firebasestorage.app',

  messagingSenderId: '217023127803',
  appId: '1:217023127803:web:502ebd5d1981c8aeb0905e'
};

export const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

export const db = getFirestore(app);

export const storage = getStorage(app);


/* AutoStyle site analytics: visits, online users and key actions */
(function initAutoStyleAnalytics(){
  if (typeof window === 'undefined' || window.__autoStyleAnalyticsStarted) return;
  window.__autoStyleAnalyticsStarted = true;

  const VISITOR_KEY = 'autostyle_visitor_id';
  const SESSION_KEY = 'autostyle_session_id';
  const nowTs = () => Date.now();
  const safe = (value, fallback='') => value == null ? fallback : String(value).slice(0, 500);

  function getId(key, prefix){
    try {
      let id = localStorage.getItem(key);
      if (!id) {
        id = `${prefix}_${nowTs()}_${Math.random().toString(36).slice(2, 10)}`;
        localStorage.setItem(key, id);
      }
      return id;
    } catch(e) {
      return `${prefix}_${nowTs()}_${Math.random().toString(36).slice(2, 10)}`;
    }
  }

  const visitorId = getId(VISITOR_KEY, 'v');
  const sessionId = getId(SESSION_KEY, 's');
  let currentUser = null;
  try { onAuthStateChanged(auth, user => { currentUser = user || null; touchOnline(); }); } catch(e) {}

  function dayKey(date = new Date()){
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function pageMeta(extra = {}){
    const d = new Date();
    const ua = navigator.userAgent || '';
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || window.innerWidth <= 768;
    let refHost = '';
    try { refHost = document.referrer ? new URL(document.referrer).hostname : ''; } catch(e) {}
    return {
      visitorId,
      sessionId,
      uid: currentUser ? currentUser.uid : null,
      email: currentUser ? currentUser.email || null : null,
      path: location.pathname,
      page: location.pathname.split('/').pop() || 'index.html',
      hash: location.hash || '',
      title: document.title || '',
      url: location.href,
      referrer: document.referrer || '',
      referrerHost: refHost || 'direct',
      deviceType: isMobile ? 'mobile' : 'desktop',
      userAgent: ua.slice(0, 500),
      screen: `${window.innerWidth}x${window.innerHeight}`,
      day: dayKey(d),
      hour: d.getHours(),
      ts: nowTs(),
      createdAt: serverTimestamp(),
      ...extra
    };
  }

  async function writeEvent(type, data = {}){
    try {
      await addDoc(collection(db, 'autostyle_events'), pageMeta({
        type: safe(type),
        name: safe(data.name || type),
        value: data.value == null ? null : safe(data.value),
        productId: data.productId ? safe(data.productId) : null,
        productName: data.productName ? safe(data.productName) : null,
        meta: data.meta || {}
      }));
    } catch(e) { console.warn('analytics event skipped', e); }
  }

  async function touchOnline(){
    try {
      await setDoc(doc(db, 'autostyle_online_sessions', sessionId), pageMeta({ lastSeen: serverTimestamp(), lastSeenTs: nowTs() }), { merge: true });
    } catch(e) { console.warn('analytics online skipped', e); }
  }

  async function trackPageView(){
    try { await addDoc(collection(db, 'autostyle_page_views'), pageMeta()); } catch(e) { console.warn('analytics page view skipped', e); }
    touchOnline();
  }

  function getProductInfo(node){
    const card = node && node.closest ? node.closest('[data-id],[data-product-id],.product-card,.product,.catalog-card') : null;
    const fromUrl = new URLSearchParams(location.search).get('id') || new URLSearchParams(location.search).get('product') || '';
    const productId = (card && (card.dataset.id || card.dataset.productId)) || fromUrl || '';
    let productName = '';
    if (card) {
      const nameEl = card.querySelector('.product-title,.product-name,h3,h2,[data-product-name]');
      productName = nameEl ? nameEl.textContent.trim() : '';
    }
    return { productId, productName };
  }

  window.AutoStyleAnalytics = {
    track: writeEvent,
    pageView: trackPageView,
    online: touchOnline
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest && e.target.closest('button,a,[role="button"]');
    if (!el) return;
    const txt = (el.textContent || el.getAttribute('aria-label') || el.title || '').toLowerCase();
    const cls = (el.className || '').toString().toLowerCase();
    const id = (el.id || '').toLowerCase();
    const ds = el.dataset || {};
    if (txt.includes('корзин') || cls.includes('cart') || id.includes('cart') || ds.addToCart != null) {
      writeEvent('add_to_cart', getProductInfo(el));
    }
    if (txt.includes('избран') || cls.includes('favorite') || cls.includes('heart') || id.includes('favorite') || ds.favorite != null) {
      writeEvent('favorite_add', getProductInfo(el));
    }
  }, true);

  document.addEventListener('submit', (e) => {
    const form = e.target;
    if (!form) return;
    const inputs = Array.from(form.querySelectorAll('input[type="search"], input[name*="search"], input[placeholder*="Поиск"], input[placeholder*="поиск"]'));
    const q = inputs.map(i => i.value).find(Boolean);
    if (q) writeEvent('search', { value: q });
  }, true);

  let searchTimer = null;
  document.addEventListener('input', (e) => {
    const input = e.target;
    if (!input || !input.matches || !input.matches('input[type="search"], input[name*="search"], input[placeholder*="Поиск"], input[placeholder*="поиск"]')) return;
    clearTimeout(searchTimer);
    const q = input.value.trim();
    if (q.length < 2) return;
    searchTimer = setTimeout(() => writeEvent('search', { value: q }), 1800);
  }, true);

  window.addEventListener('beforeunload', () => {
    try {
      const started = Number(sessionStorage.getItem('autostyle_page_started_at') || nowTs());
      const seconds = Math.max(1, Math.round((nowTs() - started) / 1000));
      navigator.sendBeacon && navigator.sendBeacon('data:text/plain,', '');
      writeEvent('time_on_page', { value: seconds, meta: { seconds } });
    } catch(e) {}
  });

  try { sessionStorage.setItem('autostyle_page_started_at', String(nowTs())); } catch(e) {}
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', trackPageView, { once: true });
  else trackPageView();
  setInterval(touchOnline, 60000);

  if (/product\.html/i.test(location.pathname)) {
    setTimeout(() => writeEvent('product_view', getProductInfo(document.body)), 1200);
  }
})();

export const COLLECTIONS = {
  users: 'autostyle_users',
  products: 'autostyle_products',
  categories: 'autostyle_categories',
  banners: 'autostyle_banners',
  settings: 'autostyle_settings',
  pages: 'autostyle_pages',
  media: 'autostyle_media',
  homeBlocks: 'autostyle_home_blocks',
  promoCards: 'autostyle_promo_cards',
  orders: 'autostyle_orders',
  discountCards: 'autostyle_discount_cards',
  notifications: 'autostyle_notifications',
  notificationReads: 'autostyle_notification_reads',
  feedback: 'autostyle_feedback'
};
