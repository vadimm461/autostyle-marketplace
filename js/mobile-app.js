import { auth, db, storage, COLLECTIONS } from './firebase.js';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, updateProfile, updatePassword, sendEmailVerification, RecaptchaVerifier, signInWithPhoneNumber, linkWithPhoneNumber } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { doc, getDoc, setDoc, serverTimestamp, collection, addDoc, getDocs, query, where, orderBy, limit } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getProducts, getCategories, getBanners, getCollectionCached } from './data-cache.js';
import { ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';
import { addUserCartItem, waitUserCartReady, getCurrentUserCart, removeUserCartItem, setUserCartQty, cartQtyCount, loadUserCart, clearUserCart } from './user-cart-store.js';
import { createPasswordChangedNotification, watchNotifications, markNotificationRead, markNotificationsRead, notificationText, fmt } from './notify-service.js';
import { getProfileVerification, profileVerificationMessage } from './auth-core.js';

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
let products = [], categories = [], banners = [], homeBlocks = [], promoCards = [], userNow = null;
let dataPromise = null;
const PAGE_SIZE = 24;
let cart = [];
let favs = JSON.parse(localStorage.getItem('favorites') || '[]');
const page = document.body.dataset.page;
const waitAuthUser = () => new Promise(resolve => {
  if (auth.currentUser) return resolve(auth.currentUser);
  const off = onAuthStateChanged(auth, user => { off(); resolve(user || null); });
});

const HOME_BLOCKS_COLLECTION = COLLECTIONS.homeBlocks || 'autostyle_home_blocks';
const PROMO_CARDS_COLLECTIONS = [...new Set([
  COLLECTIONS.promoCards || 'autostyle_promo_cards',
  'autostyle_horizontal_promo_cards', 'autostyle_promo_cards', 'autostyle_promoCards', 'autostyle_home_cards', 'promoCards', 'homeCards'
].filter(Boolean))];
const whenIdle = fn => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 1600 }) : setTimeout(fn, 60));
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
const safeLoadCollection = async name => { try { return await getCollectionCached(name); } catch(e) { console.warn('Не удалось загрузить', name, e); return []; } };
const safeLoadCollections = async names => {
  const all = [];
  for (const name of names) (await safeLoadCollection(name)).forEach(row => all.push({ ...row, _collection:name }));
  const seen = new Set();
  return all.filter(row => { const k = String(row.key || row.slug || row.id || `${row._collection}:${row.title || row.name || Math.random()}`).trim(); if (seen.has(k)) return false; seen.add(k); return true; });
};
function defaultHomeBlocks(){
  return [
    {id:'new', key:'new', title:'Новинки', order:1, builtin:true},
    {id:'recentlyViewed', key:'recentlyViewed', title:'Недавно просмотренные', order:9999, builtin:true, recent:true},
    {id:'bestsellers', key:'bestsellers', title:'Лидеры продаж', order:3, builtin:true},
    {id:'hot', key:'hot', title:'Горячие предложения', order:4, builtin:true}
  ];
}
function mergeHomeBlocks(custom){
  const byKey = new Map();
  defaultHomeBlocks().forEach(b => byKey.set(b.key, b));
  (custom || []).forEach(b => {
    const key = b.key || b.slug || b.id;
    if (!key) return;
    const base = byKey.get(key) || {};
    byKey.set(key, { ...base, id:b.id || base.id, key, title:b.title || b.name || base.title || key, order:Number(b.order ?? base.order ?? 999), enabled:b.enabled !== false, builtin:base.builtin === true });
  });
  return [...byKey.values()]
    .filter(b => b.enabled !== false)
    .sort((a,b)=>{
      const ar = (bKey(a) === 'recentlyviewed') ? 9999 : Number(a.order ?? 999);
      const br = (bKey(b) === 'recentlyviewed') ? 9999 : Number(b.order ?? 999);
      return ar - br;
    });
}
function isMarkedForHome(p){ return p.showOnHome === true || p.showOnHome === 'true' || p.onHome === true || p.home === true; }
function productSection(p){ return String(p.homeSection || p.homeBlock || p.tag || '').toLowerCase(); }
function bKey(block){ return norm(block && (block.key || block.slug || block.id)); }
function productsForHomeBlock(block){
  const key = norm(block.key);
  const availableProducts = products.filter(available);
  if (block.recent || key === 'recentlyviewed') {
    const rawIds = [
      ...JSON.parse(localStorage.getItem('viewedProducts') || '[]'),
      ...JSON.parse(localStorage.getItem('recentlyViewedProducts') || '[]')
    ];
    const ids = [...new Set(rawIds.map(String).filter(Boolean))];
    const byId = new Map(availableProducts.map(p => [String(p.id), p]));
    return ids.map(id => byId.get(id)).filter(Boolean).slice(0, 12);
  }
  let selected = availableProducts.filter(p => isMarkedForHome(p) && norm(productSection(p)) === key);
  if (selected.length) return selected;
  selected = availableProducts.filter(p => norm(productSection(p)) === key || norm(p.tag) === key);
  if (selected.length) return selected;
  if (key === 'bestsellers' || key === 'best' || key === 'leaders') return availableProducts.filter(p => ['best','bestsellers','leader','leaders'].includes(norm(p.tag))).slice(0,20);
  if (key === 'new') return availableProducts.filter(p => norm(p.tag) === 'new').slice(0,20);
  if (key === 'hot') return availableProducts.filter(isMarkedForHome).concat(availableProducts).filter((p,i,a)=>a.findIndex(x=>x.id===p.id)===i).slice(0,20);
  return availableProducts.filter(p => isMarkedForHome(p)).slice(0,20);
}
function promoLink(c){
  const type = String(c.linkType || c.type || '').toLowerCase();
  const value = c.linkValue || c.value || c.target || '';
  if (type === 'category' && value) return `mobile-catalog.html?category=${encodeURIComponent(value)}`;
  if (type === 'subcategory' && value) return `mobile-catalog.html?category=${encodeURIComponent(value)}`;
  if (type === 'brand' && value) return `mobile-catalog.html?brand=${encodeURIComponent(value)}`;
  if (type === 'page' && value) return appUrl(value);
  return appUrl(c.link || c.url || value || 'mobile-catalog.html');
}
function promoCard(c){
  const image = c.image || c.imageUrl || c.photoUrl || c.photo || '';
  const titleText = escapeHtml(c.title || c.name || 'AutoStyle');
  const imageOnly = c.imageOnly === true || c.mode === 'image' || c.viewMode === 'image' || c.displayMode === 'image' || c.cardMode === 'imageOnly';
  const style = imageOnly && image ? ` style="background-image:url('${String(image).replaceAll("'",'%27')}')"` : '';
  return `<a class="m-promo-card ${imageOnly?'m-promo-image-only':''}" href="${promoLink(c)}"${style}>${(!imageOnly && image) ? `<img loading="lazy" decoding="async" src="${image}" alt="${titleText}">` : ''}${imageOnly?'':`<span><b>${titleText}</b>${c.text || c.description ? `<small>${escapeHtml(c.text || c.description)}</small>` : ''}</span>`}</a>`;
}
function isMobileHorizontalPromo(c){
  const raw = String(c.orientation || c.format || c.layout || c.size || c.variant || c.type || c.mode || c.viewMode || c.displayMode || c.cardMode || '').toLowerCase();
  if (/vertical|portrait|story|stories|reel|tall|square|imageonly/.test(raw)) return false;
  if (c.vertical === true || c.portrait === true || c.story === true || c.imageOnly === true) return false;
  return true;
}
function renderMobileSection(block, list){
  list = (list || []).slice(0, 12);
  const id = `mBlock_${String(block.key).replace(/[^a-zA-Z0-9_-]/g,'_')}`;
  return `<section id="${id}" class="m-section m-home-block" data-block="${block.key}"><div class="m-section-head"><h2>${block.title || block.name || 'Блок'}</h2><a class="m-see" href="mobile-catalog.html">Все</a></div><div class="m-carousel m-home-products">${list.length ? list.map(card).join('') : '<div class="m-empty">Товары для этого блока пока не выбраны.</div>'}</div></section>`;
}
function setupMobileChrome(){
  const top = document.querySelector('.m-top');
  const nav = document.querySelector('.m-bottom-nav');
  let lastY = window.scrollY || 0;
  let ticking = false;
  const apply = () => {
    const y = Math.max(0, window.scrollY || 0);
    const goingDown = y > lastY + 3;
    const goingUp = y < lastY - 3;
    if (top) {
      top.classList.toggle('m-top-compact', y > 28);
      if (y <= 8) top.classList.remove('m-top-hidden');
      else if (goingDown) top.classList.add('m-top-hidden');
      else if (goingUp) top.classList.remove('m-top-hidden');
    }
    if (nav) nav.classList.toggle('m-nav-scrolled', y > 10);
    lastY = y;
    ticking = false;
  };
  const onScroll = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(apply);
    }
  };
  apply();
  window.addEventListener('scroll', onScroll, { passive:true });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
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
const price = p => Number(p.price || 0);
const rawOldPrice = p => Number(p.oldPrice || p.priceOld || p.priceBefore || p.compareAtPrice || 0);
const oldPrice = p => rawOldPrice(p) > price(p) ? rawOldPrice(p) : 0;
const discount = p => {
  const op = oldPrice(p), pr = price(p), manual = Number(p.discount || p.discountPercent || p.discount_percent || p.salePercent || 0);
  if (manual > 0) return manual;
  if (op > pr && pr > 0) return Math.round((op - pr) / op * 100);
  return 0;
};
const available = p => stock(p) > 0;
const installment = p => price(p) >= 199 || p.installment === true || p.installmentAvailable === true;
const monthPay = p => Math.ceil(price(p) / 12);
function save(){ localStorage.setItem('favorites', JSON.stringify(favs)); updateCounts(); }
function updateCounts(){ $$('#mFavCount').forEach(x=>x.textContent=favs.length); waitUserCartReady().then(rows=>{$$('#mCartCount').forEach(x=>x.textContent=cartQtyCount(rows));}).catch(()=>{$$('#mCartCount').forEach(x=>x.textContent='0');}); }
async function addCart(id, btn){ try{ await addUserCartItem(id, 1); if(btn){ const t=btn.textContent; btn.textContent='✓ Добавлено'; setTimeout(()=>btn.textContent=t,900); } updateCounts(); }catch(e){ alert(e?.message || profileVerificationMessage()); if(String(e?.message||'').includes('Подтвердите')) location.href='mobile-profile.html#security'; } }
function toggleFav(id, btn){ favs = favs.includes(id) ? favs.filter(x=>x!==id) : [...favs,id]; save(); if(btn) btn.classList.toggle('active', favs.includes(id)); }
function card(p){
  const d=discount(p), op=oldPrice(p), im=img(p), t=escapeHtml(title(p)), g=escapeHtml(group(p));
  return `<article class="m-card">
    <button class="m-fav ${favs.includes(p.id)?'active':''}" data-fav="${p.id}" type="button">♡</button>${d?`<span class="m-discount">-${d}%</span>`:''}
    <a class="m-card-img" href="${appUrl(`product.html?id=${encodeURIComponent(p.id)}`)}">${im?`<img loading="lazy" decoding="async" src="${im}" alt="${t}">`:'<span>Фото</span>'}</a>
    <a class="m-card-title" href="${appUrl(`product.html?id=${encodeURIComponent(p.id)}`)}">${t}</a>
    <div class="m-group">${g}</div>
    ${installment(p)?`<span class="m-installment">от ${money(monthPay(p))}/мес</span>`:''}
    <div class="m-price"><b>${money(price(p))}</b>${op?`<span class="m-old">${money(op)}</span>`:''}</div>
    <button class="m-cart" data-cart="${p.id}" type="button">В корзину</button>
  </article>`;
}
function bind(scope=document){
  scope.querySelectorAll('[data-cart]').forEach(b=>b.onclick=e=>{e.preventDefault(); addCart(b.dataset.cart,b);});
  scope.querySelectorAll('[data-fav]').forEach(b=>b.onclick=e=>{e.preventDefault(); e.stopPropagation(); toggleFav(b.dataset.fav,b);});
}
function clearLoader(){ const l=$('#mLoader'); if(l) setTimeout(()=>l.remove(),150); }
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

    const photo = document.createElement('span');
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

    const info = document.createElement('span');
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
  const render = async () => {
    const q = input.value.trim();
    if (q.length < 2) { close(); return; }
    await initData().catch(()=>{});
    const nq = norm(q);
    const result = products
      .filter(p => norm(`${title(p)} ${group(p)} ${p.brand || ''} ${p.code || p.article || ''}`).includes(nq))
      .slice(0, 2);

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
  updateCounts();
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
  if(!selected) return { title:'Разделы', chips:pList.slice(0,18), parent:null };
  const selectedCat = findCategoryByName(selected);
  const parent = findParentForCategory(selectedCat) || pList.find(p => norm(catName(p)) === norm(selected)) || null;
  if(!parent) return { title:'Разделы', chips:pList.slice(0,18), parent:null };
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
    dataPromise = Promise.all([
      getProducts(),
      getCategories(),
      getBanners().catch(()=>[]),
      safeLoadCollection(HOME_BLOCKS_COLLECTION),
      safeLoadCollections(PROMO_CARDS_COLLECTIONS)
    ]).then(([p,c,b,h,pc])=>{
      products=(p||[]).filter(available);
      categories=c||[];
      banners=(b||[]).filter(x=>x.enabled!==false).sort((a,b)=>Number(a.order??999)-Number(b.order??999));
      homeBlocks=mergeHomeBlocks(h||[]);
      promoCards=pc||[];
      return { products, categories, banners, homeBlocks, promoCards };
    });
  }
  return dataPromise;
}
async function renderHome(){
  setupShell('home'); await initData();
  const slides=banners.map(b=>({ ...b, image:b.image||b.imageUrl||b.photoUrl||'' })).filter(b=>b.image);
  $('#mHero').innerHTML = slides.length
    ? `<div class="m-hero-slider">${slides.map((b,i)=>`<a class="m-hero-image ${i===0?'active':''}" href="${appUrl(b.link||b.url||'mobile-catalog.html')}" data-m-slide="${i}"><img loading="${i?'lazy':'eager'}" decoding="async" src="${b.image}" alt="${b.title||'AutoStyle'}"></a>`).join('')}${slides.length>1?`<div class="m-hero-dots">${slides.map((_,i)=>`<span class="${i===0?'active':''}" data-m-dot="${i}"></span>`).join('')}</div>`:''}</div>`
    : `<div><span class="m-label">AUTO STYLE MARKET</span><h1>AutoStyle</h1><p>Добавьте главный баннер в админке.</p></div>`;
  if (slides.length > 1) {
    let i=0; const hero=$('#mHero'); const hs=[...hero.querySelectorAll('[data-m-slide]')], dots=[...hero.querySelectorAll('[data-m-dot]')];
    if (window.__asMobileHeroTimer) clearInterval(window.__asMobileHeroTimer);
    window.__asMobileHeroTimer = setInterval(()=>{ i=(i+1)%hs.length; hs.forEach((x,n)=>x.classList.toggle('active',n===i)); dots.forEach((x,n)=>x.classList.toggle('active',n===i)); }, 2800);
    dots.forEach((dot,n)=>dot.onclick=e=>{ e.preventDefault(); i=n; hs.forEach((x,k)=>x.classList.toggle('active',k===i)); dots.forEach((x,k)=>x.classList.toggle('active',k===i)); });
  }
  const mCats = $('#mCats');
  if (mCats) mCats.innerHTML=parentsList().map(c=>`<a class="m-cat" href="mobile-catalog.html?category=${encodeURIComponent(catName(c))}">${catName(c)}</a>`).join('');
  const promoHtml = promoCards.filter(c=>c.enabled!==false).filter(isMobileHorizontalPromo).sort((a,b)=>Number(a.order??999)-Number(b.order??999)).map(promoCard).join('');
  const blocksHtml = homeBlocks.map(block => ({ block, list:productsForHomeBlock(block) })).filter(x => !(x.block.recent && !x.list.length)).map(x => renderMobileSection(x.block, x.list)).join('');
  $('#mHomeDynamic').innerHTML = (promoHtml ? `<section class="m-section"><div class="m-section-head"><h2>Акции и подборки</h2></div><div class="m-promo-row">${promoHtml}</div></section>` : '') + blocksHtml;
  bind(); clearLoader();
}
async function renderCatalog(){
  setupShell('catalog'); await initData();
  const params=new URLSearchParams(location.search), q=params.get('search')||'', selected=params.get('category')||'';
  const pList=parentsList();
  const selectedCat = findCategoryByName(selected);
  const selectedParent = findParentForCategory(selectedCat) || pList.find(p => norm(catName(p)) === norm(selected)) || null;
  $('#mCategory').innerHTML='<option value="">Все категории</option>'+pList.map(p=>`<option value="${catName(p)}" ${(selectedParent && norm(catName(selectedParent))===norm(catName(p)))?'selected':''}>${catName(p)}</option>`).join('');
  $('#mCategory').onchange=e=>{location.href=e.target.value?`mobile-catalog.html?category=${encodeURIComponent(e.target.value)}`:'mobile-catalog.html'};
  const chipData = categoryChipsForSelection(selected);
  const chipsTitle = document.querySelector('[data-m-catalog-chips-title]') || document.querySelector('.m-section-head h2');
  if (chipsTitle) chipsTitle.textContent = chipData.title;
  $('#mCatChips').innerHTML=(chipData.chips || []).map(c=>`<a class="m-cat ${norm(selected)===norm(catName(c))?'active':''}" href="mobile-catalog.html?category=${encodeURIComponent(catName(c))}">${selectedParent && catId(c)!==catId(selectedParent) ? shortChild(c, selectedParent) : catName(c)}</a>`).join('');
  $('#mFilterSearch').value=q;
  $('#mFilterSearch').addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); location.href=`mobile-catalog.html?search=${encodeURIComponent(e.target.value.trim())}`; }});
  let list=products.filter(p=>productInCategory(p,selected));
  if(q) list=list.filter(p=>(title(p)+' '+group(p)).toLowerCase().includes(q.toLowerCase()));
  $('#mCatalogTitle').textContent = selected ? selected : (q ? `Поиск: ${escapeHtml(q)}` : 'Каталог товаров');
  $('#mCatalogCount').textContent = `${list.length} товаров`;
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
  setupShell('catalog'); await initData();
  const id=new URLSearchParams(location.search).get('id'); const p=products.find(x=>String(x.id)===String(id));
  if(!p){ $('#mProduct').innerHTML='<div class="m-empty">Товар не найден</div>'; clearLoader(); return; }
  const im=img(p), d=discount(p), op=oldPrice(p);
  let viewed=JSON.parse(localStorage.getItem('viewedProducts')||'[]').filter(x=>x!==p.id); viewed.unshift(p.id); localStorage.setItem('viewedProducts',JSON.stringify(viewed.slice(0,30)));
  $('#mProduct').innerHTML=`<a class="m-btn" href="mobile-catalog.html?category=${encodeURIComponent(group(p))}">← Вернуться в каталог</a>
    <div class="m-product-layout"><div class="m-photo-box"><div class="m-photo">${im?`<img loading="eager" decoding="async" src="${im}" alt="${escapeHtml(title(p))}">`:'<span>Фото</span>'}</div></div>
    <div class="m-info"><div class="m-breadcrumb"><a href="mobile.html">Главная</a> / <a href="mobile-catalog.html">Каталог</a> / <a href="mobile-catalog.html?category=${encodeURIComponent(group(p))}">${escapeHtml(group(p))}</a></div><h1>${escapeHtml(title(p))}</h1><a class="m-tag" href="mobile-catalog.html?category=${encodeURIComponent(group(p))}">${escapeHtml(group(p))}</a>${d?` <span class="m-tag" style="background:#ffecec;color:#e3342f">Скидка ${d}%</span>`:''}
    <div class="m-buybox"><div class="m-price-line"><div class="m-big-price">${money(price(p))}</div>${op?`<span class="m-old">${money(op)}</span>`:''}</div>${installment(p)?`<span class="m-installment">Рассрочка от ${money(monthPay(p))} в мес. на 12 мес.</span>`:''}<span class="m-stock">В наличии: ${stock(p)}</span>
    <div class="m-buy-actions"><button class="m-action cart" data-cart="${p.id}">В корзину</button><button class="m-action fav ${favs.includes(p.id)?'active':''}" data-fav="${p.id}">♡ ${favs.includes(p.id)?'В избранном':'В избранное'}</button></div></div></div></div>
    <section class="m-desc m-collapsed" id="mProductDesc"><div class="m-desc-head"><h2>Описание</h2><button class="m-desc-toggle" id="mDescToggle" type="button">Показать</button></div><p>${escapeHtml(p.description || 'Описание товара пока не добавлено.')}</p></section>
    <section class="m-specs"><h2>Характеристики</h2><div class="m-spec-row"><span>Название</span><b>${escapeHtml(title(p))}</b></div><div class="m-spec-row"><span>Группа</span><b><a href="mobile-catalog.html?category=${encodeURIComponent(group(p))}">${escapeHtml(group(p))}</a></b></div><div class="m-spec-row"><span>Остаток</span><b>${stock(p)}</b></div><div class="m-spec-row"><span>Цена</span><b>${money(price(p))}</b></div></section>
    <section class="m-related"><div class="m-section-head"><h2>Похожие товары</h2><a class="m-see" href="mobile-catalog.html?category=${encodeURIComponent(group(p))}">Все</a></div><div class="m-carousel">${products.filter(x=>x.id!==p.id&&group(x)===group(p)).slice(0,12).map(card).join('')||'<div class="m-empty">Похожих товаров пока нет</div>'}</div></section>`;
  bind($('#mProduct'));
  const desc = $('#mProductDesc'), descBtn = $('#mDescToggle');
  if (desc && descBtn) descBtn.onclick = () => { const closed = desc.classList.toggle('m-collapsed'); descBtn.textContent = closed ? 'Показать' : 'Скрыть'; };
  clearLoader();
}
const MOBILE_PAYMENT_KEY = 'as_mobile_payment_method';
const MOBILE_DISCOUNT_KEY = 'as_mobile_discount_card_value';
const MOBILE_CART_SELECTED_KEY = 'as_mobile_cart_selected_ids';
function readMobileCartSelected(){
  try { return new Set(JSON.parse(localStorage.getItem(MOBILE_CART_SELECTED_KEY) || '[]').map(String)); }
  catch(_) { return new Set(); }
}
function writeMobileCartSelected(ids){
  localStorage.setItem(MOBILE_CART_SELECTED_KEY, JSON.stringify([...new Set([...ids].map(String))]));
}
function syncMobileSelection(rows){
  const ids = rows.map(({product}) => String(product.id));
  let selected = readMobileCartSelected();
  selected = new Set([...selected].filter(id => ids.includes(id)));
  if (!selected.size && ids.length) selected = new Set(ids);
  writeMobileCartSelected(selected);
  return selected;
}
function selectedMobileCartRows(rows){
  const selected = syncMobileSelection(rows);
  return rows.filter(({product}) => selected.has(String(product.id)));
}
function selectedMobilePayment(){ return localStorage.getItem(MOBILE_PAYMENT_KEY) || 'card'; }
function mobilePaymentTitle(value){ return value === 'installment' ? 'Рассрочка' : 'Оплата картой'; }
function setSelectedMobilePayment(value){ localStorage.setItem(MOBILE_PAYMENT_KEY, value === 'installment' ? 'installment' : 'card'); }
function calcMobileDiscount(total, value){
  const code = String(value || '').replace(/\s+/g,'').trim();
  if(!code) return 0;
  return Math.min(Math.round(total * 0.03), total); // карта даёт 3%, точный процент можно поменять в одном месте
}
async function renderCart(){
  setupShell('cart'); await initData();
  const user = await waitAuthUser();
  if(!user){
    $('#mCartList').innerHTML = `<div class="m-empty"><b>Войдите в аккаунт</b><br>Корзина сохраняется в профиле и доступна после входа.<br><br><a class="m-primary" href="mobile-profile.html">Войти</a></div>`;
    $('#mTotal').textContent = money(0); clearLoader(); return;
  }
  const check = await getProfileVerification(user);
  if(!check.verified){
    $('#mCartList').innerHTML = `<div class="m-empty"><b>Подтвердите профиль</b><br>${profileVerificationMessage()}<br><br><a class="m-primary" href="mobile-profile.html#security">Подтвердить профиль</a></div>`;
    $('#mTotal').textContent = money(0); clearLoader(); return;
  }
  await loadUserCart(user).catch(()=>{});
  const cartRows = await waitUserCartReady();
  const byId=new Map(products.map(p=>[String(p.id),p]));
  const rows=cartRows.map(item=>({ item, product:byId.get(String(item.id || item.productId)) })).filter(x=>x.product);
  const selectedIds = syncMobileSelection(rows);
  const selectedRows = rows.filter(x => selectedIds.has(String(x.product.id)));
  const subtotal=selectedRows.reduce((s,x)=>s+price(x.product)*(Number(x.item.qty||1)||1),0);
  const discountValue = localStorage.getItem(MOBILE_DISCOUNT_KEY) || '';
  const discountSum = calcMobileDiscount(subtotal, discountValue);
  const total = Math.max(0, subtotal - discountSum);
  const payment = selectedMobilePayment();
  const allSelected = rows.length > 0 && selectedRows.length === rows.length;
  $('#mCartList').innerHTML = rows.length ? `<div class="m-cart-selectbar">
      <label class="m-check"><input id="mSelectAllCart" type="checkbox" ${allSelected ? 'checked' : ''}><span></span><b>Выбрать все</b></label>
      <small>Выбрано: ${selectedRows.length} из ${rows.length}</small>
    </div><div class="m-cart-panel">${rows.map(({item,product:p})=>{
    const qty = Number(item.qty||1)||1;
    const checked = selectedIds.has(String(p.id));
    return `<article class="m-cart-row ${checked ? 'm-cart-row-selected' : ''}">
      <label class="m-cart-pick" aria-label="Выбрать товар"><input class="mCartPick" type="checkbox" data-pick="${p.id}" ${checked ? 'checked' : ''}><span></span></label>
      <a class="m-list-img" href="mobile-product.html?id=${encodeURIComponent(p.id)}">${img(p)?`<img loading="lazy" decoding="async" src="${img(p)}" alt="${escapeHtml(title(p))}">`:'Фото'}</a>
      <div class="m-cart-info">
        <div class="m-cart-title">${escapeHtml(title(p))}</div>
        <div class="m-cart-meta">${escapeHtml(group(p))}</div>
        <div class="m-cart-line"><strong class="m-cart-price">${money(price(p)*qty)}</strong><div class="m-qty-stepper"><button data-minus="${p.id}" type="button">−</button><span>${qty}</span><button data-plus="${p.id}" type="button">+</button></div></div>
        <button class="m-danger" data-remove="${p.id}" type="button">Удалить</button>
      </div>
    </article>`;
  }).join('')}</div>` : '<div class="m-empty">Корзина пустая</div>';
  $('#mTotal').textContent=money(total);
  let checkoutBox = $('#mCheckoutBox');
  if(!checkoutBox){
    const totalBox = document.querySelector('.m-total');
    totalBox?.insertAdjacentHTML('afterend', `<section id="mCheckoutBox" class="m-checkout-box">
      <div class="m-pay-tabs">
        <button id="mPayCard" type="button" data-pay="card">Картой</button>
        <button id="mPayInstallment" type="button" data-pay="installment">Рассрочка</button>
      </div>
      <div class="m-discount-apply"><input id="mDiscountCardInput" autocomplete="off" placeholder="Скидочная карта"><button id="mApplyDiscount" type="button">Применить</button></div>
      <p id="mCheckoutNote" class="m-checkout-note"></p>
      <button id="mCheckoutBtn" class="m-primary m-checkout" type="button">Оформить выбранное</button>
    </section>`);
    checkoutBox = $('#mCheckoutBox');
  }
  $('#mDiscountCardInput') && ($('#mDiscountCardInput').value = discountValue);
  $$('#mCheckoutBox [data-pay]').forEach(b=>b.classList.toggle('active', b.dataset.pay === payment));
  const note = $('#mCheckoutNote');
  if(note) note.textContent = `${mobilePaymentTitle(payment)} · выбрано ${selectedRows.length} товар${selectedRows.length===1?'':'ов'}${discountSum ? ` · скидка ${money(discountSum)}` : ''}${payment === 'installment' ? ' · скидочная карта на рассрочку не применяется' : ''}`;
  if($('#mCheckoutBtn')){ $('#mCheckoutBtn').disabled = !selectedRows.length; $('#mCheckoutBtn').onclick = createMobileOrder; }
  $('#mSelectAllCart') && ($('#mSelectAllCart').onchange=e=>{ const next = new Set(e.target.checked ? rows.map(({product})=>String(product.id)) : []); writeMobileCartSelected(next); renderCart(); });
  $$('.mCartPick').forEach(input=>input.onchange=()=>{ const selected = readMobileCartSelected(); const id=String(input.dataset.pick||''); if(input.checked) selected.add(id); else selected.delete(id); writeMobileCartSelected(selected); renderCart(); });
  $$('#mCheckoutBox [data-pay]').forEach(b=>b.onclick=()=>{ setSelectedMobilePayment(b.dataset.pay); if(b.dataset.pay === 'installment') localStorage.removeItem(MOBILE_DISCOUNT_KEY); renderCart(); });
  $('#mApplyDiscount') && ($('#mApplyDiscount').onclick=()=>{ const v=($('#mDiscountCardInput')?.value||'').trim(); if(selectedMobilePayment()==='installment'){ alert('Скидочная карта не применяется при рассрочке.'); localStorage.removeItem(MOBILE_DISCOUNT_KEY); } else if(v){ localStorage.setItem(MOBILE_DISCOUNT_KEY, v); } else { localStorage.removeItem(MOBILE_DISCOUNT_KEY); } renderCart(); });
  $$('[data-remove]').forEach(b=>b.onclick=async()=>{await removeUserCartItem(b.dataset.remove); const selected=readMobileCartSelected(); selected.delete(String(b.dataset.remove)); writeMobileCartSelected(selected); await renderCart();});
  $$('[data-plus]').forEach(b=>b.onclick=async()=>{
    const rowEl = b.closest('.m-cart-row');
    const qtyEl = b.parentElement?.querySelector('span');
    const row=getCurrentUserCart().find(i=>String(i.id||i.productId)===String(b.dataset.plus));
    const next = Number(qtyEl?.textContent || row?.qty || 1) + 1;
    if(qtyEl) qtyEl.textContent = String(next);
    b.disabled = true;
    try{ await setUserCartQty(b.dataset.plus,next); await loadUserCart(auth.currentUser).catch(()=>{}); }
    finally{ b.disabled = false; await renderCart(); }
  });
  $$('[data-minus]').forEach(b=>b.onclick=async()=>{
    const qtyEl = b.parentElement?.querySelector('span');
    const row=getCurrentUserCart().find(i=>String(i.id||i.productId)===String(b.dataset.minus));
    const next=Number(qtyEl?.textContent || row?.qty || 1)-1;
    if(qtyEl) qtyEl.textContent = String(Math.max(next,0));
    b.disabled = true;
    try{ if(next<=0) await removeUserCartItem(b.dataset.minus); else await setUserCartQty(b.dataset.minus,next); await loadUserCart(auth.currentUser).catch(()=>{}); }
    finally{ b.disabled = false; await renderCart(); }
  });
  clearLoader();
}

