import { auth, db, COLLECTIONS } from './firebase.js';

import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendEmailVerification
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

import {
  collection,
  getDocs,
  setDoc,
  doc
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

let cart = JSON.parse(localStorage.getItem('cart') || '[]');
let favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
let allProducts = [];

function money(v) {
  return `${Number(v || 0).toLocaleString('ru-RU')} ₽`;
}

function productStock(p) {
  return Number(p.stock ?? p.quantity ?? p.count ?? 0);
}

function onlyInStock(products) {
  return products.filter(p => productStock(p) > 0);
}

function productTitle(p) {
  return p.title || p.name || 'Без названия';
}

function productImage(p) {
  return p.image || p.imageUrl || p.photo || '';
}

function productGroup(p) {
  return p.group || p.category || p.brand || 'Без группы';
}

function oldPrice(p) {
  return Number(p.oldPrice || p.priceOld || p.compareAtPrice || p.old_price || 0);
}

function discountPercent(p) {
  const explicit = Number(p.discountPercent || p.discount || p.sale || 0);
  if (explicit > 0) return Math.round(explicit);
  const old = oldPrice(p);
  const price = Number(p.price || 0);
  if (old > price && price > 0) return Math.round((old - price) / old * 100);
  return 0;
}

function saveCart() {
  localStorage.setItem('cart', JSON.stringify(cart));
  const count = $('#cartCount');
  if (count) count.textContent = cart.length;
}

function saveFavorites() {
  localStorage.setItem('favorites', JSON.stringify(favorites));
}

function toggleFavorite(id, btn) {
  if (favorites.includes(id)) {
    favorites = favorites.filter(x => x !== id);
    if (btn) btn.classList.remove('active');
  } else {
    favorites.unshift(id);
    if (btn) btn.classList.add('active');
  }
  saveFavorites();
}

async function loadCollection(name) {
  const snap = await getDocs(collection(db, name));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function matchesHome(p, section) {
  const homeSection = String(p.homeSection || p.homeBlock || p.homeCategory || '').toLowerCase();
  const tag = String(p.tag || '').toLowerCase();

  if (p.showOnHome !== true && !homeSection) return false;

  if (section === 'hot') {
    return homeSection === 'hot' || homeSection === 'main' || tag === 'hot' || (!tag && !homeSection);
  }

  if (section === 'new') {
    return homeSection === 'new' || homeSection === 'novinki' || tag === 'new';
  }

  if (section === 'best') {
    return homeSection === 'best' || homeSection === 'bestsellers' || homeSection === 'leaders' || tag === 'best' || tag === 'leader' || tag === 'bestseller';
  }

  return false;
}

function productCard(p) {
  const img = productImage(p);
  const title = productTitle(p);
  const old = oldPrice(p);
  const disc = discountPercent(p);
  const favActive = favorites.includes(p.id) ? 'active' : '';

  return `
    <article class="product-card home-product-card">
      <button class="favorite-btn ${favActive}" type="button" data-fav="${p.id}" aria-label="В избранное">♡</button>
      <a class="product-card-link" href="product.html?id=${p.id}">
        <div class="product-img">
          ${disc ? `<span class="card-discount-badge">-${disc}%</span>` : ''}
          ${img ? `<img src="${img}" alt="${title}">` : '<span>Фото</span>'}
        </div>
        <div class="product-title">${title}</div>
        <div class="muted product-code-line">Группа: ${productGroup(p)}</div>
        <div class="product-price-wrap">
          <div class="price home-price price-current">${money(p.price)}</div>
          ${old > Number(p.price || 0) ? `<div class="price-old">${money(old)}</div>` : ''}
        </div>
      </a>
    </article>
  `;
}

function renderGrid(selector, products, emptyText = 'Товары пока не выбраны в админке.') {
  const grid = $(selector);
  if (!grid) return;

  grid.innerHTML = products.length
    ? products.map(productCard).join('')
    : `<div class="panel muted home-empty">${emptyText}</div>`;

  grid.querySelectorAll('[data-fav]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      toggleFavorite(btn.dataset.fav, btn);
    });
  });
}

