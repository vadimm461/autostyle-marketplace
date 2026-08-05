import { auth, db, storage, COLLECTIONS, waitForAuthReady } from './firebase.js';
import { trackEvent } from './site-analytics.js';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, updateProfile, updatePassword, sendEmailVerification, sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { doc, getDoc, setDoc, serverTimestamp, collection, addDoc, getDocs, query, where, orderBy, limit } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getProducts, getCategories, getCollectionCached } from './data-cache.js?v=20260804-product-cache-refresh';
import { ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';
import { addUserCartItem, waitUserCartReady, getCurrentUserCart, removeUserCartItem, setUserCartQty, cartQtyCount, loadUserCart, saveUserCart, clearUserCart } from './user-cart-store.js';
import { createPasswordChangedNotification, watchNotifications, markNotificationRead, markNotificationsRead, notificationText, sanitizeNotificationHtml, fmt } from './notify-service.js?v=20260730-notification-detail-v19';
import { getProfileVerification, profileVerificationMessage } from './auth-core.js';
import { getFavorites, subscribeFavorites, toggleFavorite, waitFavoritesReady } from './user-favorites-store.js?v=20260729-profile-favorites';
import { startApbCardPayment, submitApbPayment } from './apb-payment.js';

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
let products = [], allProducts = [], categories = [], homeBlocks = [], userNow = null;
let mobileProfilePhotoFile = null;
let dataPromise = null;
let productDataPromise = null;
const PAGE_SIZE = 24;
let cart = [];
let favs = getFavorites();
let mobileFavoritesBooted = false;
let lastFavoritesSignature = '';
const page = document.body.dataset.page;
const isNotificationDetailPage = () => page === 'notifications' && new URLSearchParams(location.search).has('id');
const waitAuthUser = async () => {
  try {
    // Auth restoration may wait forever when Safari has a stale Firebase
    // session or the auth endpoint is temporarily unavailable.  A mobile
    // page must still resolve to the current user/guest state instead of
    // leaving the cart and profile half-rendered.
    const restored = await waitWithTimeout(() => waitForAuthReady(), 2600, null);
    return auth.currentUser || restored || null;
  } catch (_) {
    return new Promise(resolve => {
      if (auth.currentUser) return resolve(auth.currentUser);
      let done = false;
      const finish = user => { if(done) return; done = true; resolve(user || null); };
      const off = onAuthStateChanged(auth, user => { off(); finish(user); });
      setTimeout(() => { try{ off(); }catch(e){} finish(auth.currentUser || null); }, 2600);
    });
  }
};

const HOME_BLOCKS_COLLECTION = COLLECTIONS.homeBlocks || 'autostyle_home_blocks';
const MAIN_BANNERS_COLLECTION = COLLECTIONS.banners || 'autostyle_banners';
const whenIdle = fn => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 1600 }) : setTimeout(fn, 60));
const waitWithTimeout = (task, ms, fallback) => {
  let timer = 0;
  const work = typeof task === 'function' ? Promise.resolve().then(task) : Promise.resolve(task);
  const timeout = new Promise(resolve => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([work.finally(() => clearTimeout(timer)), timeout]);
};
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[ch]));
const appUrl = url => {
  const raw = String(url || '').trim();
  if (!raw || raw === '#') return 'mobile-catalog.html';
  if (/^(tel:|mailto:|https?:\/\/|#)/i.test(raw)) return raw;
  return raw
    .replace(/^index\.html(.*)$/i, 'mobile.html$1')
    .replace(/^catalog\.html(.*)$/i, 'mobile-catalog.html$1')
    .replace(/^product\.html(.*)$/i, 'mobile-product.html$1')
    .replace(/^cart\.html(.*)$/i, 'mobile-cart.html$1')
    .replace(/^favorites\.html(.*)$/i, 'mobile-favorites.html$1')
    .replace(/^profile\.html(.*)$/i, 'mobile-profile.html$1')
    .replace(/^about\.html(.*)$/i, 'mobile-about.html$1')
    .replace(/^contacts\.html(.*)$/i, 'mobile-contacts.html$1')
    .replace(/^installment\.html(.*)$/i, 'mobile-installment.html$1')
    .replace(/^certificates\.html(.*)$/i, 'mobile-certificates.html$1')
    .replace(/^login\.html(.*)$/i, 'mobile-profile.html$1')
    .replace(/^register\.html(.*)$/i, 'mobile-profile.html$1')
    .replace(/^notifications\.html(.*)$/i, 'mobile-notifications.html$1')
    .replace(/^orders\.html(.*)$/i, 'mobile-orders.html$1')
    .replace(/^discount-card\.html(.*)$/i, 'mobile-discount-card.html$1');
};
const notificationActionUrl = url => {
  const raw = String(url || '').trim();
  if (!raw || raw === '#') return '';
  if (/^(?:https?:|mailto:|tel:|#)/i.test(raw)) return raw;
  if (/^profile\.html#(?:wheel|fortune-wheel)/i.test(raw)) return raw.replace(/^profile\.html/i, 'mobile-wheel.html');
  return raw
    .replace(/^index\.html(.*)$/i, 'mobile.html$1')
    .replace(/^catalog\.html(.*)$/i, 'mobile-catalog.html$1')
    .replace(/^product\.html(.*)$/i, 'mobile-product.html$1')
    .replace(/^cart\.html(.*)$/i, 'mobile-cart.html$1')
    .replace(/^favorites\.html(.*)$/i, 'mobile-favorites.html$1')
    .replace(/^profile\.html(.*)$/i, 'mobile-profile.html$1')
    .replace(/^notifications\.html(.*)$/i, 'mobile-notifications.html$1')
    .replace(/^orders\.html(.*)$/i, 'mobile-orders.html$1')
    .replace(/^discount-card\.html(.*)$/i, 'mobile-discount-card.html$1');
};
const MOBILE_CACHE_OPTIONS = { staleWhileRevalidate:true };
const safeLoadCollection = async (name, options=MOBILE_CACHE_OPTIONS) => { try { return await getCollectionCached(name, options); } catch(e) { console.warn('Не удалось загрузить', name, e); return []; } };
function loadProducts(options={}){
  const force = options.force === true;
  if (!force && productDataPromise) return productDataPromise;
  const promise = getProducts(options).then(rows => {
    const next = Array.isArray(rows) ? rows : [];
    // Не заменяем рабочий снимок пустым ответом во время переподключения
    // Firestore или кратковременной ошибки сети.
    if (next.length || !allProducts.length) {
      allProducts = next;
      products = next;
    }
    return products;
  }).catch(error => {
    console.warn('Не удалось загрузить товары', error);
    return products || [];
  });
  if (!force) productDataPromise = promise;
  return promise;
}
const safeLoadCollections = async (names, options=MOBILE_CACHE_OPTIONS) => {
  const groups = await Promise.all(names.map(async name => {
    const rows = await safeLoadCollection(name, options);
    return rows.map(row => ({ ...row, _collection:name }));
  }));
  const all = groups.flat();
  const seen = new Set();
  return all.filter(row => { const k = String(row.key || row.slug || row.id || `${row._collection}:${row.title || row.name || Math.random()}`).trim(); if (seen.has(k)) return false; seen.add(k); return true; });
};
function defaultHomeBlocks(){
  return [
    {id:'new', key:'new', title:'Новинки', order:1, builtin:true},
    {id:'recentlyViewed', key:'recentlyViewed', title:'Недавно просмотренные', order:2, builtin:true, recent:true},
    {id:'bestsellers', key:'bestsellers', title:'Лидеры продаж', order:3, builtin:true},
    {id:'hot', key:'hot', title:'Горячие предложения', order:4, builtin:true}
  ];
}
function mergeHomeBlocks(custom){
  const byKey = new Map();
  defaultHomeBlocks().forEach(b => byKey.set(b.key, b));
  (custom || []).forEach(b => {
    const key = b.key || b.slug || b.id;
    if (!key || norm(key) === 'discounts') return;
    const base = byKey.get(key) || {};
    byKey.set(key, { ...base, id:b.id || base.id, key, title:b.title || b.name || base.title || key, order:Number(b.order ?? base.order ?? 999), enabled:b.enabled !== false, builtin:base.builtin === true });
  });
  return [...byKey.values()].filter(b => b.enabled !== false).sort((a,b)=>Number(a.order??999)-Number(b.order??999));
}
function isMarkedForHome(p){ return p.showOnHome === true || p.showOnHome === 'true' || p.onHome === true || p.home === true; }
function productSection(p){ return String(p.homeSection || p.homeBlock || p.tag || '').toLowerCase(); }
function productsForHomeBlock(block){
  const key = norm(block.key);
  const blockProducts = products;
  if (block.recent || key === 'recentlyviewed') {
    let ids = [];
    try {
      const parsed = JSON.parse(localStorage.getItem('viewedProducts') || '[]');
      ids = Array.isArray(parsed) ? parsed : [];
    } catch (_) {}
    const byId = new Map(blockProducts.map(p => [String(p.id), p]));
    return ids.map(id => byId.get(String(id))).filter(Boolean).slice(0, 20);
  }
  let selected = blockProducts.filter(p => isMarkedForHome(p) && norm(productSection(p)) === key);
  if (selected.length) return selected;
  selected = blockProducts.filter(p => norm(productSection(p)) === key || norm(p.tag) === key);
  if (selected.length) return selected;
  if (key === 'bestsellers' || key === 'best' || key === 'leaders') return blockProducts.filter(p => ['best','bestsellers','leader','leaders'].includes(norm(p.tag))).slice(0,20);
  if (key === 'new') return blockProducts.filter(p => norm(p.tag) === 'new').slice(0,20);
  if (key === 'hot') return blockProducts.filter(isMarkedForHome).concat(blockProducts).filter((p,i,a)=>a.findIndex(x=>x.id===p.id)===i).slice(0,20);
  return blockProducts.filter(p => isMarkedForHome(p)).slice(0,20);
}
let mobileHeroTimer = 0;
function bannerImage(row = {}) {
  return String(row.image || row.imageUrl || row.imageURL || row.photo || row.photoUrl || row.photoURL || '').trim();
}

function renderMobileHero(rows = []) {
  const hero = document.getElementById('mHero');
  if (!hero) return;
  window.clearInterval(mobileHeroTimer);
  mobileHeroTimer = 0;

  const slides = (rows || [])
    .filter(row => row && row.enabled !== false)
    .map(row => ({ ...row, image: bannerImage(row) }))
    .filter(row => row.image)
    .sort((a, b) => Number(a.order ?? 999) - Number(b.order ?? 999));

  if (!slides.length) {
    hero.innerHTML = '';
    hero.hidden = true;
    return;
  }

  hero.hidden = false;
  hero.innerHTML = `<div class="m-hero-slider">${slides.map((banner, index) => {
    const href = escapeHtml(appUrl(banner.link || banner.linkURL || banner.url || 'mobile-catalog.html'));
    const image = escapeHtml(banner.image);
    const title = escapeHtml(banner.title || banner.name || 'AutoStyle');
    return `<a class="m-hero-image ${index === 0 ? 'active' : ''}" href="${href}" data-m-slide="${index}"><img loading="${index ? 'lazy' : 'eager'}" decoding="async" src="${image}" alt="${title}"></a>`;
  }).join('')}${slides.length > 1 ? `<div class="m-hero-dots">${slides.map((_, index) => `<span class="${index === 0 ? 'active' : ''}" data-m-dot="${index}" role="button" tabindex="0" aria-label="Баннер ${index + 1}"></span>`).join('')}</div>` : ''}</div>`;

  if (slides.length < 2) return;
  let activeIndex = 0;
  const slideNodes = [...hero.querySelectorAll('[data-m-slide]')];
  const dotNodes = [...hero.querySelectorAll('[data-m-dot]')];
  const showSlide = index => {
    activeIndex = index;
    slideNodes.forEach((node, nodeIndex) => node.classList.toggle('active', nodeIndex === activeIndex));
    dotNodes.forEach((node, nodeIndex) => node.classList.toggle('active', nodeIndex === activeIndex));
  };
  mobileHeroTimer = window.setInterval(() => showSlide((activeIndex + 1) % slideNodes.length), 5500);
  dotNodes.forEach((dot, index) => {
    dot.addEventListener('click', event => {
      event.preventDefault();
      showSlide(index);
    });
  });
}

async function loadMobileHomeMedia({ force = false } = {}) {
  const options = force ? { force: true } : MOBILE_CACHE_OPTIONS;
  const mainBanners = await safeLoadCollection(MAIN_BANNERS_COLLECTION, options);
  return {
    banners: (mainBanners || []).filter(row => row && row.enabled !== false),
    promos: []
  };
}

function renderMobileHomeMedia(media = {}) {
  renderMobileHero(media.banners || []);
}

function renderMobileSection(block, list){
  list = (list || []).slice(0, 12);
  const id = `mBlock_${String(block.key).replace(/[^a-zA-Z0-9_-]/g,'_')}`;
  return `<section id="${id}" class="m-section m-home-block" data-block="${block.key}"><div class="m-section-head"><h2>${block.title || block.name || 'Блок'}</h2><a class="m-see" href="mobile-catalog.html">Все</a></div><div class="m-carousel m-home-products">${list.length ? list.map(card).join('') : '<div class="m-empty">Товары для этого блока пока не выбраны.</div>'}</div></section>`;
}
function setupMobileChrome(){
  const top = document.querySelector('.m-top');
  const nav = document.querySelector('.m-bottom-nav');
  if (top) top.classList.remove('m-top-hidden', 'm-top-compact');
  if (nav) nav.classList.remove('m-nav-scrolled');
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js', { scope:'./', updateViaCache:'none' })
      .then(reg => reg.update().catch(()=>{}))
      .catch(()=>{});
  }
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href') || '';
    if (/^(https?:\/\/)/i.test(href) && !href.includes(location.host)) a.setAttribute('target', '_blank');
  });
}
const money = v => `${Number(v || 0).toLocaleString('ru-RU')} ₽`;
const title = p => p.title || p.name || 'Без названия';

const img = p => {
  const raw = p.image || p.imageUrl || p.photo || p.photoUrl || '';
  const v = String(raw || '').trim();
  // В 1С иногда в поле фото попадает текст вроде "Фото7908..." — это не картинка.
  // Такой мусор и давал второй текст/дубль возле товара в живом поиске.
  if (!v || /^фото\S*/i.test(v) || /\s{2,}|[а-яё]{3,}/i.test(v)) return '';
  if (/^(https?:|data:image\/|\.\/|\/|assets\/|images\/|img\/|uploads\/)/i.test(v)) return v;
  if (/\.(png|jpe?g|webp|gif|svg)(\?|#|$)/i.test(v)) return v;
  return '';
};
const group = p => p.group || p.category || p.categoryName || 'Без группы';
const stock = p => Number(p.stock ?? p.quantity ?? p.count ?? p.qty ?? 0);
function prioritizeInStock(rows){
  const available=[],unavailable=[];
  (Array.isArray(rows)?rows:[]).forEach(item=>{
    (stock(item)>0?available:unavailable).push(item);
  });
  return available.concat(unavailable);
}
const relatedProductId = p => String(p?.id ?? p?.productId ?? p?.docId ?? p?.sku ?? p?.code ?? '').trim();
const relatedParent = p => {
  const explicit = p?.parentCategory || p?.parentGroup || p?.categoryParent || p?.parent || p?.parentId || '';
  if (explicit) return explicit;
  const fallback = norm(group(p));
  return fallback && fallback !== 'без группы' ? fallback.split(' ')[0] : '';
};
const relatedBrand = p => p?.brand || p?.brandName || p?.manufacturer || p?.vendor || '';
function mobileRelatedProducts(current, source){
  const currentId = relatedProductId(current);
  const currentGroup = norm(group(current));
  const currentParent = norm(relatedParent(current));
  const currentBrand = norm(relatedBrand(current));
  const sameGroup = currentGroup && currentGroup !== 'без группы';
  const sameParent = currentParent && currentParent !== 'без группы';
  return (Array.isArray(source) ? source : [])
    .filter(item => relatedProductId(item) && relatedProductId(item) !== currentId)
    .map(item => {
      const itemGroup = norm(group(item));
      const itemParent = norm(relatedParent(item));
      const itemBrand = norm(relatedBrand(item));
      let rank = 0;
      if (sameGroup && itemGroup === currentGroup) rank += 100;
      if (sameParent && itemParent === currentParent) rank += 60;
      if (currentBrand && itemBrand === currentBrand) rank += 25;
      return { item, rank };
    })
    .filter(({ rank }) => rank > 0)
    .sort((a, b) => b.rank - a.rank || title(a.item).localeCompare(title(b.item), 'ru'))
    .map(({ item }) => item)
    .slice(0, 12);
}
const price = p => Number(p.price || 0);
const rawOldPrice = p => Number(p.oldPrice || p.priceOld || p.priceBefore || p.compareAtPrice || 0);
const oldPrice = p => rawOldPrice(p) > price(p) ? rawOldPrice(p) : 0;
const discount = p => {
  const op = oldPrice(p), pr = price(p), manual = Number(p.discount || p.discountPercent || p.discount_percent || p.salePercent || 0);
  if (manual > 0) return manual;
  if (op > pr && pr > 0) return Math.round((op - pr) / op * 100);
  return 0;
};
const installment = p => price(p) >= 199 || p.installment === true || p.installmentAvailable === true;
const monthPay = p => Math.ceil(price(p) / 12);
function updateCounts(){ $$('#mFavCount').forEach(x=>x.textContent=favs.length); waitUserCartReady().then(rows=>{$$('#mCartCount').forEach(x=>x.textContent=cartQtyCount(rows));}).catch(()=>{$$('#mCartCount').forEach(x=>x.textContent='0');}); }
async function addCart(id, btn){ try{ await addUserCartItem(id, 1); if(btn){ const t=btn.textContent; btn.textContent='✓ Добавлено'; setTimeout(()=>btn.textContent=t,900); } updateCounts(); }catch(e){ alert(e?.message || profileVerificationMessage()); if(String(e?.message||'').includes('Подтвердите')) location.href='mobile-profile.html#security'; } }
function syncMobileFavoriteButtons(){
  document.querySelectorAll('[data-fav]').forEach(button => {
    const active = favs.includes(String(button.dataset.fav || ''));
    button.classList.toggle('active', active);
    if (button.classList.contains('m-action') && button.classList.contains('fav')) {
      button.textContent = `♡ ${active ? 'В избранном' : 'В избранное'}`;
    }
  });
}
async function toggleFav(id){
  try {
    await toggleFavorite(id);
  } catch (error) {
    alert(error?.message || 'Не удалось обновить избранное');
  }
}
subscribeFavorites(ids => {
  const signature = ids.join('\u0001');
  const changed = signature !== lastFavoritesSignature;
  lastFavoritesSignature = signature;
  favs = ids;
  updateCounts();
  syncMobileFavoriteButtons();
  if (changed && mobileFavoritesBooted && page === 'favorites') renderFavorites();
});
function card(p){
  const d=discount(p), op=oldPrice(p), im=img(p), t=escapeHtml(title(p)), g=escapeHtml(group(p)), unavailable=stock(p)<=0;
  return `<article class="m-card">
    <button class="m-fav ${favs.includes(String(p.id))?'active':''}" data-fav="${p.id}" type="button">♡</button>${d?`<span class="m-discount">-${d}%</span>`:''}
    <a class="m-card-img" href="${appUrl(`product.html?id=${encodeURIComponent(p.id)}`)}">${im?`<img loading="lazy" decoding="async" src="${im}" alt="${t}">`:'<span>Фото</span>'}</a>
    <a class="m-card-title" href="${appUrl(`product.html?id=${encodeURIComponent(p.id)}`)}">${t}</a>
    <div class="m-group">${g}</div>
    ${installment(p)?`<span class="m-installment">от ${money(monthPay(p))}/мес</span>`:''}
    <div class="m-price"><b>${money(price(p))}</b>${op?`<span class="m-old">${money(op)}</span>`:''}</div>
    <button class="m-cart${unavailable?' is-unavailable':''}" data-cart="${p.id}" type="button" ${unavailable?'disabled aria-disabled="true"':''}>В корзину</button>
  </article>`;
}
let currentMobileProduct = null;
async function renderMobileRelated(current, source=[]){
  const root = document.getElementById('mRelatedCarousel');
  if (!root || !current) return;
  let rows = Array.isArray(source) && source.length ? source : (allProducts.length ? allProducts : products);
  if (!rows.length) {
    try {
      rows = await getProducts(MOBILE_CACHE_OPTIONS);
      allProducts = rows || [];
      products = allProducts;
    } catch (error) {
      console.warn('Не удалось загрузить похожие товары', error);
      rows = [];
    }
  }
  const related = mobileRelatedProducts(current, rows);
  if (!root.isConnected) return;
  root.innerHTML = related.length ? related.map(card).join('') : '<div class="m-empty">Похожих товаров пока нет</div>';
  bind(root);
}
function bind(scope=document){
  scope.querySelectorAll('[data-cart]:not(:disabled)').forEach(b=>b.onclick=e=>{e.preventDefault(); addCart(b.dataset.cart,b);});
  scope.querySelectorAll('[data-fav]').forEach(b=>b.onclick=e=>{e.preventDefault(); e.stopPropagation(); toggleFav(b.dataset.fav);});
}
function clearLoader(){
  const l=$('#mLoader');
  if(l){
    l.classList.add('m-loader-leave');
    setTimeout(()=>l.remove(),180);
  }
  document.documentElement.classList.add('m-app-visible');
}
function installMobileBootWatchdog(){
  // Даже если Firebase или старый Service Worker завис, белого экрана быть не должно.
  setTimeout(()=>{
    const loader=$('#mLoader');
    if(loader){
      console.warn('Mobile boot watchdog: force opening interface');
      clearLoader();
    }
  },4200);

  // После возвращения из долгого простоя один раз мягко перезапускаем данные.
  const wake=()=>{
    if(document.hidden) return;
    if(isNotificationDetailPage()) return;
    if(page === 'cart') { updateCounts(); return; }
    if(window.__asMobileWakeTimer) clearTimeout(window.__asMobileWakeTimer);
    window.__asMobileWakeTimer=setTimeout(()=>{
      if(typeof window.autostyleMobileRefresh==='function'){
        window.autostyleMobileRefresh('wake-after-idle');
      }
    },250);
  };
  window.addEventListener('pageshow',wake,{passive:true});
  window.addEventListener('online',wake,{passive:true});
  document.addEventListener('visibilitychange',wake,{passive:true});
}
installMobileBootWatchdog();
function searchGo(){ const q=($('#mSearch')?.value||'').trim(); location.href = q ? `mobile-catalog.html?search=${encodeURIComponent(q)}` : 'mobile-catalog.html'; }
function setupAdvancedMobileSearch(){
  const input = document.getElementById('mSearch');
  const form = input?.closest('.m-search');
  if (!input || !form || form.dataset.advancedSearchReady === '1') return;
  form.dataset.advancedSearchReady = '1';
  input.setAttribute('autocomplete','off');
  input.setAttribute('enterkeyhint','search');

  // Полностью убираем старые кнопки и старые выпадающие списки, чтобы не было дублей.
  document.querySelectorAll('.m-search-live').forEach(el => el.remove());
  form.querySelectorAll('#mSearchBtn, button, .m-search-live').forEach(el => el.remove());

  const box = document.createElement('div');
  box.className = 'm-search-live';
  form.appendChild(box);

  const productUrl = p => appUrl(`product.html?id=${encodeURIComponent(p.id)}`);
  const catalogUrl = q => `mobile-catalog.html?search=${encodeURIComponent(q)}`;
  const close = () => {
    box.classList.remove('active');
    box.replaceChildren();
    document.body.classList.remove('m-search-open');
  };
  const go = () => {
    const q = input.value.trim();
    location.href = q ? catalogUrl(q) : 'mobile-catalog.html';
  };

  function makeResult(p){
    const a = document.createElement('a');
    a.className = 'm-search-result';
    a.href = productUrl(p);

    const photo = document.createElement('div');
    photo.className = 'm-search-thumb';
    const src = img(p);
    if (src) {
      const image = document.createElement('img');
      image.src = src;
      image.alt = ''; // важно: если фото не загрузилось, браузер не рисует второй текст товара
      image.loading = 'lazy';
      image.decoding = 'async';
      image.onerror = () => { image.remove(); photo.textContent = 'Фото'; };
      photo.appendChild(image);
    } else {
      photo.textContent = 'Фото';
    }

    const info = document.createElement('div');
    info.className = 'm-search-info';

    const name = document.createElement('b');
    name.textContent = title(p);

    const meta = document.createElement('small');
    meta.textContent = group(p) || '';

    info.append(name, meta);

    const cost = document.createElement('em');
    cost.textContent = money(price(p));

    a.append(photo, info, cost);
    return a;
  }

  function makeAll(q, empty=false){
    const a = document.createElement('a');
    a.className = 'm-search-all';
    a.href = catalogUrl(q);
    a.textContent = empty ? 'Открыть каталог' : 'Показать все';
    return a;
  }

  let timer = 0;
  let searchRenderToken = 0;
  const render = async () => {
    const renderToken = ++searchRenderToken;
    const q = input.value.trim();
    if (q.length < 2) { close(); return; }

    // Поиск использует только товары. Раньше он ждал общий initData(),
    // который дополнительно загружал категории и блоки главной.
    const productPromise = products.length ? Promise.resolve(products) : loadProducts(MOBILE_CACHE_OPTIONS);
    const loaded = products.length
      ? products
      : await Promise.race([
          productPromise,
          new Promise(resolve => setTimeout(() => resolve(null), 350))
        ]);
    if (renderToken !== searchRenderToken || input.value.trim() !== q) return;

    if (!Array.isArray(loaded) || !loaded.length) {
      box.replaceChildren();
      const status = document.createElement('div');
      status.className = 'm-search-loading';
      status.textContent = 'Ищем товары…';
      status.style.cssText = 'padding:18px 20px;color:#687386;text-align:center;font-weight:600';
      box.appendChild(status);
      document.querySelectorAll('.m-search-live').forEach(el => { if (el !== box) el.remove(); });
      box.classList.add('active');
      document.body.classList.add('m-search-open');
      // Если первый запрос был медленным, перерисуем подсказки только после
      // получения непустого снимка, не создавая цикл на пустом результате.
      productPromise.then(rows => {
        if (Array.isArray(rows) && rows.length && renderToken === searchRenderToken && input.value.trim() === q) render();
      }).catch(() => {});
      return;
    }

    const nq = norm(q);
    const result = loaded
      .filter(p => norm(`${title(p)} ${group(p)} ${p.brand || ''} ${p.code || p.article || ''}`).includes(nq))
      .slice(0, 20);

    box.replaceChildren();
    if (result.length) {
      result.forEach(p => box.appendChild(makeResult(p)));
      box.appendChild(makeAll(q));
    } else {
      box.appendChild(makeAll(q, true));
    }
    document.querySelectorAll('.m-search-live').forEach(el => { if (el !== box) el.remove(); });
    box.classList.add('active');
    document.body.classList.add('m-search-open');
    box.scrollTop = 0;
  };

  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(render, 100);
  });
  input.addEventListener('focus', render);
  input.addEventListener('keydown', e => {
    if(e.key === 'Enter') { e.preventDefault(); go(); }
    if(e.key === 'Escape') close();
  });
  form.addEventListener('submit', e => { e.preventDefault(); go(); });
  document.addEventListener('click', e => { if (!form.contains(e.target)) close(); });

  // Список можно скроллить пальцем, но при скролле самой страницы он сразу закрывается.
  ['touchstart','touchmove','wheel'].forEach(ev => {
    box.addEventListener(ev, e => e.stopPropagation(), { passive:true });
  });
  window.addEventListener('scroll', () => {
    if (box.classList.contains('active')) close();
  }, { passive:true });
  window.addEventListener('autostyle-cache-updated', event => {
    if (event.detail?.name !== COLLECTIONS.products || input.value.trim().length < 2) return;
    render();
  });
}


function setupShell(active='home'){
  setupAdvancedMobileSearch();
  const nav=$('.m-bottom-inner');
  if(nav) nav.innerHTML = `
    <a class="${active==='home'?'active':''}" href="mobile.html">⌂<span>Главная</span></a>
    <a class="${active==='catalog'?'active':''}" href="mobile-catalog.html">☰<span>Каталог</span></a>
    <a class="${active==='fav'?'active':''}" href="mobile-favorites.html">♡<span>Избранное <b id="mFavCount">0</b></span></a>
    <a class="${active==='cart'?'active':''}" href="mobile-cart.html">🛒<span>Корзина <b id="mCartCount">0</b></span></a>
    <a class="${active==='profile'?'active':''}" href="mobile-profile.html">👤<span>Профиль</span></a>`;
  nav.querySelectorAll('a[href]').forEach(a=>{
    a.addEventListener('click', e=>{
      const href = a.getAttribute('href') || '';
      const samePage = href.split('?')[0].split('#')[0] === location.pathname.split('/').pop();
      if (samePage) {
        e.preventDefault();
        refreshCurrentMobilePage('same-nav-tap');
      }
    }, { passive:false });
  });
  setupMobileNavVisibility();
updateCounts();
  // Показываем оболочку сразу: данные и Firebase продолжают загружаться без белого экрана.
  requestAnimationFrame(clearLoader);
}
function setupMobileNavVisibility(){
  const nav = document.querySelector('.m-bottom-nav');
  if(!nav || nav.dataset.visibilityReady === '1') return;
  nav.dataset.visibilityReady = '1';
  let lastY = Math.max(0, window.scrollY || 0);
  let raf = 0;
  const update = () => {
    raf = 0;
    const y = Math.max(0, window.scrollY || 0);
    if(y > lastY + 8 && y > 140) nav.classList.add('m-bottom-nav-hidden');
    else if(y < lastY - 8 || y < 80) nav.classList.remove('m-bottom-nav-hidden');
    lastY = y;
  };
  window.addEventListener('scroll', () => {
    if(!raf) raf = requestAnimationFrame(update);
  }, { passive:true });
  nav.addEventListener('pointerdown', () => nav.classList.remove('m-bottom-nav-hidden'), { passive:true });
}
function norm(s){return String(s||'').trim().toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/[\s_-]+/g,' ')}
function blockedName(n){ const x=norm(n); return x==='тмц'||x==='я мусорка'||x==='ямусорка'||x.includes('мусорка'); }
function catName(c){return c.title||c.name||'Без названия'}
function catId(c){return String(c.id||c.externalId||'')}
function parentKey(c){return String(c.parentId||c.parent||c.parentExternalId||'')}
function isService(c){return /^\s*\d+[.)-]?\s*/.test(catName(c))}
function sortCats(a,b){return Number(a.order??999)-Number(b.order??999)||catName(a).localeCompare(catName(b),'ru')}
function parentsList(){
  const cats=categories.filter(c=>catName(c).trim()&&!blockedName(catName(c))).sort(sortCats);
  const byId=new Map(); cats.forEach(c=>[catId(c),String(c.externalId||'')].filter(Boolean).forEach(id=>byId.set(id,c)));
  const childrenOf=p=>cats.filter(c=>[catId(p),String(p.externalId||'')].filter(Boolean).includes(parentKey(c)) && !blockedName(catName(c))).sort(sortCats);
  let parents=cats.filter(c=>{
    const p=byId.get(parentKey(c));
    if(!p) return !parentKey(c)||childrenOf(c).length>0;
    if(isService(p)) return true;
    return childrenOf(c).length>0;
  }).filter(c=>!isService(c));
  const seen=new Set(); return parents.filter(c=>{const k=catId(c)||norm(catName(c)); if(seen.has(k))return false; seen.add(k); return true;}).sort(sortCats);
}
function childrenOfParent(parent){
  const ids=[catId(parent),String(parent.externalId||'')].filter(Boolean);
  return categories.filter(c=>ids.includes(parentKey(c))&&!blockedName(catName(c))).sort(sortCats);
}
function allLabel(parent){return 'Все '+catName(parent).toLocaleLowerCase('ru-RU')}
function shortChild(child,parent){return catName(child).replace(new RegExp('^'+catName(parent).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s+','i'),'').trim()||catName(child)}

function findCategoryByName(name){
  const n = norm(name);
  return categories.find(c => norm(catName(c)) === n) || null;
}
function findParentForCategory(category){
  if(!category) return null;
  const pKey = parentKey(category);
  if(!pKey) return category;
  return parentsList().find(p => [catId(p), String(p.externalId||'')].filter(Boolean).includes(pKey)) || category;
}
function categoryChipsForSelection(selected){
  const pList = parentsList();
  if(!selected) return { title:'Разделы', chips:pList, parent:null };
  const selectedCat = findCategoryByName(selected);
  const parent = findParentForCategory(selectedCat) || pList.find(p => norm(catName(p)) === norm(selected)) || null;
  if(!parent) return { title:'Разделы', chips:pList, parent:null };
  const kids = childrenOfParent(parent).filter(c => norm(catName(c)) !== norm(catName(parent)));
  return { title:`Подразделы: ${catName(parent)}`, chips:kids.length ? kids : [parent], parent };
}

function productInCategory(p, selected){
  if(!selected) return true;
  const g=norm(group(p));
  const c=categories.find(x=>norm(catName(x))===norm(selected));
  if(!c) return g===norm(selected);
  const kids=childrenOfParent(c).map(k=>norm(catName(k)));
  const names=[norm(catName(c)),...kids];
  return names.includes(g);
}
async function initData(options={}){
  if (!dataPromise || options.force) {
    const dynamicOptions = options.force ? { force: true } : MOBILE_CACHE_OPTIONS;
    const productOptions = options.productPage ? { force: true } : dynamicOptions;
    const loadPromise = Promise.all([
      loadProducts(productOptions),
      getCategories(dynamicOptions),
      safeLoadCollection(HOME_BLOCKS_COLLECTION, dynamicOptions)
    ]).then(([p,c,h])=>{
      allProducts=p||[];
      products=allProducts;
      categories=c||[];
      homeBlocks=mergeHomeBlocks(h||[]);
      const result = { products, categories, homeBlocks };
      // The short timeout below keeps the shell responsive, but the real
      // Firestore request can finish later on a cold mobile connection.
      // Notify the active page so it does not stay permanently empty after
      // the timeout wins the race.
      window.dispatchEvent(new CustomEvent('autostyle-mobile-data-ready', { detail: result }));
      return result;
    });

    dataPromise = Promise.race([
      loadPromise,
      new Promise(resolve=>setTimeout(()=>resolve({
        products:products||[],
        categories:categories||[],
        homeBlocks:homeBlocks.length?homeBlocks:defaultHomeBlocks()
      }),4200))
    ]);
  }
  return dataPromise;
}

let mobileDataRerenderBusy = false;
window.addEventListener('autostyle-mobile-data-ready', () => {
  if (mobileDataRerenderBusy || document.visibilityState === 'hidden') return;
  if (!['home','catalog'].includes(page)) return;
  mobileDataRerenderBusy = true;
  Promise.resolve()
    .then(() => page === 'catalog' ? renderCatalog() : renderHome())
    .catch(error => console.warn('Не удалось обновить мобильные данные', error))
    .finally(() => { mobileDataRerenderBusy = false; });
});
async function renderHome() {
  setupShell('home');
  const cachedMediaPromise = loadMobileHomeMedia();
  const freshMediaPromise = loadMobileHomeMedia({ force: true });
  await initData();

  const mCats = $('#mCats');
  if (mCats) mCats.innerHTML = parentsList().map(category => `<a class="m-cat" href="mobile-catalog.html?category=${encodeURIComponent(catName(category))}">${catName(category)}</a>`).join('');

  const blocksHtml = homeBlocks
    .map(block => ({ block, list: productsForHomeBlock(block) }))
    .filter(item => !(item.block.recent && !item.list.length))
    .map(item => renderMobileSection(item.block, item.list))
    .join('');

  const homeDynamic = $('#mHomeDynamic');
  if (homeDynamic) homeDynamic.innerHTML = blocksHtml;
  bind();

  const quickMedia = await Promise.race([
    cachedMediaPromise,
    new Promise(resolve => window.setTimeout(() => resolve(null), 650))
  ]);
  if (quickMedia) renderMobileHomeMedia(quickMedia);
  clearLoader();

  let freshApplied = false;
  cachedMediaPromise
    .then(media => {
      if (!freshApplied) renderMobileHomeMedia(media);
    })
    .catch(error => console.warn('Не удалось загрузить кеш баннеров', error));
  freshMediaPromise
    .then(media => {
      freshApplied = true;
      renderMobileHomeMedia(media);
    })
    .catch(error => console.warn('Не удалось обновить баннеры', error));
}
async function renderCatalog(){
  setupShell('catalog'); await initData();
  const params=new URLSearchParams(location.search), q=params.get('search')||'', selected=params.get('category')||'';
  const discountFilter = params.get('discount') === '1' || params.get('discount') === 'true' || params.get('sale') === '1';
  const discountQuery = discountFilter ? '&discount=1' : '';
  const pList=parentsList();
  const selectedCat = findCategoryByName(selected);
  const selectedParent = findParentForCategory(selectedCat) || pList.find(p => norm(catName(p)) === norm(selected)) || null;
  $('#mCategory').innerHTML='<option value="">Все категории</option>'+pList.map(p=>`<option value="${catName(p)}" ${(selectedParent && norm(catName(selectedParent))===norm(catName(p)))?'selected':''}>${catName(p)}</option>`).join('');
  $('#mCategory').onchange=e=>{location.href=e.target.value?`mobile-catalog.html?category=${encodeURIComponent(e.target.value)}${discountQuery}`:`mobile-catalog.html${discountFilter?'?discount=1':''}`};
  const chipData = categoryChipsForSelection(selected);
  const chipsTitle = document.querySelector('[data-m-catalog-chips-title]') || document.querySelector('.m-section-head h2');
  if (chipsTitle) chipsTitle.textContent = chipData.title;
  const chips = chipData.chips || [];
  $('#mCatChips').innerHTML=chips.length
    ? chips.map(c=>`<a class="m-cat ${norm(selected)===norm(catName(c))?'active':''}" href="mobile-catalog.html?category=${encodeURIComponent(catName(c))}${discountQuery}">${selectedParent && catId(c)!==catId(selectedParent) ? shortChild(c, selectedParent) : catName(c)}</a>`).join('')
    : '<div class="m-empty m-data-empty">Разделы пока не загрузились. Потяните страницу вниз, чтобы повторить.</div>';
  $('#mFilterSearch').value=q;
  const discountToggle = $('#mDiscountOnly');
  if(discountToggle){
    discountToggle.checked = discountFilter;
    discountToggle.onchange = () => {
      const next = new URL(location.href);
      if(discountToggle.checked) next.searchParams.set('discount','1');
      else next.searchParams.delete('discount');
      location.href = next.href;
    };
  }
  $('#mFilterSearch').addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); location.href=`mobile-catalog.html?search=${encodeURIComponent(e.target.value.trim())}${discountQuery}`; }});
  let list=products.filter(p=>productInCategory(p,selected));
  if(q) list=list.filter(p=>(title(p)+' '+group(p)).toLowerCase().includes(q.toLowerCase()));
  if(discountFilter) list=list.filter(p=>discount(p)>0);
  list=prioritizeInStock(list);
  $('#mCatalogTitle').textContent = discountFilter ? 'Товары со скидкой' : (selected ? selected : (q ? `Поиск: ${escapeHtml(q)}` : 'Каталог товаров'));
  renderCatalogBatch(list, 0);
  clearLoader();
}
function renderCatalogBatch(list, start=0){
  const grid = $('#mCatalogGrid');
  if (!grid) return;
  if (!list.length) { grid.innerHTML = '<div class="m-empty">Товары не найдены</div>'; return; }
  if (start === 0) grid.innerHTML = '';
  const end = Math.min(start + PAGE_SIZE, list.length);
  grid.insertAdjacentHTML('beforeend', list.slice(start, end).map(card).join(''));
  bind(grid);
  const old = $('#mMoreProducts'); if (old) old.remove();
  if (end < list.length) {
    grid.insertAdjacentHTML('afterend', `<button id="mMoreProducts" class="m-primary" style="width:100%;margin:14px 0">Показать ещё ${Math.min(PAGE_SIZE, list.length-end)}</button>`);
    $('#mMoreProducts').onclick = () => renderCatalogBatch(list, end);
  }
}
async function renderProduct(){
  setupShell('catalog');
  const params = new URLSearchParams(location.search);
  const id = String(params.get('id') || params.get('productId') || params.get('product') || '').trim();
  if (!id) {
    $('#mProduct').innerHTML = '<div class="m-empty">Товар не найден</div>';
    clearLoader();
    return;
  }

  // Страница товара не должна ждать загрузку всего каталога из 2555+ позиций.
  // Берём конкретный документ напрямую по его Firestore ID.
  let p = null;
  try {
    const snap = await getDoc(doc(db, COLLECTIONS.products, id));
    if (snap.exists()) p = { id: snap.id, ...snap.data() };
  } catch (error) {
    console.warn('Не удалось загрузить товар напрямую', error);
  }

  // Резерв: используем уже имеющийся кэш/список, если прямой запрос временно недоступен.
  if (!p) {
    try {
      await initData();
      const source = allProducts.length ? allProducts : products;
      p = source.find(x => String(x.id) === id) || null;
    } catch (error) {
      console.warn('Не удалось найти товар в кэше каталога', error);
    }
  }

  if (!p) {
    $('#mProduct').innerHTML = '<div class="m-empty">Товар не найден</div>';
    clearLoader();
    return;
  }
  currentMobileProduct = p;
  const im=img(p), d=discount(p), op=oldPrice(p);
  let viewed=[];
  try {
    const parsed = JSON.parse(localStorage.getItem('viewedProducts') || '[]');
    viewed = Array.isArray(parsed) ? parsed : [];
  } catch (_) {}
  viewed = viewed.filter(x=>x!==p.id); viewed.unshift(p.id); localStorage.setItem('viewedProducts',JSON.stringify(viewed.slice(0,30)));
  $('#mProduct').innerHTML=`<a class="m-btn" href="mobile-catalog.html?category=${encodeURIComponent(group(p))}">← Вернуться в каталог</a>
    <div class="m-product-layout"><div class="m-photo-box"><div class="m-photo">${im?`<img loading="eager" decoding="async" src="${im}" alt="${escapeHtml(title(p))}">`:'<span>Фото</span>'}</div></div>
    <div class="m-info"><div class="m-breadcrumb"><a href="mobile.html">Главная</a> / <a href="mobile-catalog.html">Каталог</a> / <a href="mobile-catalog.html?category=${encodeURIComponent(group(p))}">${escapeHtml(group(p))}</a></div><h1>${escapeHtml(title(p))}</h1><a class="m-tag" href="mobile-catalog.html?category=${encodeURIComponent(group(p))}">${escapeHtml(group(p))}</a>${d?` <span class="m-tag" style="background:#ffecec;color:#e3342f">Скидка ${d}%</span>`:''}
    <div class="m-buybox"><div class="m-price-line"><div class="m-big-price">${money(price(p))}</div>${op?`<span class="m-old">${money(op)}</span>`:''}</div>${installment(p)?`<span class="m-installment">Рассрочка от ${money(monthPay(p))} в мес. на 12 мес.</span>`:''}
    <div class="m-buy-actions"><button class="m-action cart${stock(p)<=0?' is-unavailable':''}" data-cart="${p.id}" ${stock(p)<=0?'disabled aria-disabled="true"':''}>В корзину</button><button class="m-action fav ${favs.includes(String(p.id))?'active':''}" data-fav="${p.id}">♡ ${favs.includes(String(p.id))?'В избранном':'В избранное'}</button></div></div></div></div>
    <section class="m-desc m-collapsed" id="mProductDesc"><div class="m-desc-head"><h2>Описание</h2><button class="m-desc-toggle" id="mDescToggle" type="button">Показать</button></div><p>${escapeHtml(p.description || 'Описание товара пока не добавлено.')}</p></section>
    <section class="m-specs"><h2>Характеристики</h2><div class="m-spec-row"><span>Название</span><b>${escapeHtml(title(p))}</b></div><div class="m-spec-row"><span>Группа</span><b><a href="mobile-catalog.html?category=${encodeURIComponent(group(p))}">${escapeHtml(group(p))}</a></b></div><div class="m-spec-row"><span>Цена</span><b>${money(price(p))}</b></div></section>
    <section class="m-related"><div class="m-section-head"><h2>Похожие товары</h2><a class="m-see" href="mobile-catalog.html?category=${encodeURIComponent(group(p))}">Все</a></div><div class="m-carousel" id="mRelatedCarousel"><div class="m-empty">Подбираем товары…</div></div></section>`;
  bind($('#mProduct'));
  renderMobileRelated(p).catch(error => console.warn('Не удалось отрисовать похожие товары', error));
  const desc = $('#mProductDesc'), descBtn = $('#mDescToggle');
  if (desc && descBtn) descBtn.onclick = () => { const closed = desc.classList.toggle('m-collapsed'); descBtn.textContent = closed ? 'Показать' : 'Скрыть'; };
  clearLoader();
}
const MOBILE_PAYMENT_KEY = 'as_mobile_payment_method';
const MOBILE_CART_SELECTED_KEY = 'as_mobile_cart_selected_ids';
const LEGACY_MOBILE_DISCOUNT_KEY = 'as_mobile_discount_card_value';