async function renderFavorites(){
  setupShell('fav'); await initData(); const list=products.filter(p=>favs.includes(p.id));
  $('#mFavGrid').innerHTML=list.map(card).join('')||'<div class="m-empty">В избранном пока пусто</div>'; bind(); clearLoader();
}

let mobileCheckoutBusy = false;
async function createMobileOrder(){
  const user = await waitAuthUser();
  if(!user){ alert('Войдите в аккаунт, чтобы оформить заказ.'); location.href='mobile-profile.html'; return; }
  const check = await getProfileVerification(user);
  if(!check.verified){ alert(profileVerificationMessage()); location.href='mobile-profile.html#security'; return; }
  if(mobileCheckoutBusy) return;
  mobileCheckoutBusy = true;
  const btn = $('#mCheckoutBtn');
  if(btn){ btn.disabled = true; btn.textContent = 'Создаём заказ...'; }
  try{
    await loadUserCart(user);
    const cartRows = getCurrentUserCart();
    const byId = new Map(products.map(p=>[String(p.id),p]));
    let rows = cartRows.map(item=>({ item, product:byId.get(String(item.id || item.productId)) })).filter(x=>x.product);
    rows = selectedMobileCartRows(rows);
    if(!rows.length){ alert('Выберите товары для оформления.'); await renderCart(); return; }
    const stockProblem = rows.find(({item, product}) => stock(product) <= 0 || (Number(item.qty||1)||1) > stock(product));
    if(stockProblem){ alert(`Нельзя оформить заказ: «${title(stockProblem.product)}». В корзине больше, чем в наличии.`); await renderCart(); return; }
    const profile = await getUserDoc(user.uid).catch(()=>({data:{}}));
    const d = profile.data || {};
    const items = rows.map(({item, product:p})=>{ const qty=Number(item.qty||1)||1; const pr=price(p); return { productId:String(p.id), title:title(p), group:group(p), image:img(p), price:pr, qty, lineTotal:pr*qty }; });
    const subtotal = items.reduce((sum,i)=>sum+Number(i.lineTotal||0),0);
    const paymentMethod = selectedMobilePayment();
    const discountCardNumber = paymentMethod === 'installment' ? '' : (localStorage.getItem(MOBILE_DISCOUNT_KEY) || '').trim();
    const discountTotal = calcMobileDiscount(subtotal, discountCardNumber);
    const total = Math.max(0, subtotal - discountTotal);
    const totalQty = items.reduce((sum,i)=>sum+Number(i.qty||0),0);
    const orderNumber = `AS-${Date.now().toString().slice(-8)}`;
    await addDoc(collection(db, COLLECTIONS.orders || 'autostyle_orders'), {
      orderNumber, status:'new', statusTitle:'Новый', source:'mobile-cart',
      userId:user.uid, uid:user.uid, userEmail:user.email || '', userName:d.name || user.displayName || '', userPhone:d.phone || '', userCar:d.car || d.carText || '',
      items, subtotal, discountTotal, discountCardNumber, total, totalQty,
      paymentMethod, paymentMethodTitle:mobilePaymentTitle(paymentMethod),
      createdAt:serverTimestamp(), createdAtText:new Date().toISOString()
    });
    const selectedIds = new Set(items.map(i => String(i.productId)));
    const remainingCart = getCurrentUserCart().filter(i => !selectedIds.has(String(i.id || i.productId)));
    await Promise.all([...selectedIds].map(id => removeUserCartItem(id)));
    writeMobileCartSelected(new Set(remainingCart.map(i => String(i.id || i.productId))));
    localStorage.removeItem(MOBILE_DISCOUNT_KEY);
    alert(`Заказ ${orderNumber} создан и отправлен в админку.`);
    location.href='mobile-orders.html';
  }catch(e){ console.error('mobile order create error', e); alert('Не удалось оформить заказ: '+(e?.message || e)); }
  finally{ mobileCheckoutBusy = false; if(btn){ btn.disabled=false; btn.textContent='Оформить заказ'; } }
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
    photoURL:$('#pPhoto')?.value.trim() || old.photoURL || u.photoURL || ''
  };
}
function renderDiscountCard(u, data={}){
  const card=data.discountCard || {}; const active=Boolean(card.active || data.discountCardActive || data.active === true);
  const complete=isProfileCompleteData({...data,email:data.email||u.email,name:data.name||u.displayName});
  const number=card.number || data.discountCardNumber || data.number || makeDiscountCardNumber(u.uid);
  return `<section class="m-discount-card ${active?'active':'locked'}"><div class="m-discount-visual"><div class="m-discount-logo">AS <span>AUTOSTYLE</span></div><em>${data.name||u.displayName||u.email||'AutoStyle'}</em><div class="m-discount-barcode">${active?ean13Svg(number):'<div class="m-discount-lock">Заполните профиль</div>'}</div><small>${active?number:'Карта пока не активна'}</small></div><div class="m-discount-info"><h2>${active?'Скидочная карта активна':'Скидочная карта'}</h2><p>${active?'Карта уже активна. Предложение об активации больше не показывается.':'Заполните имя, телефон, город, адрес и автомобиль, затем получите карту.'}</p>${active?'':`<button id="mGetDiscount" class="m-primary" style="width:100%">${complete?'Получить скидочную карту':'Заполнить профиль'}</button>`}<a class="m-btn" style="width:100%;margin-top:10px" href="mobile-cart.html">Перейти в корзину</a></div></section>`;
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
  return orders.map(o=>{ const items = Array.isArray(o.items) ? o.items : []; return `<article class="m-order-card"><div><b>Заказ ${escapeHtml(o.orderNumber || o.number || o.id || '')}</b><small>${formatDate(o.createdAt || o.createdAtText)}</small>${items.length?`<em>${items.slice(0,3).map(i=>escapeHtml(i.title||i.name||'Товар')).join(', ')}${items.length>3?'…':''}</em>`:''}</div><span>${escapeHtml(orderStatusText(o))}</span><strong>${money(o.total || o.totalPrice || o.sum || 0)}</strong></article>`; }).join('');
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
  return ({'password':'Email/пароль','phone':'Телефон / SMS'})[id] || id;
}
function userProviders(u){ return (u?.providerData || []).map(x => x.providerId).filter(Boolean).filter(id => id === 'password' || id === 'phone'); }
async function saveAuthProfile(u, extra={}){
  if(!u) return;
  const current = await getUserDoc(u.uid);
  await setDoc(current.ref, {
    uid:u.uid,
    name: extra.name || current.data.name || u.displayName || '',
    email: extra.email || current.data.email || u.email || '',
    phone: extra.phone || current.data.phone || u.phoneNumber || '',
    photoURL: extra.photoURL || current.data.photoURL || u.photoURL || '',
    providers:userProviders(u),
    emailVerified:Boolean(u.emailVerified),
    phoneVerified:Boolean(u.phoneNumber),
    lastLoginAt:new Date().toISOString(),
    updatedAt:new Date().toISOString(),
    createdAt:current.data.createdAt || new Date().toISOString(),
    role:current.data.role || 'user'
  }, { merge:true });
}
function ensureRecaptcha(containerId='mRecaptcha'){
  let el = document.getElementById(containerId);
  if(!el){ el = document.createElement('div'); el.id = containerId; document.body.appendChild(el); }
  if(!window.mRecaptchaVerifier) window.mRecaptchaVerifier = new RecaptchaVerifier(auth, containerId, { size:'invisible' });
  return window.mRecaptchaVerifier;
}
async function startPhoneAuth(phone, link=false){
  const verifier = ensureRecaptcha();
  if(link && auth.currentUser){
    window.mPhoneConfirmation = await linkWithPhoneNumber(auth.currentUser, phone, verifier);
  } else {
    window.mPhoneConfirmation = await signInWithPhoneNumber(auth, phone, verifier);
  }
  alert('SMS-код отправлен.');
}
async function confirmPhoneAuth(code){
  if(!window.mPhoneConfirmation) throw new Error('Сначала отправьте SMS-код.');
  const res = await window.mPhoneConfirmation.confirm(code);
  await saveAuthProfile(auth.currentUser || res.user);
  alert('Телефон подтверждён.');
  location.reload();
}
async function registerByEmail(){
  const name = $('#pRegName')?.value.trim() || '';
  const email = $('#pRegEmail')?.value.trim() || '';
  const pass = $('#pRegPass')?.value || '';
  const res = await createUserWithEmailAndPassword(auth, email, pass);
  await updateProfile(res.user, { displayName:name });
  await sendEmailVerification(res.user);
  await saveAuthProfile(res.user, { name, email });
  alert('Аккаунт создан. Письмо подтверждения отправлено на почту.');
  location.reload();
}

