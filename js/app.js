
import { auth, db, COLLECTIONS } from './firebase.js';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, sendEmailVerification } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { setDoc, doc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getCollectionCached, getProducts } from './data-cache.js';

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const HOME_BLOCKS_COLLECTION = COLLECTIONS.homeBlocks || 'autostyle_home_blocks';
const PROMO_CARDS_COLLECTION = COLLECTIONS.promoCards || 'autostyle_promo_cards';
const PROMO_CARDS_COLLECTIONS = [...new Set([
  PROMO_CARDS_COLLECTION,
  'autostyle_promo_cards',
  'autostyle_promoCards',
  'autostyle_home_cards',
  'promoCards',
  'homeCards'
].filter(Boolean))];
let cart = JSON.parse(localStorage.getItem('cart') || '[]');
let favs = JSON.parse(localStorage.getItem('favorites') || '[]');

function clearCartAndFavorites(){
  localStorage.removeItem('cart');
  localStorage.removeItem('favorites');
  window.dispatchEvent(new Event('autostyle-storage-cleared'));
}

let allProducts = [];
let allBlocks = [];

const money = v => `${Number(v || 0).toLocaleString('ru-RU')} ₽`;
const stock = p => Number(p.stock ?? p.quantity ?? p.count ?? p.qty ?? 1);
const title = p => p.title || p.name || 'Без названия';
const img = p => p.image || p.imageUrl || p.photo || p.photoUrl || '';
const group = p => p.group || p.category || p.categoryName || 'Без группы';
const rawOldPrice = p => Number(p.oldPrice || p.priceOld || p.compareAtPrice || 0);
const oldPrice = p => { const op = rawOldPrice(p), pr = Number(p.price || 0); return op > pr ? op : 0; };
function discount(p){
  const manual = Number(p.discount || p.discountPercent || p.discount_percent || p.salePercent || 0);
  if (manual > 0) return manual;
  const op = oldPrice(p), pr = Number(p.price || 0);
  return op > pr && pr > 0 ? Math.round((op - pr) / op * 100) : 0;
}
function productSection(p){ return String(p.homeSection || p.homeBlock || p.tag || '').toLowerCase(); }
function normalizeKey(v){ return String(v || '').trim().toLowerCase(); }
function isMarkedForHome(p){ return p.showOnHome === true || p.showOnHome === 'true' || p.onHome === true || p.home === true; }
function saveCart(){ localStorage.setItem('cart', JSON.stringify(cart)); $('#cartCount') && ($('#cartCount').textContent = cart.length); }
function saveFav(){ localStorage.setItem('favorites', JSON.stringify(favs)); }
async function loadCollection(name){ return await getCollectionCached(name); }
async function safeLoadCollection(name){ try { return await loadCollection(name); } catch(e) { console.warn('Не удалось загрузить', name, e); return []; } }

function defaultBlocks(){
  return [
    {id:'new', key:'new', title:'Новинки', order:1, builtin:true},
    {id:'recentlyViewed', key:'recentlyViewed', title:'Недавно просмотренные', order:2, builtin:true, recent:true},
    {id:'bestsellers', key:'bestsellers', title:'Лидеры продаж', order:3, builtin:true},
    {id:'hot', key:'hot', title:'Горячие предложения', order:4, builtin:true}
  ];
}
async function safeLoadCollections(names) {
  const all = [];
  for (const name of names) {
    const rows = await safeLoadCollection(name);
    rows.forEach(row => all.push({ ...row, _collection: name }));
  }
  const seen = new Set();
  return all.filter(card => {
    const key = String(card.key || card.slug || card.id || '').trim();
    const uniq = key || `${card._collection}:${card.id}`;
    if (seen.has(uniq)) return false;
    seen.add(uniq);
    return true;
  });
}