let mobileCartRows = [];
let mobileCartUser = null;
let mobileCartSaveQueue = Promise.resolve();
let mobileCartReloadBusy = false;
let mobileDiscountCard = { active:false, percent:0 };
let mobileDiscountApplied = false;
let mobileInstallmentChoice = { bank:'Агропромбанк', months:12 };

function mobileCartItemId(item){
  return String(item?.id ?? item?.productId ?? item?.productID ?? item?.product_id ?? item?.uid ?? item?.docId ?? item?.documentId ?? item?.sku ?? item?.code ?? item?.article ?? '');
}

function mobileCartCode(product){
  return product?.code || product?.sku || product?.article || product?.id || '';
}

function mobileCartStock(product){
  const raw = product?.stock ?? product?.quantity ?? product?.qty ?? product?.balance ?? product?.availableQty ?? product?.available ?? null;
  if(raw === null || raw === undefined || raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : null;
}

function mobileCartProductMap(){
  const map = new Map();
  (allProducts.length ? allProducts : products).forEach(product => {
    [product.id, product.productId, product.uid, product.docId, product.sku, product.code, product.article, product.barcode]
      .filter(value => value !== undefined && value !== null && String(value).trim() !== '')
      .forEach(value => map.set(String(value), product));
  });
  return map;
}

function mobileCartProductFromItem(item, productMap){
  const id = mobileCartItemId(item);
  const product = productMap.get(id);
  if(product) return product;
  return {
    id,
    title:item?.title || item?.name || item?.productName || 'Товар',
    name:item?.name || item?.title || item?.productName || 'Товар',
    group:item?.group || item?.category || item?.categoryName || 'Без категории',
    code:item?.code || item?.sku || item?.article || id,
    image:item?.image || item?.imageUrl || item?.photo || item?.photoUrl || item?.img || '',
    imageUrl:item?.imageUrl || item?.image || item?.photoUrl || '',
    price:Number(item?.price || item?.salePrice || item?.cost || 0),
    stock:item?.stock ?? item?.quantityAvailable ?? item?.available ?? null
  };
}

function buildMobileCartRows(cartRows){
  const productMap = mobileCartProductMap();
  return (cartRows || []).map(item => {
    const product = mobileCartProductFromItem(item, productMap);
    return product?.id ? { item:{ ...item, id:mobileCartItemId(item), qty:Math.max(1, Number(item?.qty || 1) || 1) }, product } : null;
  }).filter(Boolean);
}

function mobileCartRowId(row){
  return mobileCartItemId(row?.item) || String(row?.product?.id || '');
}

function mobileCartRowInvalid(row){
  const available = mobileCartStock(row?.product);
  const qty = Math.max(1, Number(row?.item?.qty || 1) || 1);
  return available !== null && (available <= 0 || qty > available);
}

function readMobileCartSelected(){
  const raw = localStorage.getItem(MOBILE_CART_SELECTED_KEY);
  if(raw === null) return null;
  try {
    const parsed = JSON.parse(raw);
    return new Set((Array.isArray(parsed) ? parsed : []).map(String));
  } catch(_) {
    localStorage.removeItem(MOBILE_CART_SELECTED_KEY);
    return null;
  }
}

function writeMobileCartSelected(ids){
  localStorage.setItem(MOBILE_CART_SELECTED_KEY, JSON.stringify([...new Set([...ids].map(String))]));
}

function syncMobileSelection(rows){
  const ids = rows.map(mobileCartRowId).filter(Boolean);
  if(!ids.length){
    localStorage.removeItem(MOBILE_CART_SELECTED_KEY);
    return new Set();
  }
  let selected = readMobileCartSelected();
  if(selected === null) selected = new Set(ids);
  else selected = new Set([...selected].filter(id => ids.includes(id)));
  writeMobileCartSelected(selected);
  return selected;
}

function selectedMobileCartRows(rows){
  const selected = syncMobileSelection(rows);
  return rows.filter(row => selected.has(mobileCartRowId(row)));
}

function selectedMobilePayment(){
  const value = localStorage.getItem(MOBILE_PAYMENT_KEY) || 'cash';
  return ['cash','card','installment'].includes(value) ? value : 'cash';
}

function setSelectedMobilePayment(value){
  localStorage.setItem(MOBILE_PAYMENT_KEY, ['cash','card','installment'].includes(value) ? value : 'cash');
}

function mobilePaymentTitle(value){
  return { cash:'Наличными', card:'Банковской картой', installment:'Рассрочка' }[value] || 'Наличными';
}

function calcMobileDiscount(total){
  if(!mobileDiscountApplied || !mobileDiscountCard.active || selectedMobilePayment() === 'installment') return 0;
  const percent = Math.max(0, Math.min(100, Number(mobileDiscountCard.percent || 0)));
  return Math.min(Math.round(Number(total || 0) * percent / 100), Number(total || 0));
}

function mobileInstallmentPlans(){
  return [
    { bank:'Агропромбанк', className:'agro', logo:'assets/bank-agroprombank.jpg', rates:{3:.955, 6:.93, 9:.9, 12:.875} },
    { bank:'Эксимбанк', className:'exim', logo:'assets/bank-eximbank.jpg', rates:{3:.955, 6:.93, 9:.9, 12:.886} },
    { bank:'Сбербанк', className:'sber', logo:'assets/bank-sberbank.webp', rates:{3:.96, 6:.93, 9:.9, 12:.88} }
  ];
}

function selectedMobileInstallment(total){
  const plan = mobileInstallmentPlans().find(item => item.bank === mobileInstallmentChoice.bank) || mobileInstallmentPlans()[0];
  const months = Number(mobileInstallmentChoice.months || 12);
  const rate = Number(plan.rates[months] || plan.rates[12] || 1);
  const monthlyPayment = Math.ceil(Number(total || 0) * rate / months);
  return {
    bank:plan.bank,
    months,
    monthsTitle:`${months} мес.`,
    monthlyPayment,
    monthlyPaymentText:`${money(monthlyPayment)}/мес.`
  };
}

function renderMobileInstallments(total){
  const box = $('#mInstallmentBox');
  const root = $('#mInstallmentResults');
  const installmentPayment = selectedMobilePayment() === 'installment';
  if(box) box.hidden = !installmentPayment;
  if(!root || !installmentPayment) return;
  if(!total){
    root.innerHTML = '<div class="m-installment-empty">Выберите товары, чтобы рассчитать платёж.</div>';
    return;
  }
  root.innerHTML = mobileInstallmentPlans().map(plan => {
    const selectedBank = plan.bank === mobileInstallmentChoice.bank;
    const months = Object.entries(plan.rates).map(([month, rate]) => {
      const payment = Math.ceil(total * Number(rate) / Number(month));
      const selectedMonth = selectedBank && Number(month) === Number(mobileInstallmentChoice.months);
      return `<button class="m-installment-month ${selectedMonth ? 'selected' : ''}" type="button" data-mobile-bank="${escapeHtml(plan.bank)}" data-mobile-months="${month}">
        <em>${month} мес.</em><strong>${money(payment)}/мес.</strong>
      </button>`;
    }).join('');
    return `<div class="m-installment-bank ${plan.className} ${selectedBank ? 'selected' : ''}" data-mobile-bank-card="${escapeHtml(plan.bank)}">
      <button class="m-installment-head" type="button" data-mobile-bank-head="${escapeHtml(plan.bank)}">
        <img src="${plan.logo}" alt="${escapeHtml(plan.bank)}"><b>${escapeHtml(plan.bank)}</b><i>${selectedBank ? 'Выбрано' : 'Выбрать'}</i>
      </button>
      <div class="m-installment-months">${months}</div>
    </div>`;
  }).join('');
}

async function getActiveMobileDiscountCard(user){
  if(!user) return { active:false, percent:0 };
  const profile = (await getUserDoc(user.uid).catch(() => ({ data:{} }))).data || {};
  let active = Boolean(profile.discountCard?.active || profile.discountCardActive);
  let percent = Number(profile.discountCard?.discount ?? profile.discountCard?.discountPercent ?? profile.discount ?? profile.discountPercent ?? 0) || 0;
  try {
    const cardSnap = await getDoc(doc(db, COLLECTIONS.discountCards || 'autostyle_discount_cards', user.uid));
    if(cardSnap.exists()){
      const card = cardSnap.data() || {};
      active = active || card.active === true;
      percent = Number(card.discount ?? card.discountPercent ?? percent) || percent;
    }
  } catch(error) {
    console.warn('mobile discount card load error', error);
  }
  return { active, percent:Math.max(0, Math.min(100, Math.round(percent))) };
}

function mobileCartStockMarkup(row){
  const available = mobileCartStock(row.product);
  const qty = Math.max(1, Number(row.item.qty || 1) || 1);
  const bad = available !== null && (available <= 0 || qty > available);
  const stockText = available === null ? 'Остаток уточняется' : `В наличии: ${available}`;
  const warning = available !== null && available <= 0
    ? 'Товара сейчас нет в наличии.'
    : (available !== null && qty > available ? `Нельзя заказать ${qty}. На сайте доступно только ${available}.` : '');
  return {
    available,
    bad,
    stockText,
    warning,
    maxReached:available !== null && qty >= available
  };
}

function mobileCartRowMarkup(row){
  const id = mobileCartRowId(row);
  const qty = Math.max(1, Number(row.item.qty || 1) || 1);
  const selected = syncMobileSelection(mobileCartRows).has(id);
  const stockState = mobileCartStockMarkup(row);
  const product = row.product;
  const productTitle = title(product);
  const productImage = img(product);
  const code = mobileCartCode(product);
  return `<article class="m-cart-row ${selected ? 'm-cart-row-selected' : ''} ${stockState.bad ? 'm-cart-stock-error' : ''}" data-product-id="${escapeHtml(id)}">
    <label class="m-cart-pick" aria-label="Выбрать товар">
      <input class="mCartPick" type="checkbox" data-pick="${escapeHtml(id)}" ${selected ? 'checked' : ''} ${stockState.bad ? 'disabled' : ''}><span></span>
    </label>
    <a class="m-list-img" href="mobile-product.html?id=${encodeURIComponent(product.id)}">${productImage ? `<img loading="lazy" decoding="async" src="${productImage}" alt="${escapeHtml(productTitle)}">` : '<span>Фото</span>'}</a>
    <div class="m-cart-info">
      <a class="m-cart-title" href="mobile-product.html?id=${encodeURIComponent(product.id)}">${escapeHtml(productTitle)}</a>
      <div class="m-cart-meta">${escapeHtml(group(product))}${code ? ` · код: ${escapeHtml(code)}` : ''}</div>
      <p class="m-cart-stock ${stockState.bad ? 'bad' : ''}" data-cart-stock>${stockState.stockText}</p>
      <p class="m-cart-warning" data-cart-warning ${stockState.warning ? '' : 'hidden'}>${escapeHtml(stockState.warning)}</p>
      <div class="m-cart-line">
        <strong class="m-cart-price" data-line-price>${money(price(product) * qty)}</strong>
        <div class="m-qty-stepper" aria-label="Количество товара">
          <button data-minus="${escapeHtml(id)}" type="button" ${qty <= 1 ? 'disabled' : ''}>−</button>
          <span data-qty>${qty}</span>
          <button data-plus="${escapeHtml(id)}" type="button" ${stockState.maxReached || stockState.available === 0 ? 'disabled' : ''}>+</button>
        </div>
      </div>
      <button class="m-danger" data-remove="${escapeHtml(id)}" type="button">Удалить</button>
    </div>
  </article>`;
}

function findMobileCartRowElement(id){
  return [...document.querySelectorAll('#mCartList .m-cart-row')].find(node => String(node.dataset.productId || '') === String(id)) || null;
}

function updateMobileCartRowElement(row){
  const article = findMobileCartRowElement(mobileCartRowId(row));
  if(!article) return;
  const qty = Math.max(1, Number(row.item.qty || 1) || 1);
  const stockState = mobileCartStockMarkup(row);
  article.classList.toggle('m-cart-stock-error', stockState.bad);
  const qtyNode = article.querySelector('[data-qty]');
  const priceNode = article.querySelector('[data-line-price]');
  const stockNode = article.querySelector('[data-cart-stock]');
  const warningNode = article.querySelector('[data-cart-warning]');
  const minus = article.querySelector('[data-minus]');
  const plus = article.querySelector('[data-plus]');
  const pick = article.querySelector('.mCartPick');
  if(qtyNode) qtyNode.textContent = String(qty);
  if(priceNode) priceNode.textContent = money(price(row.product) * qty);
  if(stockNode){
    stockNode.textContent = stockState.stockText;
    stockNode.classList.toggle('bad', stockState.bad);
  }
  if(warningNode){
    warningNode.textContent = stockState.warning;
    warningNode.hidden = !stockState.warning;
  }
  if(minus) minus.disabled = qty <= 1;
  if(plus) plus.disabled = stockState.maxReached || stockState.available === 0;
  if(pick) pick.disabled = stockState.bad;
}

function updateMobileCartSelectionUI(){
  const selected = syncMobileSelection(mobileCartRows);
  mobileCartRows.forEach(row => {
    const id = mobileCartRowId(row);
    const article = findMobileCartRowElement(id);
    const input = article?.querySelector('.mCartPick');
    const checked = selected.has(id);
    article?.classList.toggle('m-cart-row-selected', checked);
    if(input) input.checked = checked;
  });
  const selectAll = $('#mSelectAllCart');
  const allSelected = mobileCartRows.length > 0 && mobileCartRows.every(row => selected.has(mobileCartRowId(row)));
  if(selectAll){
    selectAll.checked = allSelected;
    selectAll.indeterminate = selected.size > 0 && !allSelected;
  }
  const label = $('#mSelectAllLabel');
  if(label) label.textContent = allSelected ? 'Снять все' : 'Выбрать все';
  const selectedCount = $('#mCartSelectedCount');
  if(selectedCount) selectedCount.textContent = `Выбрано: ${selected.size} из ${mobileCartRows.length}`;
  return selected;
}

function updateMobileCartSummary(){
  const selected = updateMobileCartSelectionUI();
  const selectedRows = mobileCartRows.filter(row => selected.has(mobileCartRowId(row)));
  const subtotal = selectedRows.reduce((sum, row) => sum + price(row.product) * (Number(row.item.qty || 1) || 1), 0);
  const totalQty = selectedRows.reduce((sum, row) => sum + (Number(row.item.qty || 1) || 1), 0);
  const discountSum = calcMobileDiscount(subtotal);
  const total = Math.max(0, subtotal - discountSum);
  const payment = selectedMobilePayment();
  const stockProblems = selectedRows.filter(mobileCartRowInvalid);

  const count = $('#mCartItemsCount');
  const totalBox = $('#mTotal');
  const note = $('#mCheckoutNote');
  const checkout = $('#mCheckoutBtn');
  const clear = $('#mClearCart');
  const discountButton = $('#mDiscountCardBtn');
  if(count) count.textContent = String(totalQty);
  if(totalBox){
    totalBox.innerHTML = discountSum
      ? `<span class="m-cart-total-old">${money(subtotal)}</span><strong>${money(total)}</strong><small>−${mobileDiscountCard.percent}%</small>`
      : `<strong>${money(total)}</strong>`;
  }
  if(note){
    note.textContent = `${mobilePaymentTitle(payment)} · выбрано ${selectedRows.length} товар${selectedRows.length === 1 ? '' : 'ов'}${stockProblems.length ? ` · недоступно: ${stockProblems.length}` : ''}${discountSum ? ` · скидка ${money(discountSum)}` : ''}${payment === 'installment' ? ' · скидочная карта не применяется' : ''}`;
  }
  if(checkout){
    checkout.disabled = !selectedRows.length || stockProblems.length > 0;
    checkout.title = stockProblems.length ? 'Исправьте количество товаров: оно превышает остаток на сайте.' : '';
  }
  if(clear) clear.disabled = !mobileCartRows.length;
  $$('#mCheckoutBox [data-pay]').forEach(button => button.classList.toggle('active', button.dataset.pay === payment));
  if(discountButton){
    const installmentPayment = payment === 'installment';
    discountButton.disabled = installmentPayment;
    discountButton.classList.toggle('applied', mobileDiscountApplied && !installmentPayment);
    if(installmentPayment) discountButton.textContent = 'Скидочная карта недоступна в рассрочку';
    else if(!mobileDiscountCard.active) discountButton.textContent = 'Получить скидочную карту';
    else if(mobileDiscountApplied) discountButton.textContent = mobileDiscountCard.percent > 0 ? `Скидка ${mobileDiscountCard.percent}% применена · убрать` : 'Скидочная карта применена · убрать';
    else discountButton.textContent = 'Применить скидочную карту';
  }
  $$('#mCartCount').forEach(node => {
    node.textContent = String(mobileCartRows.reduce((sum, row) => sum + (Number(row.item.qty || 1) || 1), 0));
  });
  renderMobileInstallments(total);
}

function renderMobileCartList(){
  const root = $('#mCartList');
  if(!root) return;
  if(!mobileCartRows.length){
    localStorage.removeItem(MOBILE_CART_SELECTED_KEY);
    root.innerHTML = '<div class="m-empty"><b>Корзина пустая</b><br>Добавьте товары из каталога.<br><br><a class="m-primary" href="mobile-catalog.html">Перейти в каталог</a></div>';
    updateMobileCartSummary();
    return;
  }
  const selected = syncMobileSelection(mobileCartRows);
  const allSelected = mobileCartRows.every(row => selected.has(mobileCartRowId(row)));
  root.innerHTML = `<div class="m-cart-selectbar">
      <label class="m-check"><input id="mSelectAllCart" type="checkbox" ${allSelected ? 'checked' : ''}><span></span><b id="mSelectAllLabel">${allSelected ? 'Снять все' : 'Выбрать все'}</b></label>
      <small id="mCartSelectedCount">Выбрано: ${selected.size} из ${mobileCartRows.length}</small>
    </div>
    <div class="m-cart-panel">${mobileCartRows.map(mobileCartRowMarkup).join('')}</div>`;
  updateMobileCartSummary();
}

async function reloadMobileCartAfterError(error){
  console.error('mobile cart update error', error);
  if(mobileCartReloadBusy) return;
  mobileCartReloadBusy = true;
  try {
    alert('Не удалось сохранить изменение корзины. Данные обновлены из профиля.');
    await loadUserCart(mobileCartUser);
    mobileCartRows = buildMobileCartRows(getCurrentUserCart());
    renderMobileCartList();
  } finally {
    mobileCartReloadBusy = false;
  }
}

function queueMobileCartMutation(task){
  mobileCartSaveQueue = mobileCartSaveQueue.then(task).catch(reloadMobileCartAfterError);
  return mobileCartSaveQueue;
}

function changeMobileCartQty(id, delta){
  const row = mobileCartRows.find(item => mobileCartRowId(item) === String(id));
  if(!row) return;
  const current = Math.max(1, Number(row.item.qty || 1) || 1);
  const available = mobileCartStock(row.product);
  if(delta > 0 && available !== null && current >= available){
    alert(`Больше добавить нельзя. В наличии только ${available}.`);
    return;
  }
  const next = Math.max(1, current + delta);
  if(next === current) return;
  row.item.qty = next;
  updateMobileCartRowElement(row);
  updateMobileCartSummary();
  queueMobileCartMutation(() => setUserCartQty(id, next));
}

function removeMobileCartRow(id){
  const index = mobileCartRows.findIndex(row => mobileCartRowId(row) === String(id));
  if(index < 0) return;
  mobileCartRows.splice(index, 1);
  const selected = readMobileCartSelected() || new Set();
  selected.delete(String(id));
  if(mobileCartRows.length) writeMobileCartSelected(selected);
  else localStorage.removeItem(MOBILE_CART_SELECTED_KEY);
  renderMobileCartList();
  queueMobileCartMutation(() => removeUserCartItem(id));
}

function bindMobileCartControls(){
  const root = $('#mCartList');
  if(root && root.dataset.cartControlsReady !== '1'){
    root.dataset.cartControlsReady = '1';
    root.addEventListener('change', event => {
      const input = event.target;
      if(input.id === 'mSelectAllCart'){
        writeMobileCartSelected(new Set(input.checked ? mobileCartRows.map(mobileCartRowId) : []));
        updateMobileCartSummary();
        return;
      }
      if(input.classList?.contains('mCartPick')){
        const selected = readMobileCartSelected() || new Set();
        const id = String(input.dataset.pick || '');
        if(input.checked) selected.add(id);
        else selected.delete(id);
        writeMobileCartSelected(selected);
        updateMobileCartSummary();
      }
    });
    root.addEventListener('click', event => {
      const button = event.target.closest('button');
      if(!button) return;
      if(button.dataset.plus) changeMobileCartQty(button.dataset.plus, 1);
      else if(button.dataset.minus) changeMobileCartQty(button.dataset.minus, -1);
      else if(button.dataset.remove) removeMobileCartRow(button.dataset.remove);
    });
  }

  const checkoutBox = $('#mCheckoutBox');
  if(checkoutBox && checkoutBox.dataset.cartControlsReady !== '1'){
    checkoutBox.dataset.cartControlsReady = '1';
    checkoutBox.addEventListener('click', async event => {
      const paymentButton = event.target.closest('[data-pay]');
      if(paymentButton){
        setSelectedMobilePayment(paymentButton.dataset.pay);
        if(paymentButton.dataset.pay === 'installment') mobileDiscountApplied = false;
        updateMobileCartSummary();
        return;
      }
      const bankButton = event.target.closest('[data-mobile-bank-head]');
      if(bankButton){
        mobileInstallmentChoice = { bank:bankButton.dataset.mobileBankHead, months:12 };
        updateMobileCartSummary();
        return;
      }
      const monthButton = event.target.closest('[data-mobile-months]');
      if(monthButton){
        mobileInstallmentChoice = {
          bank:monthButton.dataset.mobileBank,
          months:Number(monthButton.dataset.mobileMonths || 12)
        };
        updateMobileCartSummary();
        return;
      }
      if(event.target.closest('#mCheckoutBtn')){
        createMobileOrder();
        return;
      }
      if(event.target.closest('#mDiscountCardBtn')){
        if(selectedMobilePayment() === 'installment'){
          alert('Скидочная карта не применяется при рассрочке.');
          return;
        }
        if(!mobileDiscountCard.active){
          alert('Сначала получите скидочную карту в личном кабинете.');
          location.href = 'mobile-discount-card.html';
          return;
        }
        mobileDiscountApplied = !mobileDiscountApplied;
        updateMobileCartSummary();
      }
    });
  }

  const clearButton = $('#mClearCart');
  if(clearButton && clearButton.dataset.cartControlsReady !== '1'){
    clearButton.dataset.cartControlsReady = '1';
    clearButton.addEventListener('click', () => {
      if(!mobileCartRows.length || !confirm('Очистить всю корзину?')) return;
      mobileCartRows = [];
      localStorage.removeItem(MOBILE_CART_SELECTED_KEY);
      renderMobileCartList();
      queueMobileCartMutation(() => clearUserCart());
    });
  }
}

async function renderCart(){
  setupShell('cart');
  await initData();
  const list = $('#mCartList');
  const checkoutBox = $('#mCheckoutBox');
  const user = await waitAuthUser();
  mobileCartUser = user;
  if(!user){
    if(list) list.innerHTML = '<div class="m-empty"><b>Войдите в аккаунт</b><br>Корзина сохраняется в профиле и доступна после входа.<br><br><a class="m-primary" href="mobile-profile.html">Войти</a></div>';
    if(checkoutBox) checkoutBox.hidden = true;
    clearLoader();
    return;
  }
  const check = await getProfileVerification(user);
  if(!check.verified){
    if(list) list.innerHTML = `<div class="m-empty"><b>Подтвердите профиль</b><br>${profileVerificationMessage()}<br><br><a class="m-primary" href="mobile-profile.html#security">Подтвердить профиль</a></div>`;
    if(checkoutBox) checkoutBox.hidden = true;
    clearLoader();
    return;
  }

  await loadUserCart(user).catch(error => console.warn('mobile cart load error', error));
  mobileCartRows = buildMobileCartRows(await waitUserCartReady());
  localStorage.removeItem(LEGACY_MOBILE_DISCOUNT_KEY);
  if(checkoutBox) checkoutBox.hidden = false;
  bindMobileCartControls();
  renderMobileCartList();
  clearLoader();

  mobileDiscountCard = await getActiveMobileDiscountCard(user);
  updateMobileCartSummary();
}

async function renderFavorites(){
  setupShell('fav'); await initData(); const list=products.filter(p=>favs.includes(String(p.id)));
  $('#mFavGrid').innerHTML=list.map(card).join('')||'<div class="m-empty">В избранном пока пусто</div>'; bind(); clearLoader();
}

let mobileCheckoutBusy = false;

async function createMobileOrder(){
  const user = await waitAuthUser();
  if(!user){
    alert('Войдите в аккаунт, чтобы оформить заказ.');
    location.href = 'mobile-profile.html';
    return;
  }
  const check = await getProfileVerification(user);
  if(!check.verified){
    alert(profileVerificationMessage());
    location.href = 'mobile-profile.html#security';
    return;
  }
  if(mobileCheckoutBusy) return;
  mobileCheckoutBusy = true;
  const button = $('#mCheckoutBtn');
  if(button){
    button.disabled = true;
    button.textContent = 'Создаём заказ...';
  }

  try {
    await mobileCartSaveQueue;
    await loadUserCart(user);
    let rows = buildMobileCartRows(getCurrentUserCart());
    rows = selectedMobileCartRows(rows);
    if(!rows.length){
      alert('Выберите товары для оформления.');
      return;
    }
    const stockProblem = rows.find(mobileCartRowInvalid);
    if(stockProblem){
      const available = mobileCartStock(stockProblem.product);
      alert(`Нельзя оформить заказ: «${title(stockProblem.product)}». В корзине ${Number(stockProblem.item.qty || 1)}, а в наличии ${available ?? 'неизвестно'}.`);
      mobileCartRows = buildMobileCartRows(getCurrentUserCart());
      renderMobileCartList();
      return;
    }

    const profile = (await getUserDoc(user.uid).catch(() => ({ data:{} }))).data || {};
    const items = rows.map(row => {
      const qty = Math.max(1, Number(row.item.qty || 1) || 1);
      const productPrice = price(row.product);
      return {
        productId:mobileCartRowId(row),
        title:title(row.product),
        group:group(row.product),
        code:mobileCartCode(row.product),
        image:img(row.product),
        price:productPrice,
        qty,
        lineTotal:productPrice * qty
      };
    });
    const subtotal = items.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0);
    const paymentMethod = selectedMobilePayment();
    const discountCardApplied = paymentMethod !== 'installment' && mobileDiscountApplied && mobileDiscountCard.active;
    const discountCardPercent = discountCardApplied ? Number(mobileDiscountCard.percent || 0) : 0;
    const discountTotal = discountCardApplied ? Math.min(Math.round(subtotal * discountCardPercent / 100), subtotal) : 0;
    const total = Math.max(0, subtotal - discountTotal);
    const totalQty = items.reduce((sum, item) => sum + Number(item.qty || 0), 0);
    const installment = paymentMethod === 'installment' ? selectedMobileInstallment(total) : null;
    if(paymentMethod === 'installment' && !installment?.bank){
      alert('Выберите банк для рассрочки.');
      return;
    }

    if(paymentMethod === 'card'){
      if(button) button.textContent = 'Переходим к оплате...';
      const payment = await startApbCardPayment({
        items,
        discountCardApplied,
        source: 'mobile-cart'
      });
      const orderedIds = new Set(items.map(item => String(item.productId)));
      const remainingCart = getCurrentUserCart().filter(item => !orderedIds.has(mobileCartItemId(item)));
      await saveUserCart(remainingCart, user);
      mobileCartRows = buildMobileCartRows(remainingCart);
      if(remainingCart.length) writeMobileCartSelected(new Set(remainingCart.map(mobileCartItemId)));
      else localStorage.removeItem(MOBILE_CART_SELECTED_KEY);
      mobileDiscountApplied = false;
      try { await trackEvent('card_payment_started'); } catch(error) {}
      submitApbPayment(payment);
      return;
    }

    const orderNumber = `AS-${Date.now().toString().slice(-8)}`;
    await addDoc(collection(db, COLLECTIONS.orders || 'autostyle_orders'), {
      orderNumber,
      status:'new',
      statusTitle:'Новый',
      source:'mobile-cart',
      userId:user.uid,
      uid:user.uid,
      userEmail:user.email || '',
      userName:profile.name || user.displayName || '',
      userPhone:profile.phone || '',
      userCar:profile.car || profile.carText || '',
      items,
      subtotal,
      discountTotal,
      discountCardApplied,
      discountCardPercent,
      discountCardRequested:false,
      total,
      totalQty,
      paymentMethod,
      paymentMethodTitle:mobilePaymentTitle(paymentMethod),
      installment:installment ? {
        bank:installment.bank,
        months:installment.months,
        monthsTitle:installment.monthsTitle,
        monthlyPayment:installment.monthlyPayment,
        monthlyPaymentText:installment.monthlyPaymentText
      } : null,
      installmentBank:installment?.bank || '',
      installmentMonths:installment?.months || null,
      installmentMonthlyPayment:installment?.monthlyPayment || null,
      createdAt:serverTimestamp(),
      createdAtText:new Date().toISOString()
    });

    const orderedIds = new Set(items.map(item => String(item.productId)));
    const remainingCart = getCurrentUserCart().filter(item => !orderedIds.has(mobileCartItemId(item)));
    await saveUserCart(remainingCart, user);
    mobileCartRows = buildMobileCartRows(remainingCart);
    if(remainingCart.length) writeMobileCartSelected(new Set(remainingCart.map(mobileCartItemId)));
    else localStorage.removeItem(MOBILE_CART_SELECTED_KEY);
    mobileDiscountApplied = false;
    try { await trackEvent('order_created'); } catch(error) {}
    alert(`Заказ ${orderNumber} создан и отправлен в админку.`);
    location.href = 'mobile-orders.html';
  } catch(error) {
    console.error('mobile order create error', error);
    alert('Не удалось оформить заказ: ' + (error?.message || error));
  } finally {
    mobileCheckoutBusy = false;
    if(button){
      button.textContent = 'Оформить выбранное';
    }
    updateMobileCartSummary();
  }
}