function initials(u){const base=(u?.displayName||u?.email||'AS').trim();return base.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'AS'}

let mobileNotificationsUnsub = null;
function renderMobileNotificationList(root, data){
  const list = data.list || [];
  const readIds = data.readIds || new Set();
  const selected = new URLSearchParams(location.search).get('id') || '';
  const open = selected ? list.find(n => n.id === selected) : null;
  if(open){
    root.innerHTML = `<section class="m-profile-pane"><a class="m-btn" href="mobile-notifications.html">← Все уведомления</a><h2>${escapeHtml(open.title || 'Уведомление')}</h2><p class="m-group">${escapeHtml(fmt(open.createdAt || open.createdAtLocal))}</p><div class="m-notification-body">${open.html || `<p>${escapeHtml(notificationText(open))}</p>`}</div></section>`;
    markNotificationRead(auth.currentUser, open.id).catch(()=>{});
    return;
  }
  root.innerHTML = `<section class="m-profile-pane"><h2>Уведомления</h2>${data.unread ? `<button id="mReadAllNotifications" class="m-btn" type="button" style="width:100%;margin-bottom:10px">Прочитать все</button>` : ''}<div class="m-notifications-list">${list.length ? list.map(n=>`<a class="m-notification-item ${readIds.has(n.id)?'is-read':'is-unread'}" href="mobile-notifications.html?id=${encodeURIComponent(n.id)}"><b>${!readIds.has(n.id)?'<i></i>':''}${escapeHtml(n.title || 'Уведомление')}</b><span>${escapeHtml(notificationText(n))}</span><small>${escapeHtml(fmt(n.createdAt || n.createdAtLocal))}</small></a>`).join('') : '<div class="m-empty">Пока уведомлений нет.</div>'}</div></section>`;
  const readAll = $('#mReadAllNotifications');
  if(readAll) readAll.onclick = async()=>{ await markNotificationsRead(auth.currentUser, list.map(n=>n.id)); };
}
function startMobileNotifications(user, root){
  if(mobileNotificationsUnsub){ try{ mobileNotificationsUnsub(); }catch(e){} mobileNotificationsUnsub = null; }
  if(!user){ root.innerHTML = `<div class="m-empty"><b>Войдите в аккаунт</b><br>Уведомления доступны после входа.<br><br><a class="m-primary" href="mobile-profile.html">Войти</a></div>`; return; }
  root.innerHTML = '<div class="m-empty">Загружаем уведомления...</div>';
  mobileNotificationsUnsub = watchNotifications(user, data => renderMobileNotificationList(root, data));
}

