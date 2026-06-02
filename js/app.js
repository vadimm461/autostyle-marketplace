
import { auth, db, COLLECTIONS } from './firebase.js';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, sendEmailVerification } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { collection, getDocs, setDoc, doc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

let cart = JSON.parse(localStorage.getItem('cart') || '[]');
let favs = JSON.parse(localStorage.getItem('favorites') || '[]');
let allProducts = [];
const expandedGrids = new Set();

const money = v => `${Number(v || 0).toLocaleString('ru-RU')} ₽`;
const stock = p => Number(p.stock ?? p.quantity ?? p.count ?? p.available ?? 1);
const title = p => p.title || p.name || p.productName || 'Без названия';
const img = p => p.image || p.imageUrl || p.photo || p.photoUrl || p.img || '';
const group = p => p.group || p.category || p.categoryName || p.brand || 'Без группы';
const lower = v => String(v || '').trim().toLowerCase();

function oldPrice(p){ return Number(p.oldPrice || p.priceOld || p.priceBefore || p.compareAtPrice || 0); }
function discount(p){
  const d = Number(p.discount || p.discountPercent || 0);
  if (d > 0) return d;
  const op = oldPrice(p), pr = Number(p.price || 0);
  return op > pr && pr > 0 ? Math.round((op - pr) / op * 100) : 0;
}
function createdTime(p){ return new Date(p.createdAt || p.updatedAt || 0).getTime() || 0; }

function saveCart(){
  localStorage.setItem('cart', JSON.stringify(cart));
  const c = $('#cartCount');
  if (c) c.textContent = cart.length;
}
function saveFav(){ localStorage.setItem('favorites', JSON.stringify(favs)); }

async function loadCollection(name){
  const snap = await getDocs(collection(db, name));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function sectionKey(p){
  return lower(p.homeSection || p.homeBlock || p.block || p.section || p.tag || p.label || '');
}
function isMarkedHome(p){
  return p.showOnHome === true || p.home === true || p.onHome === true || p.homeProduct === true || p.isHome === true;
}
function hasKey(p, keys){
  const s = sectionKey(p);
  return keys.some(k => s === k || s.includes(k));
}
function filterSection(products, section){
  const available = products.filter(p => stock(p) > 0);
  const hotKeys = ['hot', 'горяч', 'main', 'home', 'sale'];
  const newKeys = ['new', 'нов'];
  const bestKeys = ['best', 'bestseller', 'leader', 'лидер', 'топ'];

  let list = [];

  if (section === 'new') {
    list = available.filter(p => isMarkedHome(p) && hasKey(p, newKeys));
    if (!list.length) list = available.filter(p => hasKey(p, newKeys));
    if (!list.length) list = [...available].sort((a,b) => createdTime(b) - createdTime(a));
  }

  if (section === 'bestsellers') {
    list = available.filter(p => isMarkedHome(p) && hasKey(p, bestKeys));
    if (!list.length) list = available.filter(p => hasKey(p, bestKeys));
    if (!list.length) list = [...available].sort((a,b) => Number(b.sales || b.sold || b.orders || 0) - Number(a.sales || a.sold || a.orders || 0));
  }

  if (section === 'hot') {
    list = available.filter(p => isMarkedHome(p) && (hasKey(p, hotKeys) || !sectionKey(p)));
    if (!list.length) list = available.filter(p => hasKey(p, hotKeys));
    if (!list.length) list = available;
  }

  return list;
}

function card(p){
  const d = discount(p);
  const op = oldPrice(p);
  const image = img(p);
  return `
    <article class="product-card">
      <button class="fav-btn ${favs.includes(p.id) ? 'active' : ''}" data-fav="${p.id}" type="button">♡</button>
      <a class="product-card-link" href="product.html?id=${encodeURIComponent(p.id)}">
        <div class="product-img">
          ${d ? `<span class="discount-badge">-${d}%</span>` : ''}
          ${image ? `<img src="${image}" alt="${title(p).replaceAll('"','&quot;')}">` : '<span>Фото</span>'}
        </div>
        <div class="product-title">${title(p)}</div>
        <div class="product-group">${group(p)}</div>
        <div class="price-row-card">
          <div class="price-current price">${money(p.price)}</div>
          ${op && op > Number(p.price || 0) ? `<div class="old-price price-old">${money(op)}</div>` : ''}
        </div>
        ${p.installment === true || p.installmentAvailable === true ? '<div class="installment-badge">Доступно в рассрочку</div>' : ''}
      </a>
      <button class="cart" data-cart="${p.id}" type="button">В корзину</button>
    </article>`;
}

function renderGrid(sel, products, emptyText){
  const box = $(sel);
  if (!box) return;
  const limit = expandedGrids.has(box.id) ? 999 : Number(box.dataset.limit || 5);
  const list = products.filter(p => stock(p) > 0).slice(0, limit);
  box.innerHTML = list.length ? list.map(card).join('') : `<div class="notice">${emptyText}</div>`;
  bindProductButtons(box);
  setupCarouselForGrid(box, products.length > Number(box.dataset.limit || 5));
}

function setupCarouselForGrid(grid, needArrows){
  const section = grid.closest('.section-block');
  if (!section) return;
  section.querySelectorAll('.carousel-arrow').forEach(x => x.remove());
  if (!needArrows || expandedGrids.has(grid.id)) return;

  const prev = document.createElement('button');
  const next = document.createElement('button');
  prev.className = 'carousel-arrow carousel-prev';
  next.className = 'carousel-arrow carousel-next';
  prev.type = next.type = 'button';
  prev.textContent = '‹';
  next.textContent = '›';
  section.append(prev, next);
  prev.onclick = () => grid.scrollBy({ left: -grid.clientWidth * .85, behavior: 'smooth' });
  next.onclick = () => grid.scrollBy({ left: grid.clientWidth * .85, behavior: 'smooth' });
}

function bindProductButtons(scope = document){
  scope.querySelectorAll('[data-cart]').forEach(b => {
    b.onclick = e => {
      e.preventDefault();
      cart.push(b.dataset.cart);
      saveCart();
      b.textContent = '✓ Добавлено';
      setTimeout(() => b.textContent = 'В корзину', 900);
    };
  });
  scope.querySelectorAll('[data-fav]').forEach(b => {
    b.onclick = e => {
      e.preventDefault();
      e.stopPropagation();
      const id = b.dataset.fav;
      favs = favs.includes(id) ? favs.filter(x => x !== id) : [...favs, id];
      b.classList.toggle('active', favs.includes(id));
      saveFav();
    };
  });
}

async function renderCatalogMenu(){
  let cats = [];
  try { cats = await loadCollection(COLLECTIONS.categories); } catch(e) { cats = []; }
  const productGroups = [...new Set(allProducts.map(group).filter(Boolean))].map((name, i) => ({ id:'g'+i, title:name, order:1000+i }));
  if (!cats.length) cats = productGroups;
  cats.sort((a,b) => Number(a.order ?? 999) - Number(b.order ?? 999) || String(a.title || a.name || '').localeCompare(String(b.title || b.name || ''), 'ru'));

  const pb = $('#catalogParents'), cb = $('#catalogChildren'), tb = $('#megaTitle');
  if (!pb || !cb || !tb) return;
  const parents = cats.filter(c => !c.parentId);
  const children = cats.filter(c => c.parentId);
  const name = c => c.title || c.name || c.group || 'Без названия';
  function render(parent){
    const list = children.filter(c => c.parentId === parent.id || c.parentId === parent.externalId);
    tb.textContent = name(parent);
    const items = list.length ? list : [parent];
    cb.innerHTML = items.map(ch => `<a href="catalog.html?category=${encodeURIComponent(name(ch))}" class="mega-child"><div><b>${list.length ? name(ch) : 'Все товары категории'}</b><small>${name(ch)}</small></div></a>`).join('');
  }
  pb.innerHTML = parents.length ? parents.map((p,i) => `<button class="mega-parent ${i ? '' : 'active'}" data-parent="${p.id}" type="button">${name(p)}</button>`).join('') : '<p class="muted">Категорий пока нет</p>';
  if (parents[0]) render(parents[0]);
  $$('.mega-parent').forEach(btn => btn.onmouseenter = btn.onclick = () => {
    $$('.mega-parent').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const p = parents.find(x => x.id === btn.dataset.parent);
    if (p) render(p);
  });
}

async function renderRecentlyViewed(products){
  const section = $('#recentlyViewed');
  const ids = JSON.parse(localStorage.getItem('viewedProducts') || '[]');
  const byId = new Map(products.map(p => [p.id, p]));
  const list = ids.map(id => byId.get(id)).filter(Boolean);
  if (!list.length) {
    if (section) section.style.display = 'none';
    return;
  }
  if (section) section.style.display = '';
  renderGrid('#recentlyViewedGrid', list, 'Вы пока не смотрели товары.');
}

async function renderHome(){
  let products = [];
  try {
    products = await loadCollection(COLLECTIONS.products);
  } catch (e) {
    console.error('Не удалось загрузить товары Firestore:', e);
  }
  allProducts = products;

  let banners = [];
  try { banners = await loadCollection(COLLECTIONS.banners); } catch(e) { banners = []; }

  const hero = $('#hero');
  if (hero) {
    const b = banners[0] || {};
    hero.innerHTML = `<div class="hero-content"><span class="hero-label">AUTO STYLE MARKET</span><h1>${b.title || 'Автотовары для стиля, комфорта и защиты'}</h1><p>${b.text || 'Подбери аксессуары, автохимию и полезные товары для своего автомобиля в пару кликов.'}</p><div class="hero-actions"><a href="catalog.html" class="primary hero-btn">Смотреть каталог</a><a href="#bestsellers" class="hero-link">Лидеры продаж</a></div></div><div class="hero-visual"><div class="hero-car">AUTO</div></div>`;
  }

  const bannersBox = $('#banners');
  if (bannersBox) {
    const defs = [
      { title:'Акции', text:'Лучшие предложения недели' },
      { title:'Новинки', text:'Свежие товары для твоего авто' },
      { title:'Топ товары', text:'Популярный выбор покупателей' }
    ];
    const list = banners.slice(1,4).length ? banners.slice(1,4) : defs;
    bannersBox.innerHTML = list.map(b => `<a class="mini-banner" href="${b.link || '#productsBlock'}"><h3>${b.title}</h3><p class="muted">${b.text || ''}</p></a>`).join('');
  }

  renderGrid('#newProductsGrid', filterSection(products, 'new'), 'Товары загружаются или пока не добавлены.');
  renderGrid('#bestsellersGrid', filterSection(products, 'bestsellers'), 'Товары загружаются или пока не добавлены.');
  renderGrid('#productsGrid', filterSection(products, 'hot'), 'Товары загружаются или пока не добавлены.');
  await renderRecentlyViewed(products);
  saveCart();
  await renderCatalogMenu();
}

function setupExpand(){
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-expand]');
    if (!b) return;
    const grid = document.getElementById(b.dataset.expand);
    if (!grid) return;
    if (expandedGrids.has(grid.id)) {
      expandedGrids.delete(grid.id);
      b.textContent = 'Смотреть все';
    } else {
      expandedGrids.add(grid.id);
      b.textContent = 'Свернуть';
    }
    renderHome().then(() => document.getElementById(grid.id)?.scrollIntoView({ behavior:'smooth', block:'start' }));
  });
}

function setupSearch(){
  const input = $('#homeSearch') || $('#siteSearch');
  const btn = $('#homeSearchBtn') || $('#siteSearchBtn');
  const go = () => {
    const q = encodeURIComponent((input?.value || '').trim());
    location.href = q ? `catalog.html?search=${q}` : 'catalog.html';
  };
  if (btn) btn.onclick = go;
  if (input) input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
}

function authModal(){
  const modal = $('#authModal');
  if (!modal) return;
  const openAuth = $('#openAuth');
  const closeAuth = $('#closeAuth');
  if (openAuth) openAuth.onclick = () => modal.classList.add('open');
  if (closeAuth) closeAuth.onclick = () => modal.classList.remove('open');
  $$('.tab').forEach(t => t.onclick = () => {
    $$('.tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    $('#loginForm').style.display = t.dataset.tab === 'login' ? 'block' : 'none';
    $('#registerForm').style.display = t.dataset.tab === 'register' ? 'block' : 'none';
  });
  if ($('#loginForm')) $('#loginForm').onsubmit = async e => {
    e.preventDefault();
    await signInWithEmailAndPassword(auth, $('#loginEmail').value.trim(), $('#loginPass').value);
    modal.classList.remove('open');
  };
  if ($('#registerForm')) $('#registerForm').onsubmit = async e => {
    e.preventDefault();
    const res = await createUserWithEmailAndPassword(auth, $('#regEmail').value.trim(), $('#regPass').value);
    await setDoc(doc(db, COLLECTIONS.users, res.user.uid), { name:$('#regName').value.trim(), email:$('#regEmail').value.trim(), role:'user', createdAt:new Date().toISOString() });
    await sendEmailVerification(res.user);
    alert('Аккаунт создан. Проверьте письмо на почте.');
    modal.classList.remove('open');
  };
  onAuthStateChanged(auth, u => {
    const authBtn = $('#openAuth'), dd = $('#accountDrop');
    if (u) {
      if (authBtn) authBtn.style.display = 'none';
      if (dd) {
        dd.style.display = 'block';
        if ($('#userEmail')) $('#userEmail').textContent = u.email;
        if ($('#logout')) $('#logout').onclick = () => signOut(auth);
      }
    } else {
      if (authBtn) authBtn.style.display = 'inline-block';
      if (dd) dd.style.display = 'none';
    }
  });
  if ($('#accountBtn')) $('#accountBtn').onclick = () => $('#accountDrop').classList.toggle('open');
}

authModal();
setupSearch();
setupExpand();
renderHome();