const usersCollection = COLLECTIONS.users || 'autostyle_users';
async function getUserDoc(uid){
  const primary = doc(db, usersCollection, uid);
  const snap = await getDoc(primary);
  if (snap.exists()) return { ref:primary, data:snap.data() };
  const legacy = doc(db, 'users', uid);
  const old = await getDoc(legacy).catch(()=>null);
  if (old && old.exists()) return { ref:primary, data:old.data() };
  return { ref:primary, data:{} };
}
function isProfileCompleteData(d={}){
  return Boolean(String(d.name||'').trim() && String(d.email||'').trim() && String(d.phone||'').trim() && String(d.city||'').trim() && String(d.address||'').trim() && String(d.car||d.carText||'').trim());
}
function makeDiscountCardNumber(uid=''){
  const base = String(uid).split('').reduce((sum,ch)=>sum+ch.charCodeAt(0),0);
  let body = ('29' + String(base).padStart(5,'0').slice(-5) + String(Date.now()).slice(-5)).slice(0,12).padEnd(12,'0');
  let sum=0; for(let i=0;i<12;i++) sum += Number(body[i]) * (i % 2 === 0 ? 1 : 3);
  return body + ((10 - (sum % 10)) % 10);
}
function ean13Svg(code){
  const L={'0':'0001101','1':'0011001','2':'0010011','3':'0111101','4':'0100011','5':'0110001','6':'0101111','7':'0111011','8':'0110111','9':'0001011'};
  const G={'0':'0100111','1':'0110011','2':'0011011','3':'0100001','4':'0011101','5':'0111001','6':'0000101','7':'0010001','8':'0001001','9':'0010111'};
  const R={'0':'1110010','1':'1100110','2':'1101100','3':'1000010','4':'1011100','5':'1001110','6':'1010000','7':'1000100','8':'1001000','9':'1110100'};
  const P=['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];
  code=String(code||'').replace(/\D/g,'').padEnd(13,'0').slice(0,13); const parity=P[Number(code[0])||0]; let bits='101';
  for(let i=1;i<=6;i++) bits+=(parity[i-1]==='L'?L:G)[code[i]]; bits+='01010'; for(let i=7;i<=12;i++) bits+=R[code[i]]; bits+='101';
  const w=190,h=56,bw=w/bits.length; let rects=''; for(let i=0;i<bits.length;i++) if(bits[i]==='1') rects+=`<rect x="${(i*bw).toFixed(2)}" y="0" width="${Math.ceil(bw)+.4}" height="44"/>`;
  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg"><rect width="${w}" height="${h}" rx="6" fill="#fff"/>${rects}<text x="${w/2}" y="53" text-anchor="middle" font-family="monospace" font-size="10" fill="#111827">${code.replace(/(\d)(\d{6})(\d{6})/,'$1 $2 $3')}</text></svg>`;
}
function profileDataFromForm(u, old={}){
  return {
    uid:u.uid,
    name:$('#pName')?.value.trim() || old.name || u.displayName || '',
    email:$('#pEmailEdit')?.value.trim() || old.email || u.email || '',
    phone:$('#pPhone')?.value.trim() || old.phone || '',
    city:$('#pCity')?.value.trim() || old.city || '',
    address:$('#pAddress')?.value.trim() || old.address || '',
    car:$('#pCar')?.value.trim() || old.car || old.carText || '',
    photoURL:old.photoURL || u.photoURL || ''
  };
}
function profilePhotoExtension(file){
  const mime=String(file?.type||'').toLowerCase();
  if(mime==='image/png') return 'png';
  if(mime==='image/webp') return 'webp';
  if(mime==='image/gif') return 'gif';
  return 'jpg';
}
async function uploadMobileProfilePhoto(user,file){
  if(!file) return '';
  if(!String(file.type||'').startsWith('image/')) throw new Error('Выберите изображение JPG, PNG или WEBP.');
  if(file.size > 5 * 1024 * 1024) throw new Error('Фото должно быть меньше 5 МБ.');
  const ext=profilePhotoExtension(file);
  const fileRef=ref(storage,'autostyle_users/'+user.uid+'/avatar.'+ext);
  await uploadBytes(fileRef,file,{contentType:file.type,cacheControl:'public,max-age=31536000'});
  return getDownloadURL(fileRef);
}
function renderDiscountCard(u, data={}){
  const card=data.discountCard || {};
  const active=Boolean(card.active || data.discountCardActive || data.active === true);
  const complete=isProfileCompleteData({...data,email:data.email||u.email,name:data.name||u.displayName});
  const number=card.number || data.discountCardNumber || data.number || makeDiscountCardNumber(u.uid);
  const rawDiscount=card.discount ?? card.discountPercent ?? data.discountCardPercent ?? data.discount ?? data.discountPercent ?? 0;
  const discountPercent=Math.max(0, Math.min(100, Math.round(Number(rawDiscount) || 0)));
  const displayName=escapeHtml(data.name||u.displayName||u.email||'AutoStyle');
  const activeMarkup=active
    ? `
      <div class="m-discount-status" role="status"><span class="m-discount-status-dot" aria-hidden="true"></span><span>КАРТА АКТИВНА</span></div>
      <h2>Ваша скидка</h2>
      <div class="m-discount-rate" aria-label="Ваша скидка ${discountPercent}%"><span>Персональная скидка</span><strong>${discountPercent}<small>%</small></strong></div>
      <p class="m-discount-caption">Скидка автоматически применится при оформлении заказа.</p>
    `
    : `
      <div class="m-discount-status m-discount-status-muted"><span class="m-discount-status-dot" aria-hidden="true"></span><span>КАРТА ЕЩЁ НЕ АКТИВНА</span></div>
      <h2>Скидочная карта</h2>
      <p class="m-discount-caption">Заполните имя, телефон, город, адрес и автомобиль, затем получите карту.</p>
    `;
  const actionMarkup=active ? '' : `<button id="mGetDiscount" class="m-primary" style="width:100%">${complete?'Получить скидочную карту':'Заполнить профиль'}</button>`;
  return `<section class="m-discount-card ${active?'active':'locked'}"><div class="m-discount-visual"><div class="m-discount-logo">AS <span>AUTOSTYLE</span></div><em>${displayName}</em><div class="m-discount-barcode">${active?ean13Svg(number):'<div class="m-discount-lock">Заполните профиль</div>'}</div><small>${active?number:'Карта пока не активна'}</small></div><div class="m-discount-info">${activeMarkup}${actionMarkup}<a class="m-btn" style="width:100%;margin-top:10px" href="mobile-cart.html">Перейти в корзину</a></div></section>`;
}
async function activateDiscountCard(u, currentData){
  const data=profileDataFromForm(u,currentData);
  if(!isProfileCompleteData(data)){ alert('Заполните имя, телефон, город, адрес и автомобиль, затем сохраните профиль.'); return; }
  const number=currentData.discountCard?.number || currentData.discountCardNumber || makeDiscountCardNumber(u.uid);
  const issuedAt=new Date().toISOString();
  const current=await getUserDoc(u.uid);
  await setDoc(current.ref,{...data,discountCard:{active:true,number,type:'EAN13',issuedAt},discountCardActive:true,discountCardNumber:number,updatedAt:issuedAt,createdAt:current.data.createdAt||issuedAt,role:current.data.role||'user'},{merge:true});
  await setDoc(doc(db, COLLECTIONS.discountCards || 'autostyle_discountCards', u.uid),{...data,userId:u.uid,number,type:'EAN13',active:true,issuedAt,updatedAt:issuedAt,createdAtServer:serverTimestamp(),searchText:`${data.name} ${data.email} ${data.phone} ${number} ${data.city} ${data.car}`.toLowerCase()},{merge:true}).catch(()=>{});
  alert('Скидочная карта активирована.'); location.hash='discount-card'; location.reload();
}
function renderInfoShell(active='more'){ setupShell(active); clearLoader(); }


function orderStatusText(order={}){
  return order.statusText || ({new:'Новый',pending:'В обработке',processing:'В работе',done:'Выполнен',cancelled:'Отменён'})[order.status] || order.status || 'В обработке';
}
function orderPaymentStatusText(order={}){
  if(order.paymentMethod !== 'card' && order.paymentProvider !== 'agroprombank') return '';
  return order.paymentStatusTitle || ({
    pending:'Ожидает оплаты',
    paid:'Оплата получена',
    failed:'Ошибка платежа',
    cancelled:'Платёж отменён',
    expired:'Срок оплаты истёк'
  })[order.paymentStatus] || 'Статус оплаты уточняется';
}
function formatDate(value){
  try{
    const d = value?.toDate ? value.toDate() : new Date(value || Date.now());
    return d.toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
  }catch(e){ return ''; }
}
async function loadMobileOrders(user){
  if(!user) return [];
  const ordersCollection = COLLECTIONS.orders || 'autostyle_orders';
  const map = new Map();
  async function addFrom(q){
    try{ const snap = await getDocs(q); snap.docs.forEach(d=>map.set(d.id,{id:d.id, ...d.data()})); }catch(e){ console.warn('mobile orders query error', e); }
  }
  await addFrom(query(collection(db, ordersCollection), where('userId','==',user.uid), limit(50)));
  await addFrom(query(collection(db, ordersCollection), where('uid','==',user.uid), limit(50)));
  return [...map.values()].sort((a,b)=>{
    const ad = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || a.createdAtText || 0).getTime();
    const bd = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || b.createdAtText || 0).getTime();
    return bd - ad;
  });
}
function renderOrdersList(orders=[]){
  if(!orders.length) return '<div class="m-empty">Заказов пока нет.</div>';
  return orders.map(o=>{ const items = Array.isArray(o.items) ? o.items : []; const paymentStatus = orderPaymentStatusText(o); return `<article class="m-order-card"><div><b>Заказ ${escapeHtml(o.orderNumber || o.number || o.id || '')}</b><small>${formatDate(o.createdAt || o.createdAtText)}</small>${items.length?`<em>${items.slice(0,3).map(i=>escapeHtml(i.title||i.name||'Товар')).join(', ')}${items.length>3?'…':''}</em>`:''}</div><span>${escapeHtml(orderStatusText(o))}${paymentStatus ? `<small>${escapeHtml(paymentStatus)}</small>` : ''}</span><strong>${money(o.total || o.totalPrice || o.sum || 0)}</strong></article>`; }).join('');
}
async function sendMobileFeedback(user){
  if(!user){ alert('Войдите в аккаунт'); return; }
  const subject = $('#mFeedbackSubject')?.value.trim() || 'Обращение с мобильной версии';
  const type = $('#mFeedbackType')?.value || 'proposal';
  const text = $('#mFeedbackText')?.value.trim() || '';
  const file = $('#mFeedbackPhoto')?.files?.[0] || null;
  if(!text){ alert('Напишите текст обращения.'); return; }
  let photoUrl = '';
  if(file){
    const ext = (file.name.split('.').pop() || 'jpg').replace(/[^a-z0-9]/gi,'').toLowerCase();
    const path = `autostyle_feedback/${user.uid}/${Date.now()}.${ext}`;
    const fileRef = ref(storage, path);
    await uploadBytes(fileRef, file);
    photoUrl = await getDownloadURL(fileRef);
  }
  await addDoc(collection(db, COLLECTIONS.feedback || 'autostyle_feedback'), {
    type, subject, text, photoUrl,
    userId:user.uid, uid:user.uid, userEmail:user.email || '', userName:user.displayName || '',
    status:'new', unread:true, createdAt:serverTimestamp(), createdAtText:new Date().toISOString()
  });
  $('#mFeedbackSubject').value=''; $('#mFeedbackText').value=''; if($('#mFeedbackPhoto')) $('#mFeedbackPhoto').value='';
  alert('Обращение отправлено администрации.');
}