function mergeBlocks(custom){
  const byKey = new Map();
  defaultBlocks().forEach(b => byKey.set(b.key, b));
  custom.forEach(b => {
    const key = b.key || b.slug || b.id;
    if (!key) return;
    const base = byKey.get(key) || {};
    byKey.set(key, { ...base, id:b.id || base.id, key, title:b.title || b.name || base.title || key, order:Number(b.order ?? base.order ?? 999), enabled:b.enabled !== false, builtin:base.builtin === true });
  });
  return [...byKey.values()].filter(b => b.enabled !== false).sort((a,b) => Number(a.order ?? 999) - Number(b.order ?? 999));
}
function productsForBlock(block){
  const key = normalizeKey(block.key);
  const available = allProducts.filter(p => stock(p) > 0);
  if (block.recent || key === 'recentlyviewed') {
    const ids = JSON.parse(localStorage.getItem('viewedProducts') || '[]');
    const byId = new Map(available.map(p => [p.id, p]));
    return ids.map(id => byId.get(id)).filter(Boolean);
  }
  let selected = available.filter(p => isMarkedForHome(p) && normalizeKey(productSection(p)) === key);
  if (selected.length) return selected;
  selected = available.filter(p => normalizeKey(productSection(p)) === key || normalizeKey(p.tag) === key);
  if (selected.length) return selected;
  if (key === 'bestsellers' || key === 'best' || key === 'leaders') return available.filter(p => ['best','bestsellers','leader','leaders'].includes(normalizeKey(p.tag))).concat([]).slice(0, 20);
  if (key === 'new') return available.filter(p => normalizeKey(p.tag) === 'new').slice(0,20);
  if (key === 'hot') return available.slice(0, 20);
  return [];
}


