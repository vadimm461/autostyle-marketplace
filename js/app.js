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

function saveCart() {
  localStorage.setItem('cart', JSON.stringify(cart));
  if ($('#cartCount')) $('#cartCount').textContent = cart.length;
}

async function loadCollection(name) {
  const snap = await getDocs(collection(db, name));
  return snap.docs.map(d => ({
    id: d.id,
    ...d.data()
  }));
}

async function renderCatalogMenu() {
  const categories = await loadCollection(COLLECTIONS.categories);

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
          <div>
            <b>${child.title || child.name || 'Без названия'}</b>
            <small>Смотреть товары</small>
          </div>
        </a>
      `).join('')
      : `
        <a href="catalog.html?category=${encodeURIComponent(parent.title || parent.name || '')}" class="mega-child">
          <span>${parent.icon || 'AS'}</span>
          <div>
            <b>Все товары категории</b>
            <small>${parent.title || parent.name || 'Категория'}</small>
          </div>
        </a>
      `;
  }

  parentsBox.innerHTML = parents.length
    ? parents.map((parent, index) => `
      <button class="mega-parent ${index === 0 ? 'active' : ''}" data-parent="${parent.id}">
        <span>${parent.icon || 'AS'}</span>
        ${parent.title || parent.name || 'Без названия'}
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

    btn.addEventListener('click', () => {
      const parent = parents.find(p => p.id === btn.dataset.parent);
      if (parent) renderChildren(parent);
    });
  });
}

function renderProducts(products) {
  const grid = $('#productsGrid');
  if (!grid) return;

  grid.innerHTML = products.length
    ? products.map(p => `
      <article class="product-card">
        <div class="product-img">
          ${p.image ? `<img src="${p.image}" alt="${p.title || p.name || 'Товар'}">` : 'Фото'}
        </div>

        <div class="product-title">${p.title || p.name || 'Без названия'}</div>
        <div class="muted">${p.category || 'Без категории'}</div>
        <div class="price">${money(p.price)}</div>

        <button class="cart" data-id="${p.id}">В корзину</button>
      </article>
    `).join('')
    : '<div class="panel muted">Товары появятся после добавления в админке.</div>';

  $$('[data-id]').forEach(btn => {
    btn.onclick = () => {
      cart.push(btn.dataset.id);
      saveCart();
    };
  });
}

function setupProductTabs() {
  $$('.product-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.product-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const title = $('.section-head h2');

      if (btn.dataset.filter === 'hot') {
        if (title) title.textContent = 'Горячие предложения';
        renderProducts(allProducts);
      }

      if (btn.dataset.filter === 'new') {
        if (title) title.textContent = 'Новинки';

        const sorted = [...allProducts].sort((a, b) => {
          return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
        });

        renderProducts(sorted);
      }

      if (btn.dataset.filter === 'best') {
        if (title) title.textContent = 'Лучшая цена';

        const sorted = [...allProducts].sort((a, b) => {
          return Number(a.price || 0) - Number(b.price || 0);
        });

        renderProducts(sorted);
      }
    });
  });
}

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

  <div class="hero-visual">
    <div class="hero-circle"></div>
    <div class="hero-car">AUTO</div>
  </div>
`;

  const bannersBox = $('#banners');
  if (bannersBox) {
    const defaultBanners = [
      { title: 'Акции', text: 'Лучшие предложения недели' },
      { title: 'Новинки', text: 'Свежие товары для твоего авто' },
      { title: 'Топ товары', text: 'Популярный выбор покупателей' }
    ];

    const items = banners.slice(1, 4).length ? banners.slice(1, 4) : defaultBanners;

    bannersBox.innerHTML = items.map(b => `
      <div class="mini-banner">
        <h3>${b.title}</h3>
        <p class="muted">${b.text || ''}</p>
      </div>
    `).join('');
  }

  renderProducts(products);
  saveCart();
}

function authModal() {
  const modal = $('#authModal');
  if (!modal) return;

  if ($('#openAuth')) {
    $('#openAuth').onclick = () => modal.classList.add('open');
  }

  if ($('#closeAuth')) {
    $('#closeAuth').onclick = () => modal.classList.remove('open');
  }

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

      const email = $('#loginEmail').value.trim();
      const pass = $('#loginPass').value;

      await signInWithEmailAndPassword(auth, email, pass);
      modal.classList.remove('open');
    };
  }

  if ($('#registerForm')) {
    $('#registerForm').onsubmit = async e => {
      e.preventDefault();

      const name = $('#regName').value.trim();
      const email = $('#regEmail').value.trim();
      const pass = $('#regPass').value;

      const res = await createUserWithEmailAndPassword(auth, email, pass);

      await setDoc(doc(db, COLLECTIONS.users, res.user.uid), {
        name,
        email,
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

        if ($('#logout')) {
          $('#logout').onclick = () => signOut(auth);
        }
      }
    } else {
      if (authBtn) authBtn.style.display = 'inline-block';
      if (dd) dd.style.display = 'none';
    }
  });

  if ($('#accountBtn')) {
    $('#accountBtn').onclick = () => $('#accountDrop').classList.toggle('open');
  }
}

authModal();
renderHome();
renderCatalogMenu();
setupProductTabs();