function providerTitle(id){
  return ({'password':'Email/пароль'})[id] || id;
}
function userProviders(u){ return (u?.providerData || []).map(x => x.providerId).filter(Boolean).filter(id => id === 'password'); }
async function saveAuthProfile(u, extra={}){
  if(!u) return;
  try {
    const current = await getUserDoc(u.uid);
    await setDoc(current.ref, {
      uid:u.uid,
      name: extra.name || current.data.name || u.displayName || '',
      email: extra.email || current.data.email || u.email || '',
      phone: extra.phone || current.data.phone || '',
      carBrand: extra.carBrand || current.data.carBrand || '',
      carYear: extra.carYear || current.data.carYear || '',
      carModel: extra.carModel || current.data.carModel || '',
      car: extra.car || current.data.car || current.data.carText || [extra.carBrand || current.data.carBrand, extra.carModel || current.data.carModel, extra.carYear || current.data.carYear].filter(Boolean).join(' '),
      photoURL: extra.photoURL || current.data.photoURL || u.photoURL || '',
      providers:userProviders(u),
      emailVerified:Boolean(u.emailVerified),
      phoneVerified:false,
      lastLoginAt:new Date().toISOString(),
      updatedAt:new Date().toISOString(),
      createdAt:current.data.createdAt || new Date().toISOString(),
      role:current.data.role || 'user'
    }, { merge:true });
  } catch (error) {
    // A successful Firebase sign-in must not be turned into a failed login
    // only because the optional profile sync is offline or denied.
    console.warn('AutoStyle mobile profile sync skipped:', error);
  }
}
async function registerByEmail(){
  const name=$('#pRegName')?.value.trim()||'';
  const carBrand=$('#pRegCarBrand')?.value.trim()||'';
  const carYear=$('#pRegCarYear')?.value.trim()||'';
  const carModel=$('#pRegCarModel')?.value.trim()||'';
  const email=$('#pRegEmail')?.value.trim()||'';
  const pass=$('#pRegPass')?.value||'';
  await waitForAuthReady();
  const res=await createUserWithEmailAndPassword(auth,email,pass);
  await updateProfile(res.user,{displayName:name});
  await sendEmailVerification(res.user);
  await saveAuthProfile(res.user,{name,email,carBrand,carYear,carModel,car:[carBrand,carModel,carYear].filter(Boolean).join(' ')});
  alert('Аккаунт создан. Письмо подтверждения отправлено на почту.');
  location.reload();
}