async function renderProfile(){
  setupShell('profile');
  onAuthStateChanged(auth, async u=>{
    userNow=u; const box=$('#mProfileBox');
    if(!u){
      box.innerHTML=`<h1>Профиль</h1><p class="m-group">Войдите по почте, зарегистрируйтесь или используйте SMS. После входа можно подтвердить почту и привязать телефон.</p>
      <div class="m-auth-box"><h2>Email</h2><input id="pEmail" class="m-input" placeholder="Email"><input id="pPass" class="m-input" type="password" placeholder="Пароль"><button id="pLogin" class="m-primary" style="width:100%;margin-top:10px">Войти</button></div>
      <div class="m-auth-box"><h2>Регистрация</h2><input id="pRegName" class="m-input" placeholder="Имя"><input id="pRegEmail" class="m-input" type="email" placeholder="Email"><input id="pRegPass" class="m-input" type="password" placeholder="Пароль от 6 символов"><button id="pRegister" class="m-primary" style="width:100%;margin-top:10px">Создать и подтвердить почту</button></div>
      <div class="m-auth-box"><h2>Вход по SMS</h2><input id="pPhoneLogin" class="m-input" placeholder="Телефон: +373..."><button id="pSendSms" class="m-btn" style="width:100%;margin-top:10px">Получить SMS-код</button><input id="pSmsCode" class="m-input" placeholder="Код из SMS"><button id="pConfirmSms" class="m-primary" style="width:100%;margin-top:10px">Подтвердить SMS</button><div id="mRecaptcha"></div></div>
      <a class="m-btn" style="width:100%;margin-top:10px" href="mobile.html">На главную</a><div class="m-link-grid" style="margin-top:16px"><a href="mobile-contacts.html">Контакты</a><a href="mobile-installment.html">Рассрочка</a><a href="mobile-certificates.html">Сертификаты</a><a href="mobile-about.html">Про нас</a></div>`;
      $('#pLogin').onclick=async()=>{ try{ const res=await signInWithEmailAndPassword(auth,$('#pEmail').value.trim(),$('#pPass').value); await saveAuthProfile(res.user); location.reload(); }catch(e){ alert('Ошибка входа: '+(e.message||e)); } };
      $('#pRegister').onclick=async()=>{ try{ await registerByEmail(); }catch(e){ alert('Ошибка регистрации: '+(e.message||e)); } };
      $('#pSendSms').onclick=async()=>{ try{ await startPhoneAuth($('#pPhoneLogin').value.trim()); }catch(e){ alert('Не удалось отправить SMS: '+(e.message||e)); } };
      $('#pConfirmSms').onclick=async()=>{ try{ await confirmPhoneAuth($('#pSmsCode').value.trim()); }catch(e){ alert('Ошибка SMS-подтверждения: '+(e.message||e)); } };
      clearLoader(); return;
    }
    const current=await getUserDoc(u.uid);
    let d=current.data || {};
    const cardSnap = await getDoc(doc(db, COLLECTIONS.discountCards || 'autostyle_discount_cards', u.uid)).catch(()=>null);
    if(cardSnap && cardSnap.exists()) d = { ...d, discountCard:{ ...(d.discountCard||{}), ...cardSnap.data(), active: cardSnap.data().active !== false }, discountCardActive: cardSnap.data().active !== false, discountCardNumber: cardSnap.data().number || d.discountCardNumber };
    const myOrders = await loadMobileOrders(u).catch(()=>[]);
    const profileTop = `<div class="m-profile-head m-profile-head-dark"><div class="m-avatar">${(d.photoURL||u.photoURL)?`<img src="${d.photoURL||u.photoURL}">`:initials({displayName:d.name||u.displayName,email:d.email||u.email})}</div><div class="m-profile-user"><h1>${d.name||u.displayName||'Профиль'}</h1><div>${d.email||u.email||''}</div></div><span class="m-profile-ok">Профиль подтверждён</span></div>`;
    const profileMenu = `<div class="m-profile-main-title"><h1>Главная профиля</h1><p>Все основные разделы в одном месте.</p></div><div class="m-profile-tiles">
      <a class="m-profile-tile tile-green" href="mobile-profile-data.html"><span class="m-tile-ico"><img src="assets/icons/user.svg" alt=""></span><b>Профиль</b><small>Данные и фото</small></a>
      <a class="m-profile-tile tile-red" href="mobile-discount-card.html"><span class="m-tile-ico"><img src="assets/icons/card.svg" alt=""></span><b>Скидочная карта</b><small>Бонусы и скидки</small></a>
      <a class="m-profile-tile tile-dark" href="mobile-orders.html"><span class="m-tile-ico"><img src="assets/icons/package.svg" alt=""></span><b>Мои заказы</b><small>История покупок</small></a>
      <a class="m-profile-tile" href="mobile-favorites.html"><span class="m-tile-ico"><img src="assets/icons/heart.svg" alt=""></span><b>Избранное</b><small>Сохранённые товары</small></a>
      <a class="m-profile-tile" href="mobile-cart.html"><span class="m-tile-ico"><img src="assets/icons/cart.svg" alt=""></span><b>Корзина</b><small>Оформление заказа</small></a>
      <a class="m-profile-tile" href="mobile-profile-data.html#security"><span class="m-tile-ico"><img src="assets/icons/settings.svg" alt=""></span><b>Вход</b><small>Почта и телефон</small></a>
    </div><div class="m-profile-pills">
      <a href="mobile-discount-card.html">% <span>Скидки</span></a>
      <a href="mobile-notifications.html">⌕ <span>Уведомления</span></a>
      <a href="mobile-feedback.html">▢ <span>Быстрый заказ</span></a>
    </div>`;
    let body = profileMenu;
    if(page === 'profile-data') body = `<section id="account" class="m-profile-pane"><h2>Личные данные</h2><input id="pName" class="m-input" value="${d.name||u.displayName||''}" placeholder="Имя"><input id="pEmailEdit" class="m-input" value="${d.email||u.email||''}" placeholder="Email"><input id="pPhone" class="m-input" value="${d.phone||u.phoneNumber||''}" placeholder="Телефон"><input id="pCity" class="m-input" value="${d.city||''}" placeholder="Город"><input id="pAddress" class="m-input" value="${d.address||''}" placeholder="Адрес"><input id="pCar" class="m-input" value="${d.car||d.carText||''}" placeholder="Автомобиль"><input id="pPhoto" class="m-input" value="${d.photoURL||u.photoURL||''}" placeholder="Фото URL"><input id="pPassEdit" class="m-input" type="password" placeholder="Новый пароль"><button id="saveProfile" class="m-primary" style="width:100%;margin-top:10px">Сохранить профиль</button></section><section id="security" class="m-profile-pane"><h2>Вход и подтверждение</h2><p class="m-group">Подключено: ${userProviders(u).map(providerTitle).join(', ') || 'не определено'} · Почта ${u.emailVerified?'подтверждена':'не подтверждена'} · Телефон ${u.phoneNumber?'подтверждён':'не привязан'}</p><button id="resendEmailVerify" class="m-btn" style="width:100%;margin-top:10px">Отправить подтверждение почты</button><div class="m-auth-box"><input id="pLinkPhone" class="m-input" value="${u.phoneNumber||d.phone||''}" placeholder="Телефон: +373..."><button id="pLinkSms" class="m-btn" style="width:100%;margin-top:10px">Отправить SMS для привязки</button><input id="pLinkCode" class="m-input" placeholder="Код из SMS"><button id="pConfirmLinkSms" class="m-primary" style="width:100%;margin-top:10px">Подтвердить и привязать</button><div id="mRecaptcha"></div></div></section>`;
    if(page === 'discount-card') body = `<section id="discount-card" class="m-profile-pane">${renderDiscountCard(u,d)}</section>`;
    if(page === 'orders') body = `<section id="orders" class="m-profile-pane"><h2>Мои заказы</h2><div class="m-orders-list">${renderOrdersList(myOrders)}</div></section>`;
    if(page === 'feedback') body = `<section id="feedback" class="m-profile-pane m-feedback-pane"><h2>Предложения и жалобы</h2><p class="m-group">Напишите администрации сайта. Можно прикрепить фото.</p><select id="mFeedbackType" class="m-input"><option value="proposal">Предложение</option><option value="complaint">Жалоба</option><option value="question">Вопрос</option></select><input id="mFeedbackSubject" class="m-input" placeholder="Тема обращения"><textarea id="mFeedbackText" class="m-input m-textarea" placeholder="Опишите обращение"></textarea><label class="m-file-input"><input id="mFeedbackPhoto" type="file" accept="image/*">📷 Прикрепить фото</label><button id="mSendFeedback" class="m-primary" style="width:100%;margin-top:10px">Отправить администрации</button></section>`;
    if(page === 'notifications') body = `<section class="m-profile-pane" id="mMobileNotifications"><h2>Уведомления</h2><div class="m-empty">Загружаем...</div></section>`;
    box.innerHTML = `${profileTop}${body}`;
    if(page === 'notifications') startMobileNotifications(u, $('#mMobileNotifications'));
    $$('.m-profile-pane .m-input').forEach(el=>el.style.marginTop='10px');
    if($('#saveProfile')) $('#saveProfile').onclick=async()=>{ const data=profileDataFromForm(u,d); await updateProfile(u,{displayName:data.name,photoURL:data.photoURL||null}); if($('#pPassEdit').value.trim()){ await updatePassword(u,$('#pPassEdit').value.trim()); try{ await createPasswordChangedNotification(u); }catch(e){ console.warn('Не удалось создать уведомление о смене пароля', e); } } await setDoc(current.ref,{...data,updatedAt:new Date().toISOString(),createdAt:d.createdAt||new Date().toISOString(),role:d.role||'user'},{merge:true}); alert('Профиль сохранён'); location.reload(); };
    if($('#mGetDiscount')) $('#mGetDiscount').onclick=async()=>activateDiscountCard(u,d);
    if($('#resendEmailVerify')) $('#resendEmailVerify').onclick=async()=>{ try{ await sendEmailVerification(u); alert('Письмо подтверждения отправлено.'); }catch(e){ alert('Не удалось отправить письмо: '+(e.message||e)); } };
    if($('#pLinkSms')) $('#pLinkSms').onclick=async()=>{ try{ await startPhoneAuth($('#pLinkPhone').value.trim(), true); }catch(e){ alert('Не удалось отправить SMS: '+(e.message||e)); } };
    if($('#pConfirmLinkSms')) $('#pConfirmLinkSms').onclick=async()=>{ try{ await confirmPhoneAuth($('#pLinkCode').value.trim()); }catch(e){ alert('Ошибка подтверждения телефона: '+(e.message||e)); } };
    if($('#mSendFeedback')) $('#mSendFeedback').onclick=async()=>{ try{ await sendMobileFeedback(u); }catch(e){ alert('Ошибка отправки: '+(e.message||e)); } };
    if($('#pLogout')) $('#pLogout').onclick=async()=>{localStorage.removeItem('favorites');await signOut(auth);location.href='mobile.html'};
    clearLoader();
  });
}


