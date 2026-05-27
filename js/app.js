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

function discountInfo(p) {
  const price = Number(p.price || 0);
  const rawOld = Number(p.oldPrice ?? p.priceOld ?? p.compareAtPrice ?? p.previousPrice ?? 0);
  const percent = Number(p.discountPercent ?? p.discount ?? p.sale ?? 0);
  const oldPrice = rawOld > price ? rawOld : (percent > 0 && price > 0 ? Math.round(price / (1 - percent / 100)) : 0);
  const discount = oldPrice > price ? Math.round((oldPrice - price) / oldPrice * 100) : (percent > 0 ? percent : 0);
  return { price, oldPrice, discount };
}
function priceHtml(p, cls='price') {
  const d = discountInfo(p);
  return `<div class="product-price-wrap"><span class="${cls} price-current">${money(d.price)}</span>${d.oldPrice ? `<span class="price-old">${money(d.oldPrice)}</span>` : ''}${d.discount ? `<span class="discount-badge">-${d.discount}%</span>` : ''}</div>`;
}
function showProductsLoader() {
  const grid = $('#productsGrid');
  if (grid) grid.innerHTML = '<div class="app-loader">Загружаем товары...</div>';
}

function saveCart() {
  localStorage.setItem('cart', JSON.stringify(cart));
  if ($('#cartCount')) $('#cartCount').textContent = cart.length;
}

async function loadCollection(name) {
  const snap = await getDocs(collection(db, name));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
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
      ? list.map(child => `
        <a href="catalog.html?category=${encodeURIComponent(child.title || child.name || '')}" class="mega-child">
          <span>${child.icon || 'AS'}</span>
          <div><b>${child.title || child.name || 'Без названия'}</b><small>Смотреть товары</small></div>
        </a>
      `).join('')
      : `
        <a href="catalog.html?category=${encodeURIComponent(parent.title || parent.name || '')}" class="mega-child">
          <span>${parent.icon || 'AS'}</span>
          <div><b>Все товары категории</b><small>${parent.title || parent.name || 'Категория'}</small></div>
        </a>
      `;
  }

  parentsBox.innerHTML = parents.length
    ? parents.map((parent, index) => `
      <button class="mega-parent ${index === 0 ? 'active' : ''}" data-parent="${parent.id}">
        <span>${parent.icon || 'AS'}</span>${parent.title || parent.name || 'Без названия'}
      </button>
    `).join('')
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

function renderProducts(products) {
  const grid = $('#productsGrid');
  if (!grid) return;

  const visibleProducts = onlyInStock(products)
    .filter(p => p.showOnHome === true)
    .slice(0, 24);

  grid.innerHTML = visibleProducts.length
    ? visibleProducts.map(p => `
      <a class="product-card product-card-link home-product-card" href="product.html?id=${p.id}">
        <div class="product-img">
          ${discountInfo(p).discount ? `<span class="card-discount-badge">-${discountInfo(p).discount}%</span>` : ''}${productImage(p) ? `<img src="${productImage(p)}" alt="${productTitle(p)}">` : 'Фото'}
        </div>

        <div class="product-title">${productTitle(p)}</div>

        <div class="muted product-code-line">
          ${p.code ? `Код: ${p.code}` : ''}
        </div>

        ${priceHtml(p, 'price home-price')}
      </a>
    `).join('')
    : '<div class="panel muted">На главной пока нет выбранных товаров. Отметьте товар в админке галочкой “Показывать на главной”.</div>';
}

function setupProductTabs() {
  $$('.product-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.product-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const title = $('.section-head h2');
      let filtered = [];

      if (btn.dataset.filter === 'hot') {
        if (title) title.textContent = 'Горячие предложения';
        filtered = allProducts.filter(p => !p.tag || p.tag === 'hot');
      }

      if (btn.dataset.filter === 'new') {
        if (title) title.textContent = 'Новинки';
        filtered = allProducts.filter(p => p.tag === 'new');
      }

      if (btn.dataset.filter === 'best') {
        if (title) title.textContent = 'Лучшая цена';
        filtered = allProducts.filter(p => p.tag === 'best');
      }

      renderProducts(filtered);
    });
  });
}

async function renderHome() {
  showProductsLoader();
  let products = await loadCollection(COLLECTIONS.products);
  products = onlyInStock(products);

  const banners = await loadCollection(COLLECTIONS.banners);
  allProducts = products;

  const hero = $('#hero');

  if (hero) {
    const b = banners[0] || {};
    hero.innerHTML = `
      <div class="hero-content">
        <span class="hero-label">AUTO STYLE MARKET</span>
        <h1>${b.title || 'Автотовары для стиля, комфорта и защиты'}</h1>
        <p>${b.text || 'Подбери аксессуары, автохимию и полезные товары для своего автомобиля в пару кликов.'}</p>
        <div class="hero-actions">
          <a href="catalog.html" class="primary hero-btn">Смотреть каталог</a>
          <a href="#productsBlock" class="hero-link">Популярные товары</a>
        </div>
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

    bannersBox.innerHTML = items.map(b => `
      <a class="mini-banner" href="${b.link || '#productsBlock'}"><h3>${b.title}</h3><p class="muted">${b.text || ''}</p></a>
    `).join('');
  }

  renderProducts(products.filter(p => !p.tag || p.tag === 'hot'));
  saveCart();
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
renderHome();
renderCatalogMenu();
setupProductTabs();