function defaultPromoCards(){
  // Старые промо-карточки на главной убраны.
  // Теперь показываются только карточки, созданные в админке / Firestore.
  return [];
}
function mergePromoCards(custom){
  const byKey = new Map();
  defaultPromoCards().forEach(c => byKey.set(c.key, c));
  (custom || []).forEach(c => {
    const key = c.key || c.slug || c.id;
    if (!key) return;
    byKey.set(key, {
      key,
      title: c.title || c.name || key,
      text: c.text || c.description || '',
      amount: c.amount || c.countText || '',
      link: c.link || c.url || '#',
      width: Number(c.width || c.cardWidth || 0) || '',
      height: Number(c.height || c.cardHeight || 0) || '',
      order: Number(c.order ?? 999),
      enabled: c.enabled !== false
    });
  });
  return [...byKey.values()].filter(c => c.enabled !== false).sort((a,b)=>Number(a.order??999)-Number(b.order??999));
}
function renderPromoCards(cards){
  const box = $('#banners');
  if (!box) return;
  box.innerHTML = cards.map(c => {
    const style = [
      c.width ? `--promo-card-width:${Number(c.width)}px` : '',
      c.height ? `--promo-card-height:${Number(c.height)}px` : ''
    ].filter(Boolean).join(';');
    return `
      <a class="mini-banner promo-card" href="${c.link || '#'}" ${style ? `style="${style}"` : ''}>
        ${c.amount ? `<span class="promo-card-count">${c.amount}</span>` : ''}
        <h3>${c.title || ''}</h3>
        <p class="muted">${c.text || ''}</p>
      </a>
    `;
  }).join('');
}
function card(p){
  const d = discount(p), op = oldPrice(p), im = img(p);
  const priceNum = Number(p.price || 0);
  const installment = p.installment === true || p.installmentAvailable === true || p.credit === true || priceNum >= 199;
  const monthPay = Math.ceil(priceNum / 12);
  return `<article class="product-card">
    <button class="fav-btn ${favs.includes(p.id) ? 'active' : ''}" data-fav="${p.id}" type="button">♡</button>
    <a class="product-card-link" href="product.html?id=${p.id}">
      <div class="product-img">${d ? `<span class="discount-badge">-${d}%</span>` : ''}${im ? `<img loading="lazy" decoding="async" src="${im}" alt="${title(p)}">` : '<span>Фото</span>'}</div>
      <div class="product-title">${title(p)}</div>
      <div class="product-group">${group(p)}</div>
      <div class="product-badges">${installment ? `<span class="installment-badge">Рассрочка от ${money(monthPay)}/мес</span>` : ''}</div>
      <div class="product-spacer"></div>
      <div class="price-row-card"><div class="price-current price">${money(p.price)}</div>${op ? `<div class="old-price price-old">${money(op)}</div>` : ''}</div>
    </a>
    <button class="cart" data-cart="${p.id}" type="button">В корзину</button>
  </article>`;
}
function bindProductButtons(scope=document){
  scope.querySelectorAll('[data-cart]').forEach(b => b.onclick = e => { e.preventDefault(); cart.push(b.dataset.cart); saveCart(); b.textContent='✓ Добавлено'; setTimeout(()=>b.textContent='В корзину',900); });
  scope.querySelectorAll('[data-fav]').forEach(b => b.onclick = e => { e.preventDefault(); e.stopPropagation(); const id=b.dataset.fav; favs=favs.includes(id)?favs.filter(x=>x!==id):[...favs,id]; b.classList.toggle('active', favs.includes(id)); saveFav(); });
}
function makeSection(block, products){
  const id = `homeBlock_${String(block.key).replace(/[^a-zA-Z0-9_-]/g,'_')}`;
  return `<section id="${id}" class="section-block product-section-carousel" data-block="${block.key}">
    <div class="section-head">
      <h2>${block.title}</h2>
      <button class="show-section-btn" data-expand="${id}" type="button">Смотреть все</button>
    </div>
    <div class="carousel-shell">
      <button class="carousel-arrow carousel-arrow-left" data-scroll-left="${id}" type="button" aria-label="Листать влево">‹</button>
      <div class="products carousel-products" data-limit="5">${products.length ? products.map(card).join('') : `<div class="notice">Товары для этого блока пока не выбраны.</div>`}</div>
      <button class="carousel-arrow carousel-arrow-right" data-scroll-right="${id}" type="button" aria-label="Листать вправо">›</button>
    </div>
  </section>`;
}
function renderSections(){
  const container = $('main.container'); if(!container) return;
  container.querySelectorAll('.section-block').forEach(s => s.remove());
  let html = '';
  allBlocks.forEach(block => {
    const list = productsForBlock(block);
    if ((block.recent || block.key === 'recentlyViewed') && !list.length) return;
    html += makeSection(block, list);
  });
  container.insertAdjacentHTML('beforeend', html);
  bindProductButtons(container);
  applyHomeSectionColors(container);
}
function applyHomeSectionColors(container=document){
  const sections = Array.from(container.querySelectorAll('.section-block'));
  sections.forEach((section, index) => {
    section.classList.toggle('section-dark', index % 2 === 0);
  });
}
async function renderCatalogMenu(){
  let cats = await safeLoadCollection(COLLECTIONS.categories);
  const fromProducts = [...new Set(allProducts.map(p => group(p)).filter(Boolean))].map((name,i)=>({id:'g'+i,title:name,icon:'',order:1000+i}));
  if (!cats.length) cats = fromProducts;

  const pb = $('#catalogParents'), cb = $('#catalogChildren'), tb = $('#megaTitle');
  if (!pb || !cb || !tb) return;

  const name = c => c.title || c.name || 'Без названия';
  const catId = c => String(c.id || c.externalId || '').trim();
  const parentKey = c => String(c.parentId || c.parent || c.parentExternalId || '').trim();
  const sortCats = (a,b) => Number(a.order ?? 999) - Number(b.order ?? 999) || name(a).localeCompare(name(b), 'ru');
  const isServiceGroup = c => /^\s*\d+[.)-]?\s*/.test(name(c));
  const normCatText = text => String(text || '').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/[\s_-]+/g, ' ');
  const isBlockedCatalogName = text => {
    const n = normCatText(text);
    return n === 'тмц' || n === 'я мусорка' || n === 'ямусорка' || n.includes('мусорка');
  };
  const isBlockedCategory = c => isBlockedCatalogName(name(c));
  const showInTopCatalog = c => c.showInTopCatalog !== false && c.hideFromTopCatalog !== true && !isBlockedCategory(c) && !isServiceGroup(c);

  cats = cats.filter(c => name(c).trim() && !isBlockedCategory(c)).sort(sortCats);

  function childrenOf(parent){
    const ids = [catId(parent), String(parent.externalId || '').trim()].filter(Boolean);
    return cats.filter(c => ids.includes(parentKey(c)) && showInTopCatalog(c)).sort(sortCats);
  }

  // В верхнем каталоге показываем категории, разрешённые в админке.
  // Служебные группы «1. ПЕРВЫЙ / 2. ВТОРОЙ» не показываем,
  // а их дочерние реальные разделы считаем верхним уровнем.
  // ТМЦ и Я мусорка всегда исключаются, даже после обновления Firestore.
  const byId = new Map();
  cats.forEach(c => { [catId(c), String(c.externalId || '').trim()].filter(Boolean).forEach(id => byId.set(id, c)); });
  const parentOf = c => byId.get(parentKey(c));
  let parents = cats.filter(c => {
    if (!showInTopCatalog(c)) return false;
    const p = parentOf(c);
    if (!p) return !parentKey(c) || childrenOf(c).length > 0;
    if (isServiceGroup(p)) return true;
    return childrenOf(c).length > 0;
  });
  const seenParents = new Set();
  parents = parents.filter(c => { const key = catId(c) || name(c).toLowerCase(); if (seenParents.has(key)) return false; seenParents.add(key); return true; }).sort(sortCats);

  function shortChildName(child, parent){
    let childName = name(child).trim();
    const parentName = name(parent).trim();
    const re = new RegExp('^' + parentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+', 'i');
    childName = childName.replace(re, '').trim();
    return childName || name(child);
  }
  function parentAllLabel(parent){
    const raw = name(parent).trim();
    const lower = raw.toLocaleLowerCase('ru-RU');
    const map = {
      'инструмент':'инструменты',
      'аккумулятор':'аккумуляторы',
      'ароматизатор':'ароматизаторы',
      'лампочка':'лампочки',
      'колпак':'колпаки',
      'коврик':'коврики',
      'фильтр':'фильтры'
    };
    return 'Все ' + (map[lower] || lower);
  }

  function render(parent){
    const list = childrenOf(parent);
    tb.textContent = name(parent);
    const allItem = `<a href="catalog.html?category=${encodeURIComponent(name(parent))}" class="mega-child mega-child-all"><div><b>${parentAllLabel(parent)}</b><small>Основная категория и все подкатегории</small></div></a>`;
    cb.innerHTML = allItem + list.map(ch => `
      <a href="catalog.html?category=${encodeURIComponent(name(ch))}" class="mega-child">
        <div><b>${shortChildName(ch, parent)}</b><small>${name(ch)}</small></div>
      </a>
    `).join('');
  }

  pb.innerHTML = parents.length
    ? parents.map((p,i)=>`<button class="mega-parent ${i ? '' : 'active'}" data-parent="${catId(p)}" type="button">${name(p)}</button>`).join('')
    : '<p class="muted">Категорий пока нет</p>';

  if (parents[0]) render(parents[0]);
  $$('.mega-parent').forEach(btn => btn.onmouseenter = btn.onclick = () => {
    $$('.mega-parent').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const p = parents.find(x => catId(x) === btn.dataset.parent);
    if (p) render(p);
  });
}
async function renderHome(){
  allProducts = await getProducts();
  const customBlocks = await safeLoadCollection(HOME_BLOCKS_COLLECTION);
  allBlocks = mergeBlocks(customBlocks);
  let banners = await safeLoadCollection(COLLECTIONS.banners);
  const hero=$('#hero'); if(hero){ const b=banners[0]||{}; hero.innerHTML=`<div class="hero-content"><span class="hero-label">AUTO STYLE MARKET</span><h1>${b.title||'Автотовары для стиля, комфорта и защиты'}</h1><p>${b.text||'Подбери аксессуары, автохимию и полезные товары для своего автомобиля в пару кликов.'}</p><div class="hero-actions"><a href="catalog.html" class="primary hero-btn">Смотреть каталог</a><a href="#homeBlock_bestsellers" class="hero-link">Лидеры продаж</a></div></div><div class="hero-visual"><div class="hero-car">AUTO</div></div>`; }
  const promoCards = mergePromoCards(await safeLoadCollections(PROMO_CARDS_COLLECTIONS));
  renderPromoCards(promoCards);
  renderSections(); saveCart(); renderCatalogMenu();
}
function setupExpand(){
  document.addEventListener('click', e => {
    const left=e.target.closest('[data-scroll-left]'), right=e.target.closest('[data-scroll-right]');
    if(left || right){ const id=(left||right).dataset.scrollLeft || (left||right).dataset.scrollRight; const sec=document.getElementById(id); const grid=sec?.querySelector('.carousel-products'); if(grid) grid.scrollBy({left:(right?1:-1)*grid.clientWidth*.85, behavior:'smooth'}); return; }
    const b=e.target.closest('[data-expand]'); if(!b)return; const sec=document.getElementById(b.dataset.expand); const grid=sec?.querySelector('.carousel-products'); if(!sec||!grid)return; sec.classList.toggle('expanded'); b.textContent=sec.classList.contains('expanded')?'Свернуть':'Смотреть все'; sec.scrollIntoView({behavior:'smooth', block:'start'});
  });
}
function setupSearch(){ const input=$('#homeSearch')||$('#siteSearch'), btn=$('#homeSearchBtn')||$('#siteSearchBtn'); const go=()=>{const q=encodeURIComponent((input?.value||'').trim()); location.href=q?`catalog.html?search=${q}`:'catalog.html'}; btn&&(btn.onclick=go); input&&input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();go();}}); }