function initials(u){const base=(u?.displayName||u?.email||'AS').trim();return base.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'AS'}

let mobileNotificationsUnsub = null;
let mobileNotificationRenderToken = 0;
let mobileProfileAuthUnsub = null;
let mobileProfileRenderToken = 0;
function renderMobileNotificationList(root, data){
  if(!root || !root.isConnected) return;
  const list = data.list || [];
  const readIds = data.readIds || new Set();
  const selected = new URLSearchParams(location.search).get('id') || '';
  if(selected && root.dataset.notificationDetailId === String(selected)) return;
  const open = selected ? list.find(n => String(n.id) === String(selected)) : null;
  if(open){
    root.dataset.notificationDetail = '1';
    root.dataset.notificationDetailId = String(open.id);
    let bodyHtml = '';
    try { bodyHtml = sanitizeNotificationHtml(open.html); } catch (_) { bodyHtml = ''; }
    bodyHtml ||= `<p>${escapeHtml(notificationText(open))}</p>`;
    const backUrl = 'mobile-notifications.html?__as_notify=20260730-notification-detail-v19';
    root.innerHTML = `<section class="m-profile-pane m-notification-detail" data-notification-detail><a class="m-btn m-notification-back" href="${backUrl}">← Все уведомления</a><h2>${escapeHtml(open.title || 'Уведомление')}</h2><p class="m-group">${escapeHtml(fmt(open.createdAt || open.createdAtLocal))}</p><div class="m-notification-body">${bodyHtml}</div>${open.link ? `<p class="m-notification-action"><a class="m-btn green" href="${escapeHtml(notificationActionUrl(open.link))}">Перейти</a></p>` : ''}</section>`;
    markNotificationRead(auth.currentUser, open.id).catch(()=>{});
    return;
  }
  delete root.dataset.notificationDetail;
  delete root.dataset.notificationDetailId;
    root.innerHTML = `<section class="m-profile-pane"><h2>Уведомления</h2>${data.unread ? `<button id="mReadAllNotifications" class="m-btn" type="button" style="width:100%;margin-bottom:10px">Прочитать все</button>` : ''}<div class="m-notifications-list">${list.length ? list.map(n=>`<a class="m-notification-item ${readIds.has(n.id)?'is-read':'is-unread'}" href="mobile-notifications.html?__as_notify=20260730-notification-detail-v19&amp;id=${encodeURIComponent(n.id)}"><b>${!readIds.has(n.id)?'<i></i>':''}${escapeHtml(n.title || 'Уведомление')}</b><span>${escapeHtml(notificationText(n))}</span><small>${escapeHtml(fmt(n.createdAt || n.createdAtLocal))}</small></a>`).join('') : '<div class="m-empty">Пока уведомлений нет.</div>'}</div></section>`;
  const readAll = $('#mReadAllNotifications');
  if(readAll) readAll.onclick = async()=>{ await markNotificationsRead(auth.currentUser, list.map(n=>n.id)); };
}
function startMobileNotifications(user, root){
  const renderToken = ++mobileNotificationRenderToken;
  if(mobileNotificationsUnsub){ try{ mobileNotificationsUnsub(); }catch(e){} mobileNotificationsUnsub = null; }
  if(!root || !root.isConnected) return;
  if(!user){ root.innerHTML = `<div class="m-empty"><b>Войдите в аккаунт</b><br>Уведомления доступны после входа.<br><br><a class="m-primary" href="mobile-profile.html">Войти</a></div>`; return; }
  root.innerHTML = '<div class="m-empty">Загружаем уведомления...</div>';
  const detailId = new URLSearchParams(location.search).get('id') || '';
  let stop = () => {};
  const onState = data => {
    if(renderToken !== mobileNotificationRenderToken || !root.isConnected) return;
    renderMobileNotificationList(root, data);
    if(detailId && root.dataset.notificationDetailId === String(detailId)) {
      // Once the requested detail is visible, no later read/snapshot event is
      // allowed to replace its DOM. This is the source of the intermittent
      // "works once, then no buttons" behaviour on iPhone/Safari.
      Promise.resolve().then(() => {
        stop();
        if(mobileNotificationsUnsub === stop) mobileNotificationsUnsub = null;
      });
    }
  };
  stop = watchNotifications(user, onState);
  mobileNotificationsUnsub = stop;
  if(detailId && root.dataset.notificationDetailId === String(detailId)) {
    stop();
    mobileNotificationsUnsub = null;
  }
}