function renderHomeSections(products) {
  const homeProducts = onlyInStock(products).filter(p => p.showOnHome === true || p.homeSection || p.homeBlock || p.homeCategory);

  let hot = homeProducts.filter(p => matchesHome(p, 'hot'));
  let newest = homeProducts.filter(p => matchesHome(p, 'new'));
  let best = homeProducts.filter(p => matchesHome(p, 'best'));

  /* ВАЖНО: если старые товары уже отмечены “Показывать на главной”, но метки не проставлены — показываем их, а не пустой блок. */
  if (!hot.length) hot = homeProducts.slice(0, 10);
  if (!newest.length) newest = homeProducts.filter(p => p.createdAt).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 10);
  if (!best.length) best = homeProducts.slice(0, 10);

  renderGrid('#hotProductsGrid', hot.slice(0, 10), 'Отметьте товары в админке: “Показывать на главной”.');
  renderGrid('#newProductsGrid', newest.slice(0, 10), 'Для новинок выберите метку “Новинки” в админке.');
  renderGrid('#bestProductsGrid', best.slice(0, 10), 'Для лидеров продаж выберите метку “Лучшая цена” или “Лидеры продаж” в админке.');

  renderRecentlyViewed(products);
}

function renderRecentlyViewed(products) {
  const section = $('#homeViewed');
  const ids = JSON.parse(localStorage.getItem('viewedProducts') || '[]');
  const viewed = ids
    .map(id => products.find(p => p.id === id))
    .filter(Boolean)
    .filter(p => productStock(p) > 0);

  if (!viewed.length) {
    if (section) section.style.display = 'none';
    return;
  }

  if (section) section.style.display = '';
  renderGrid('#viewedProductsGrid', viewed.slice(0, 10), 'Недавно просмотренных товаров пока нет.');
}

async function renderCatalogMenu() {
  let categories = await loadCollection(COLLECTIONS.categories);

  categories.sort((a, b) => {
    const ao = Number(a.order ?? 999999);
    const bo = Number(b.order ?? 999999);
    if (ao !== bo) return ao - bo;
    return String(a.title || '').localeCompare(String(b.title || ''), 'ru');
  });

  const parentsBox = $('#catalogParents');
  const childrenBox = $('#catalogChildren');
  const titleBox = $('#megaTitle');
  if (!parentsBox || !childrenBox || !titleBox) return;

  const parents = categories.filter(c => !c.parentId);
  const children = categories.filter(c => c.parentId);

  function renderChildren(parent) {
    const list = children.filter(c => c.parentId === parent.id);
    titleBox.textContent = parent.title || parent.name || 'Категория';
    childrenBox.innerHTML = list.length
      ? list.map(child => `<a href="catalog.html?category=${encodeURIComponent(child.title || child.name || '')}" class="mega-child"><span>${child.icon || 'AS'}</span><div><b>${child.title || child.name || 'Без названия'}</b><small>Смотреть товары</small></div></a>`).join('')
      : `<a href="catalog.html?category=${encodeURIComponent(parent.title || parent.name || '')}" class="mega-child"><span>${parent.icon || 'AS'}</span><div><b>Все товары категории</b><small>${parent.title || parent.name || 'Категория'}</small></div></a>`;
  }

  parentsBox.innerHTML = parents.length
    ? parents.map((parent, index) => `<button class="mega-parent ${index === 0 ? 'active' : ''}" data-parent="${parent.id}"><span>${parent.icon || 'AS'}</span>${parent.title || parent.name || 'Без названия'}</button>`).join('')
    : '<p class="muted">Категорий пока нет</p>';

  if (parents[0]) renderChildren(parents[0]);

  $$('.mega-parent').forEach(btn => {
    btn.addEventListener('mouseenter', () => {
      $$('.mega-parent').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const parent = parents.find(p => p.id === btn.dataset.parent);
      if (parent) renderChildren(parent);
    });
  });
}