function accountInitials(name, email){
  const base = String(name || email || 'AS').trim();
  return (base.split(/\s+/).slice(0,2).map(x=>x[0]).join('') || 'AS').toUpperCase();
}
function renderAccountPanel(user){
  const drop = document.querySelector('#accountDrop .drop');
  if(!drop || !user) return;
  const name = user.displayName || 'Профиль AutoStyle';
  const email = user.email || '';
  const photo = user.photoURL || '';
  drop.classList.add('account-panel');
  drop.innerHTML = `
    <div class="account-user">
      <div class="account-avatar">${photo ? `<img loading="lazy" decoding="async" src="${photo}" alt="${name}">` : accountInitials(name, email)}</div>
      <div>
        <b class="account-name">${name}</b>
        <span class="account-email">${email}</span>
      </div>
    </div>
    <div class="account-status">● Вы авторизованы</div>
    <nav class="account-menu">
      <a class="primary-account" href="profile.html">👤 Редактировать профиль</a>
      <a href="favorites.html">♡ Избранное</a>
      <a href="cart.html">🛒 Корзина</a>
      <button id="logout" class="account-logout" type="button">Выйти</button>
    </nav>`;
}

function authModal(){
  const modal=$('#authModal'); if(!modal)return; $('#openAuth')&&($('#openAuth').onclick=()=>modal.classList.add('open')); $('#closeAuth')&&($('#closeAuth').onclick=()=>modal.classList.remove('open'));
  $$('.tab').forEach(t=>t.onclick=()=>{$$('.tab').forEach(x=>x.classList.remove('active')); t.classList.add('active'); $('#loginForm').style.display=t.dataset.tab==='login'?'block':'none'; $('#registerForm').style.display=t.dataset.tab==='register'?'block':'none';});
  $('#loginForm')&&($('#loginForm').onsubmit=async e=>{e.preventDefault(); await signInWithEmailAndPassword(auth,$('#loginEmail').value.trim(),$('#loginPass').value); modal.classList.remove('open');});
  $('#registerForm')&&($('#registerForm').onsubmit=async e=>{e.preventDefault(); const res=await createUserWithEmailAndPassword(auth,$('#regEmail').value.trim(),$('#regPass').value); await setDoc(doc(db,COLLECTIONS.users,res.user.uid),{name:$('#regName').value.trim(),email:$('#regEmail').value.trim(),role:'user',createdAt:new Date().toISOString()}); await sendEmailVerification(res.user); alert('Аккаунт создан. Проверьте письмо на почте.'); modal.classList.remove('open');});
  onAuthStateChanged(auth,u=>{const authBtn=$('#openAuth'),dd=$('#accountDrop'); if(u){authBtn&&(authBtn.style.display='none'); if(dd){dd.style.display='block'; renderAccountPanel(u); $('#logout')&&($('#logout').onclick=async()=>{clearCartAndFavorites();await signOut(auth);location.reload();});}}else{clearCartAndFavorites();cart=[];favs=[];saveCart();saveFav();authBtn&&(authBtn.style.display='inline-block'); dd&&(dd.style.display='none');}});
  const accBtn = $('#accountBtn'), accDrop = $('#accountDrop');
  if (accBtn && accDrop && !accDrop.dataset.closeReady) {
    accDrop.dataset.closeReady = '1';
    accBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      accDrop.classList.toggle('open');
    };
    accDrop.addEventListener('click', e => e.stopPropagation());
    document.addEventListener('click', () => accDrop.classList.remove('open'));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') accDrop.classList.remove('open'); });
  }
}
authModal(); setupSearch(); setupExpand(); renderHome().finally(()=>window.AutoStyleLoader&&window.AutoStyleLoader.hide());