async function renderProfile(){
  const renderToken = ++mobileProfileRenderToken;
  if(mobileProfileAuthUnsub){
    try{ mobileProfileAuthUnsub(); }catch(e){}
    mobileProfileAuthUnsub = null;
  }
  setupShell('profile');
  const isCurrentRender = () => renderToken === mobileProfileRenderToken && !!document.getElementById('mProfileBox');
  let profileInitialUid = null;
  let profileInitialRenderDone = false;
  const renderProfileUser = async u => {
    if(!isCurrentRender()) return;
    const uid = String(u?.uid || 'guest');
    if(profileInitialRenderDone && profileInitialUid === uid) return;
    profileInitialRenderDone = true;
    profileInitialUid = uid;
    if(u){
      // Обновление Firebase Auth не должно блокировать профиль. Берём
      // сохранённого пользователя сразу, а актуальный статус почты
      // обновляем с коротким пределом ожидания.
      try{ await waitWithTimeout(() => u.reload(), 1200, null); }catch(e){ console.warn('Не удалось обновить статус Email', e); }
      u = auth.currentUser || u;
    }
    if(!isCurrentRender()) return;
    userNow=u; const box=$('#mProfileBox');
    if(!u){
      box.innerHTML=`<section class="m-auth-unified">
        <div class="m-auth-unified-head">
          <div>
            <span class="m-auth-eyebrow">Аккаунт AutoStyle</span>
            <h1>Добро пожаловать</h1>
            <p>Войдите в существующий аккаунт или создайте новый.</p>
          </div>
        </div>

        <div class="m-auth-switch" role="tablist" aria-label="Вход или регистрация">
          <button id="mAuthLoginTab" class="active" type="button" role="tab" aria-selected="true">Вход</button>
          <button id="mAuthRegisterTab" type="button" role="tab" aria-selected="false">Регистрация</button>
        </div>

        <div id="mAuthLoginPanel" class="m-auth-panel active" role="tabpanel">
          <div class="m-auth-panel-title">
            <h2>Войти в аккаунт</h2>
            <p>Используйте Email и пароль.</p>
          </div>
          <label class="m-auth-field">
            <span>Email</span>
            <input id="pEmail" class="m-input" type="email" autocomplete="email" placeholder="name@example.com">
          </label>
          <label class="m-auth-field">
            <span>Пароль</span>
            <div class="m-auth-password-wrap">
              <input id="pPass" class="m-input" type="password" autocomplete="current-password" placeholder="Введите пароль">
              <button id="mShowLoginPass" type="button" aria-label="Показать пароль">Показать</button>
            </div>
          </label>
          <button id="pLogin" class="m-primary m-auth-main-button" type="button">Войти</button>
          <button id="mForgotPassword" class="m-auth-text-button" type="button">Забыли пароль?</button>
        </div>

        <div id="mAuthRegisterPanel" class="m-auth-panel" role="tabpanel" hidden>
          <div class="m-reg-progress-head">
            <b id="mRegStepText">Шаг 1 из 6</b>
            <small>Регистрация</small>
          </div>
          <div class="m-reg-progress"><i id="mRegProgressBar"></i></div>

          <section class="m-reg-step active">
            <span>👋</span><h2>Как вас зовут?</h2><p>Имя будет отображаться в профиле.</p>
            <input id="pRegName" class="m-input" placeholder="Ваше имя" minlength="2" required>
          </section>
          <section class="m-reg-step">
            <span>🚗</span><h2>Марка автомобиля</h2><p>Например: Volkswagen, BMW или Toyota.</p>
            <input id="pRegCarBrand" class="m-input" placeholder="Марка автомобиля" required>
          </section>
          <section class="m-reg-step">
            <span>📅</span><h2>Год автомобиля</h2><p>Укажите год выпуска.</p>
            <input id="pRegCarYear" class="m-input" type="number" inputmode="numeric" min="1950" max="2030" placeholder="Например, 2018" required>
          </section>
          <section class="m-reg-step">
            <span>🏁</span><h2>Модель автомобиля</h2><p>Например: Octavia, Golf или Camry.</p>
            <input id="pRegCarModel" class="m-input" placeholder="Модель автомобиля" required>
          </section>
          <section class="m-reg-step">
            <span>🔐</span><h2>Придумайте пароль</h2><p>Минимум 6 символов.</p>
            <div class="m-auth-password-wrap">
              <input id="pRegPass" class="m-input" type="password" minlength="6" autocomplete="new-password" placeholder="Пароль" required>
              <button id="mShowRegPass" type="button">Показать</button>
            </div>
            <input id="pRegPass2" class="m-input" type="password" minlength="6" autocomplete="new-password" placeholder="Повторите пароль" required>
          </section>
          <section class="m-reg-step">
            <span>✉️</span><h2>Укажите Email</h2><p>На него придёт письмо подтверждения.</p>
            <input id="pRegEmail" class="m-input" type="email" autocomplete="email" placeholder="name@example.com" required>
          </section>

          <div class="m-reg-actions">
            <button id="mRegBack" class="m-btn" type="button" hidden>Назад</button>
            <button id="pRegister" class="m-primary" type="button">Продолжить</button>
          </div>
        </div>
      </section>`;

      const loginTab=$('#mAuthLoginTab');
      const registerTab=$('#mAuthRegisterTab');
      const loginPanel=$('#mAuthLoginPanel');
      const registerPanel=$('#mAuthRegisterPanel');

      const setAuthMode=(mode)=>{
        const isLogin=mode==='login';
        loginTab.classList.toggle('active',isLogin);
        registerTab.classList.toggle('active',!isLogin);
        loginTab.setAttribute('aria-selected',String(isLogin));
        registerTab.setAttribute('aria-selected',String(!isLogin));
        loginPanel.classList.toggle('active',isLogin);
        registerPanel.classList.toggle('active',!isLogin);
        loginPanel.hidden=!isLogin;
        registerPanel.hidden=isLogin;
        if(!isLogin) setTimeout(()=>$('#pRegName')?.focus(),80);
      };

      loginTab.onclick=()=>setAuthMode('login');
      registerTab.onclick=()=>setAuthMode('register');

      $('#mShowLoginPass').onclick=()=>{
        const input=$('#pPass');
        const show=input.type==='password';
        input.type=show?'text':'password';
        $('#mShowLoginPass').textContent=show?'Скрыть':'Показать';
      };

      $('#mShowRegPass').onclick=()=>{
        const input=$('#pRegPass');
        const repeat=$('#pRegPass2');
        const show=input.type==='password';
        input.type=repeat.type=show?'text':'password';
        $('#mShowRegPass').textContent=show?'Скрыть':'Показать';
      };

      $('#pLogin').onclick=async()=>{
        const email=$('#pEmail').value.trim();
        const pass=$('#pPass').value;
        if(!email){ alert('Введите Email.'); $('#pEmail').focus(); return; }
        if(!pass){ alert('Введите пароль.'); $('#pPass').focus(); return; }
        try{
          $('#pLogin').disabled=true;
          $('#pLogin').textContent='Входим...';
          await waitForAuthReady();
          const res=await signInWithEmailAndPassword(auth,email,pass);
          await saveAuthProfile(res.user);
          location.reload();
        }catch(e){
          $('#pLogin').disabled=false;
          $('#pLogin').textContent='Войти';
          alert('Не удалось войти. Проверьте Email и пароль.');
        }
      };

      $('#mForgotPassword').onclick=async()=>{
        const email=$('#pEmail').value.trim();
        if(!email){ alert('Сначала укажите Email.'); $('#pEmail').focus(); return; }
        try{
          await sendPasswordResetEmail(auth,email);
          alert('Ссылка для восстановления пароля отправлена на почту.');
        }catch(e){
          alert('Не удалось отправить письмо. Проверьте Email.');
        }
      };

      let mRegStep=0;
      const mRegSteps=[...document.querySelectorAll('.m-reg-step')];
      const drawMReg=()=>{
        mRegSteps.forEach((el,i)=>el.classList.toggle('active',i===mRegStep));
        $('#mRegStepText').textContent=`Шаг ${mRegStep+1} из ${mRegSteps.length}`;
        $('#mRegProgressBar').style.width=`${((mRegStep+1)/mRegSteps.length)*100}%`;
        $('#mRegBack').hidden=mRegStep===0;
        $('#pRegister').textContent=mRegStep===mRegSteps.length-1?'Создать аккаунт':'Продолжить';
        setTimeout(()=>mRegSteps[mRegStep]?.querySelector('input')?.focus(),50);
      };
      const validMReg=()=>{
        for(const input of mRegSteps[mRegStep].querySelectorAll('input[required]')){
          if(!input.checkValidity()){input.reportValidity();return false;}
        }
        if(mRegStep===2){
          const y=Number($('#pRegCarYear').value),max=new Date().getFullYear()+1;
          if(y<1950||y>max){alert(`Укажите год от 1950 до ${max}.`);return false;}
        }
        if(mRegStep===4&&$('#pRegPass').value!==$('#pRegPass2').value){
          alert('Пароли не совпадают.');return false;
        }
        return true;
      };
      $('#pRegister').onclick=async()=>{
        if(!validMReg())return;
        if(mRegStep<mRegSteps.length-1){mRegStep++;drawMReg();return;}
        try{
          $('#pRegister').disabled=true;
          $('#pRegister').textContent='Создаём...';
          await registerByEmail();
        }catch(e){
          $('#pRegister').disabled=false;
          $('#pRegister').textContent='Создать аккаунт';
          alert('Ошибка регистрации: '+(e.message||e));
        }
      };
      $('#mRegBack').onclick=()=>{if(mRegStep>0){mRegStep--;drawMReg();}};
      mRegSteps.forEach(step=>step.querySelectorAll('input').forEach(input=>{
        input.addEventListener('keydown',event=>{
          if(event.key==='Enter'){event.preventDefault();$('#pRegister').click();}
        });
      }));
      drawMReg();
      clearLoader(); return;
    }
    const fallbackCurrent = { ref: doc(db, usersCollection, u.uid), data:{} };
    const current = await waitWithTimeout(() => getUserDoc(u.uid), 1600, fallbackCurrent)
      .catch(() => fallbackCurrent);
    if(!isCurrentRender()) return;
    let d=current.data || {};
    const [cardSnap, myOrders] = await Promise.all([
      waitWithTimeout(
        () => getDoc(doc(db, COLLECTIONS.discountCards || 'autostyle_discount_cards', u.uid)),
        1200,
        null
      ).catch(() => null),
      waitWithTimeout(() => loadMobileOrders(u), 1200, []).catch(() => [])
    ]);
    if(!isCurrentRender()) return;
    if(cardSnap && cardSnap.exists()) d = { ...d, discountCard:{ ...(d.discountCard||{}), ...cardSnap.data(), active: cardSnap.data().active !== false }, discountCardActive: cardSnap.data().active !== false, discountCardNumber: cardSnap.data().number || d.discountCardNumber };
    const registeredCar = d.car || d.carText || [d.carBrand, d.carModel, d.carYear].filter(Boolean).join(' ');
    const emailConfirmed = u.emailVerified === true;
    if(d.emailVerified !== emailConfirmed){
      setDoc(current.ref,{emailVerified:emailConfirmed,updatedAt:new Date().toISOString()},{merge:true}).catch(()=>{});
    }
    const isInnerProfilePage = page !== 'profile';
    const profileTop = isInnerProfilePage
      ? `<div class="m-profile-inner-head">
          <a class="m-profile-back" href="mobile-profile.html" aria-label="Назад">←</a>
          <div class="m-avatar">${(d.photoURL||u.photoURL)?`<img src="${d.photoURL||u.photoURL}">`:initials({displayName:d.name||u.displayName,email:d.email||u.email})}</div>
          <div class="m-profile-inner-user"><b>${d.name||u.displayName||'Профиль'}</b><small>${d.email||u.email||''}</small></div>
          <button id="pLogout" class="m-profile-mini-logout" type="button">Выйти</button>
        </div>`
      : `<div class="m-profile-head m-profile-head-dark"><div class="m-avatar">${(d.photoURL||u.photoURL)?`<img src="${d.photoURL||u.photoURL}">`:initials({displayName:d.name||u.displayName,email:d.email||u.email})}</div><div class="m-profile-user"><h1>${d.name||u.displayName||'Профиль'}</h1><div>${d.email||u.email||''}</div></div><div class="m-profile-head-actions"><span class="${emailConfirmed?'m-profile-ok':'m-profile-wait'}">${emailConfirmed?'Профиль подтверждён':'Почта не подтверждена'}</span><button id="pLogout" class="m-profile-head-logout" type="button">Выйти</button></div></div>`;
    const profileMenu = `<div class="m-profile-main-title"><h1>Главная профиля</h1><p>Управляйте заказами, скидками и настройками в одном месте.</p></div>
    <div class="m-profile-tiles m-profile-tiles-full">
      <a id="mWheelTile" class="m-profile-tile tile-wheel ${emailConfirmed?'is-active':'is-locked'}" href="${emailConfirmed?'mobile-wheel.html':'mobile-profile-data.html#security'}" ${emailConfirmed?'':'aria-disabled="true"'}><span class="m-wheel-label">${emailConfirmed?'ПОДАРКИ':'ПОДТВЕРДИТЕ ПОЧТУ'}</span><span class="m-tile-ico m-wheel-ico" aria-hidden="true"><span>GO</span></span><b>Колесо фортуны</b><small>${emailConfirmed?'Испытать удачу и получить подарок':'Подтвердите Email, чтобы открыть колесо'}</small></a>
      <a class="m-profile-tile tile-green" href="mobile-catalog.html"><span class="m-tile-ico"><img src="assets/icons/package.svg" alt=""></span><b>Каталог товаров</b><small>Все товары AutoStyle</small></a>
      <a class="m-profile-tile" href="mobile-favorites.html"><span class="m-tile-ico"><img src="assets/icons/heart.svg" alt=""></span><b>Избранное</b><small>Сохранённые товары</small></a>
      <a class="m-profile-tile" href="mobile-cart.html"><span class="m-tile-ico"><img src="assets/icons/cart.svg" alt=""></span><b>Корзина</b><small>Товары и оформление</small></a>
      <a class="m-profile-tile tile-dark" href="mobile-orders.html"><span class="m-tile-ico"><img src="assets/icons/file.svg" alt=""></span><b>Мои заказы</b><small>История и статусы</small></a>
      <a class="m-profile-tile" href="mobile-profile-data.html#account"><span class="m-tile-ico"><img src="assets/icons/user.svg" alt=""></span><b>Профиль</b><small>Личные данные и фото</small></a>
      <a class="m-profile-tile tile-red" href="mobile-discount-card.html"><span class="m-tile-ico"><img src="assets/icons/percent.svg" alt=""></span><b>Скидочная карта</b><small>Карта и персональная скидка</small></a>
      <a class="m-profile-tile tile-feedback" href="mobile-feedback.html"><span class="m-tile-ico"><img src="assets/icons/bell.svg" alt=""></span><b>Предложения и жалобы</b><small>Связь с администрацией</small></a>
      <a class="m-profile-tile" href="mobile-profile-data.html#security"><span class="m-tile-ico"><img src="assets/icons/settings.svg" alt=""></span><b>Вход и безопасность</b><small>Почта и пароль</small></a>
      <a class="m-profile-tile" href="mobile-profile-data.html#account"><span class="m-tile-ico"><img src="assets/icons/card.svg" alt=""></span><b>Изменить пароль</b><small>Настройки доступа</small></a>
      <a class="m-profile-tile" href="mobile-notifications.html?__as_notify=20260730-notification-detail-v19"><span class="m-tile-ico"><img src="assets/icons/bell.svg" alt=""></span><b>Уведомления</b><small>Заказы и сообщения</small></a>
    </div>`; 
    const innerNav = `<div class="m-profile-inner-nav">
      <a class="${page==='profile-data'?'active':''}" href="mobile-profile-data.html"><span><img src="assets/icons/user.svg" alt=""></span><b>Данные</b></a>
      <a class="${page==='discount-card'?'active':''}" href="mobile-discount-card.html"><span><img src="assets/icons/card.svg" alt=""></span><b>Карта</b></a>
      <a class="${page==='orders'?'active':''}" href="mobile-orders.html"><span><img src="assets/icons/package.svg" alt=""></span><b>Заказы</b></a>
      <a class="${page==='notifications'?'active':''}" href="mobile-notifications.html?__as_notify=20260730-notification-detail-v19"><span><img src="assets/icons/bell.svg" alt=""></span><b>Уведомления</b></a>
      <a class="${page==='feedback'?'active':''}" href="mobile-feedback.html"><span><img src="assets/icons/settings.svg" alt=""></span><b>Обращения</b></a>
    </div>`;
    let body = profileMenu;
    if(page === 'profile-data') body = `${innerNav}
      <section id="account" class="m-profile-pane m-profile-inner-pane">
        <div class="m-pane-title"><span><img src="assets/icons/user.svg" alt=""></span><div><h2>Личные данные</h2><p>Имя, контакты, автомобиль и фото.</p></div></div>
        <div class="m-form-grid">
          <label><span>Имя</span><input id="pName" class="m-input" value="${d.name||u.displayName||''}" placeholder="Ваше имя"></label>
          <label><span>Email</span><input id="pEmailEdit" class="m-input" value="${d.email||u.email||''}" placeholder="Email"></label>
          <label><span>Телефон</span><input id="pPhone" class="m-input" value="${d.phone||u.phoneNumber||''}" placeholder="Телефон"></label>
          <label><span>Город</span><input id="pCity" class="m-input" value="${d.city||''}" placeholder="Город"></label>
          <label class="m-form-wide"><span>Адрес</span><input id="pAddress" class="m-input" value="${d.address||''}" placeholder="Адрес"></label>
          <label class="m-form-wide"><span>Автомобиль</span><input id="pCar" class="m-input" value="${registeredCar}" placeholder="Марка, модель, год"></label>
          <label class="m-file-input m-form-wide" for="pPhotoFile" style="display:flex;align-items:center;justify-content:center;min-height:52px;cursor:pointer">
            <input id="pPhotoFile" type="file" accept="image/*">
            <span>📷 Выбрать фото профиля</span>
          </label>
          <small id="pPhotoStatus" class="m-profile-photo-status" style="display:block;grid-column:1/-1;margin-top:-4px;color:#667085;font-size:12px;font-weight:800">${d.photoURL||u.photoURL?'Текущее фото уже сохранено. Новое можно выбрать здесь.':'Фото ещё не добавлено.'}</small>
        </div>
        <button id="saveProfile" class="m-primary m-profile-save">Сохранить изменения</button>
        <div id="pProfileMsg" class="m-profile-save-message" role="status" aria-live="polite" style="min-height:20px;margin-top:10px;color:#159b08;font-size:13px;font-weight:850;line-height:1.35"></div>
      </section>
      <section id="security" class="m-profile-pane m-profile-inner-pane">
        <div class="m-pane-title"><span><img src="assets/icons/settings.svg" alt=""></span><div><h2>Безопасность</h2><p>Почта и пароль.</p></div></div>
        <div class="m-security-status">
          <div><b>Почта</b><span class="${u.emailVerified?'ok':'wait'}">${u.emailVerified?'Подтверждена':'Не подтверждена'}</span></div>
          <div><b>Способ входа</b><span>${userProviders(u).map(providerTitle).join(', ') || 'Не определён'}</span></div>
        </div>
        <button id="resendEmailVerify" class="m-btn m-full-btn">Подтвердить почту</button>
        </div>
        <div class="m-password-box">
          <label><span>Новый пароль</span><input id="pPassEdit" class="m-input" type="password" placeholder="Минимум 6 символов"></label>
          <small>Новый пароль сохранится вместе с данными профиля.</small>
        </div>
      </section>`;
    if(page === 'discount-card') body = `${innerNav}<section id="discount-card" class="m-profile-pane m-profile-inner-pane">${renderDiscountCard(u,d)}</section>`;
    if(page === 'orders') body = `${innerNav}<section id="orders" class="m-profile-pane m-profile-inner-pane"><div class="m-pane-title"><span><img src="assets/icons/package.svg" alt=""></span><div><h2>Мои заказы</h2><p>История покупок и статусы.</p></div></div><div class="m-orders-list">${renderOrdersList(myOrders)}</div></section>`;
    if(page === 'feedback') body = `${innerNav}<section id="feedback" class="m-profile-pane m-profile-inner-pane m-feedback-pane"><div class="m-pane-title"><span><img src="assets/icons/settings.svg" alt=""></span><div><h2>Предложения и жалобы</h2><p>Сообщение администрации сайта.</p></div></div><label><span>Тип обращения</span><select id="mFeedbackType" class="m-input"><option value="proposal">Предложение</option><option value="complaint">Жалоба</option><option value="question">Вопрос</option></select></label><label><span>Тема</span><input id="mFeedbackSubject" class="m-input" placeholder="Коротко опишите тему"></label><label><span>Сообщение</span><textarea id="mFeedbackText" class="m-input m-textarea" placeholder="Опишите обращение"></textarea></label><label class="m-file-input"><input id="mFeedbackPhoto" type="file" accept="image/*">📷 Прикрепить фото</label><button id="mSendFeedback" class="m-primary m-profile-save">Отправить администрации</button></section>`;
    if(page === 'notifications') body = `${innerNav}<section class="m-profile-pane m-profile-inner-pane" id="mMobileNotifications"><div class="m-pane-title"><span><img src="assets/icons/bell.svg" alt=""></span><div><h2>Уведомления</h2><p>Заказы и важные сообщения.</p></div></div><div class="m-empty">Загружаем...</div></section>`;
    box.innerHTML = `${profileTop}${body}`;
    const wheelTile = $('#mWheelTile');
    if(wheelTile){
      wheelTile.addEventListener('click', function(event){
        event.preventDefault();
        if(!emailConfirmed){
          alert('Колесо фортуны доступно после подтверждения почты. Откройте письмо от AutoStyle и подтвердите Email.');
          location.href='mobile-profile-data.html#security';
          return;
        }
        location.href='mobile-wheel.html';
      });
    }
    if(page === 'notifications') startMobileNotifications(u, $('#mMobileNotifications'));
    $$('.m-profile-pane .m-input').forEach(el=>el.style.marginTop='10px');
    mobileProfilePhotoFile=null;
    const photoInput=$('#pPhotoFile');
    const photoStatus=$('#pPhotoStatus');
    if(photoInput) photoInput.onchange=()=>{
      const file=photoInput.files?.[0]||null;
      mobileProfilePhotoFile=file;
      if(!photoStatus) return;
      if(!file){ photoStatus.textContent=d.photoURL||u.photoURL?'Текущее фото уже сохранено. Новое можно выбрать здесь.':'Фото ещё не добавлено.'; return; }
      if(!String(file.type||'').startsWith('image/')){
        mobileProfilePhotoFile=null;
        photoStatus.textContent='Нужен файл изображения.';
        return;
      }
      if(file.size > 5 * 1024 * 1024){
        mobileProfilePhotoFile=null;
        photoStatus.textContent='Файл больше 5 МБ. Выберите изображение меньше.';
        return;
      }
      photoStatus.textContent='Выбрано: '+file.name;
    };
    const showProfileMessage=(text,ok=false)=>{
      const msg=$('#pProfileMsg');
      if(!msg) return;
      msg.textContent=text||'';
      msg.style.color=ok?'#159b08':'#c1121f';
      msg.classList.toggle('ok',ok);
      msg.classList.toggle('error',!ok);
    };
    if($('#saveProfile')) $('#saveProfile').onclick=async()=>{
      const button=$('#saveProfile');
      const data=profileDataFromForm(u,d);
      const newPassword=$('#pPassEdit')?.value.trim()||'';
      let photoUploadError='';
      button.disabled=true;
      button.textContent='Сохраняем...';
      showProfileMessage('Сохраняю данные...',true);
      try{
        if(mobileProfilePhotoFile){
          showProfileMessage('Загружаю фото...',true);
          try{ data.photoURL=await uploadMobileProfilePhoto(u,mobileProfilePhotoFile); }
          catch(error){ photoUploadError=error?.message||String(error); }
        }
        const authPatch={};
        if(data.name !== (u.displayName||'')) authPatch.displayName=data.name;
        if(data.photoURL && data.photoURL !== (u.photoURL||'')) authPatch.photoURL=data.photoURL;
        if(Object.keys(authPatch).length) await updateProfile(u,authPatch);
        await setDoc(current.ref,{
          ...data,
          emailVerified:emailConfirmed,
          updatedAt:new Date().toISOString(),
          createdAt:d.createdAt||new Date().toISOString()
        },{merge:true});
        if(newPassword){
          try{
            await updatePassword(u,newPassword);
            try{ await createPasswordChangedNotification(u); }catch(e){ console.warn('Не удалось создать уведомление о смене пароля', e); }
            if($('#pPassEdit')) $('#pPassEdit').value='';
          }catch(error){
            photoUploadError=photoUploadError||'пароль не изменён: '+(error?.message||String(error));
          }
        }
        d={...d,...data,emailVerified:emailConfirmed};
        if(!photoUploadError){
          mobileProfilePhotoFile=null;
          if(photoInput) photoInput.value='';
          if(photoStatus) photoStatus.textContent=data.photoURL?'Фото сохранено.':'Фото ещё не добавлено.';
        }
        document.querySelectorAll('.m-avatar').forEach(avatar=>{
          if(data.photoURL) avatar.innerHTML='<img src="'+escapeHtml(data.photoURL)+'" alt="Фото профиля">';
        });
        showProfileMessage(photoUploadError?'Профиль сохранён, но '+photoUploadError:'Профиль сохранён.',!photoUploadError);
        button.textContent='Сохранено';
        setTimeout(()=>{button.disabled=false;button.textContent='Сохранить изменения';},1200);
      }catch(error){
        console.error('mobile profile save error',error);
        showProfileMessage('Не удалось сохранить профиль: '+(error?.message||String(error)),false);
        button.disabled=false;
        button.textContent='Повторить сохранение';
      }
    };
    if($('#mGetDiscount')) $('#mGetDiscount').onclick=async()=>activateDiscountCard(u,d);
    if($('#resendEmailVerify')) $('#resendEmailVerify').onclick=async()=>{ try{ await sendEmailVerification(u); alert('Письмо подтверждения отправлено.'); }catch(e){ alert('Не удалось отправить письмо: '+(e.message||e)); } };
    if($('#mSendFeedback')) $('#mSendFeedback').onclick=async()=>{ try{ await sendMobileFeedback(u); }catch(e){ alert('Ошибка отправки: '+(e.message||e)); } };
    if($('#pLogout')) $('#pLogout').onclick=async()=>{await signOut(auth);location.href='mobile.html'};
    clearLoader();
  };
  try {
    mobileProfileAuthUnsub = onAuthStateChanged(auth, renderProfileUser);
  } catch(error) {
    console.warn('Не удалось подписаться на Firebase Auth в мобильном профиле', error);
  }
  // onAuthStateChanged can be delayed indefinitely when an old Safari
  // session cannot be restored. Always paint a guest/profile state within a
  // bounded time, while still allowing a later Auth event to replace it.
  waitWithTimeout(() => waitForAuthReady(), 2600, auth.currentUser || null)
    .then(user => {
      if(!profileInitialRenderDone && isCurrentRender()) return renderProfileUser(user || auth.currentUser || null);
      return null;
    })
    .catch(error => {
      console.warn('Не удалось дождаться Firebase Auth в мобильном профиле', error);
      if(!profileInitialRenderDone && isCurrentRender()) renderProfileUser(auth.currentUser || null);
    });
}