async function renderHome() {
  let products = await loadCollection(COLLECTIONS.products);
  products = onlyInStock(products);
  allProducts = products;

  const banners = await loadCollection(COLLECTIONS.banners);
  const hero = $('#hero');

  if (hero) {
    const b = banners[0] || {};
    hero.innerHTML = `
      <div class="hero-content">
        <span class="hero-label">AUTO STYLE MARKET</span>
        <h1>${b.title || 'Автотовары для стиля, комфорта и защиты'}</h1>
        <p>${b.text || 'Подбери аксессуары, автохимию и полезные товары для своего автомобиля в пару кликов.'}</p>
        <div class="hero-actions"><a href="catalog.html" class="primary hero-btn">Смотреть каталог</a><a href="#homeHot" class="hero-link">Популярные товары</a></div>
      </div>
      <div class="hero-visual"><div class="hero-circle"></div><div class="hero-car">AUTO</div></div>
    `;
  }

  const bannersBox = $('#banners');
  if (bannersBox) {
    const defaultBanners = [
      { title: 'Акции', text: 'Лучшие предложения недели' },
      { title: 'Новинки', text: 'Свежие товары для твоего авто' },
      { title: 'Топ товары', text: 'Популярный выбор покупателей' }
    ];
    const items = banners.slice(1, 4).length ? banners.slice(1, 4) : defaultBanners;
    bannersBox.innerHTML = items.map(b => `<a class="mini-banner" href="${b.link || '#homeHot'}"><h3>${b.title}</h3><p class="muted">${b.text || ''}</p></a>`).join('');
  }

  renderHomeSections(products);
  saveCart();
}

function setupSectionLinks() {
  $$('[data-open-section]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const id = link.dataset.openSection;
      const section = document.getElementById(id);
      if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

function setupCatalogOverlay() {
  const btn = $('.catalog-btn');
  const popup = $('.catalog-popup, .catalog-dropdown');
  const overlay = $('#catalogOverlay') || $('.catalog-overlay');
  if (!btn || !popup || !overlay) return;

  btn.addEventListener('click', e => {
    e.preventDefault();
    popup.classList.toggle('active');
    popup.classList.toggle('open');
    overlay.classList.toggle('active');
  });

  overlay.addEventListener('click', () => {
    popup.classList.remove('active', 'open');
    overlay.classList.remove('active');
  });
}

function setupHomeSearch() {
  const input = $('#homeSearch') || $('#siteSearch');
  const btn = $('#homeSearchBtn') || $('#siteSearchBtn');
  function goSearch() {
    const q = encodeURIComponent((input?.value || '').trim());
    location.href = q ? `catalog.html?search=${q}` : 'catalog.html';
  }
  if (btn) btn.onclick = goSearch;
  if (input) input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      goSearch();
    }
  });
}

function authModal() {
  const modal = $('#authModal');
  if (!modal) return;

  if ($('#openAuth')) $('#openAuth').onclick = () => modal.classList.add('open');
  if ($('#closeAuth')) $('#closeAuth').onclick = () => modal.classList.remove('open');

  $$('.tab').forEach(t => {
    t.onclick = () => {
      $$('.tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      $('#loginForm').style.display = t.dataset.tab === 'login' ? 'block' : 'none';
      $('#registerForm').style.display = t.dataset.tab === 'register' ? 'block' : 'none';
    };
  });

  if ($('#loginForm')) {
    $('#loginForm').onsubmit = async e => {
      e.preventDefault();
      await signInWithEmailAndPassword(auth, $('#loginEmail').value.trim(), $('#loginPass').value);
      modal.classList.remove('open');
    };
  }

  if ($('#registerForm')) {
    $('#registerForm').onsubmit = async e => {
      e.preventDefault();
      const res = await createUserWithEmailAndPassword(auth, $('#regEmail').value.trim(), $('#regPass').value);
      await setDoc(doc(db, COLLECTIONS.users, res.user.uid), {
        name: $('#regName').value.trim(),
        email: $('#regEmail').value.trim(),
        role: 'user',
        createdAt: new Date().toISOString()
      });
      await sendEmailVerification(res.user);
      alert('Аккаунт создан. Проверьте письмо на почте для подтверждения.');
      modal.classList.remove('open');
    };
  }

  onAuthStateChanged(auth, u => {
    const authBtn = $('#openAuth');
    const dd = $('#accountDrop');
    if (u) {
      if (authBtn) authBtn.style.display = 'none';
      if (dd) {
        dd.style.display = 'block';
        $('#userEmail').textContent = u.email;
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
setupHomeSearch();
setupSectionLinks();
setupCatalogOverlay();
renderHome();
renderCatalogMenu();