let mobileRefreshBusy = false;
let mobileRefreshTimer = 0;
async function refreshCurrentMobilePage(reason='refresh'){
  // Без перерендеринга всей страницы: раньше это вызывало тряску сайта и сбивало корзину.
  clearTimeout(mobileRefreshTimer);
  mobileRefreshTimer = setTimeout(async()=>{
    try{
      if (auth.currentUser) await loadUserCart(auth.currentUser).catch(()=>{});
      updateCounts();
    }catch(e){ console.warn('mobile soft refresh error', reason, e); }
  }, 120);
}

window.autostyleMobileRefresh = refreshCurrentMobilePage;

window.addEventListener('autostyle-cart-updated', () => {
  updateCounts();
});

window.addEventListener('pageshow', () => refreshCurrentMobilePage('pageshow-counts-only'));
window.addEventListener('online', () => refreshCurrentMobilePage('online-counts-only'));

(async()=>{
  try{
    setupMobileChrome();
    if(page==='home') await renderHome();
    if(page==='catalog') await renderCatalog();
    if(page==='product') await renderProduct();
    if(page==='cart') await renderCart();
    if(page==='favorites') await renderFavorites();
    if(['profile','profile-data','discount-card','orders','feedback','notifications'].includes(page)) await renderProfile();
    if(['about','contacts','installment','certificates','more'].includes(page)) renderInfoShell(page==='more'?'profile':'home');
  }catch(e){ console.error(e); clearLoader(); }
})();