let mobileRefreshBusy = false;
let mobileRefreshTimer = 0;
async function refreshCurrentMobilePage(reason='refresh'){
  if(isNotificationDetailPage()) return;
  clearTimeout(mobileRefreshTimer);
  mobileRefreshTimer = setTimeout(async()=>{
    if (mobileRefreshBusy) return;
    mobileRefreshBusy = true;
    try{
      if (auth.currentUser) await loadUserCart(auth.currentUser).catch(()=>{});
      updateCounts();
      if(page==='cart') await renderCart();
      else if(page==='favorites') await renderFavorites();
      else if(page==='catalog') await renderCatalog();
      else if(page==='home') await renderHome();
      else if(['profile','profile-data','discount-card','orders','feedback','notifications'].includes(page)) await renderProfile();
    }catch(e){ console.warn('mobile refresh error', reason, e); }
    finally{ mobileRefreshBusy = false; }
  }, 80);
}

window.autostyleMobileRefresh = refreshCurrentMobilePage;

// The cache layer refreshes products in the background.  A product page can
// therefore render its own document first and fill the related carousel as
// soon as the catalogue snapshot arrives, without waiting for a full catalog
// boot or showing a permanent empty state.
window.addEventListener('autostyle-cache-updated', event => {
  const detail = event.detail || {};
  if (detail.name !== COLLECTIONS.products || !Array.isArray(detail.rows)) return;
  allProducts = detail.rows;
  products = allProducts;
  if (page === 'product' && currentMobileProduct) {
    renderMobileRelated(currentMobileProduct, detail.rows)
      .catch(error => console.warn('Не удалось обновить похожие товары', error));
  }
});

window.addEventListener('autostyle-cart-updated', () => {
  // На мобильной корзине не перерисовываем страницу от snapshot: это и давало моргание и сбивало +/- .
  updateCounts();
});

window.addEventListener('pageshow', event => {
  // На странице корзины не запускаем автообновление: корзина обновляется только по действиям пользователя.
  if(page === 'cart') { updateCounts(); return; }
  refreshCurrentMobilePage(event.persisted ? 'safari-bfcache' : 'pageshow');
});
window.addEventListener('focus', () => { if(page !== 'cart') refreshCurrentMobilePage('focus'); });
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && page !== 'cart') refreshCurrentMobilePage('visible');
});
window.addEventListener('online', () => { if(page !== 'cart') refreshCurrentMobilePage('online'); });

(async()=>{
  try{
    setupMobileChrome();
    await Promise.race([
      waitFavoritesReady(),
      new Promise(resolve => setTimeout(resolve, 1200))
    ]);
    mobileFavoritesBooted = true;
    if(page==='home') await renderHome();
    if(page==='catalog') await renderCatalog();
    if(page==='product') await renderProduct();
    if(page==='cart') await renderCart();
    if(page==='favorites') await renderFavorites();
    if(['profile','profile-data','discount-card','orders','feedback','notifications'].includes(page)) await renderProfile();
    if(['about','contacts','installment','certificates','more'].includes(page)) renderInfoShell(page==='more'?'profile':'home');
  }catch(e){ console.error(e); clearLoader(); }
})();
