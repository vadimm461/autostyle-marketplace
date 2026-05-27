import { auth, db, COLLECTIONS } from './firebase.js';

import {
  onAuthStateChanged,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

import {
  collection,
  getDocs,
  setDoc,
  doc
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const fmt = new Intl.NumberFormat('ru-RU');

const grid = document.querySelector('#catalogGrid');
const search = document.querySelector('#search');
const topSearch = document.querySelector('#topSearch');
const topSearchBtn = document.querySelector('#topSearchBtn');
const cat = document.querySelector('#category');
const sort = document.querySelector('#sort');
const count = document.querySelector('#catalogCount');
const cartCount = document.querySelector('#cartCount');
const zeroNotice = document.querySelector('#zeroNotice');

let items = [];
let categories = [];
let cart = JSON.parse(localStorage.getItem('cart') || '[]');
let showZero = false;

function updateCartCount() {
  if (cartCount) cartCount.textContent = cart.length;
}

function stock(p) {
  return Number(p.stock ?? p.quantity ?? p.count ?? 0);
}

function stockText(p) {
  const s = stock(p);
  if (s > 10) return 'В наличии больше 10';
  if (s > 0) return 'В наличии меньше 10';
  return 'Нет в наличии';
}

function title(p) {
  return p.title || p.name || 'Товар';
}

function image(p) {
  return p.image || p.imageUrl || p.photo || '';
}

function oldPrice(p) {
  return Number(p.oldPrice || p.priceBefore || p.compareAtPrice || 0);
}

function discountPercent(p) {
  const manual = Number(p.discountPercent || p.discount || 0);
  if (manual > 0) return manual;

  const old = oldPrice(p);
  const price = Number(p.price || 0);

  if (old > price && price > 0) return Math.round(((old - price) / old) * 100);
  return 0;
}

function priceBlock(p) {
  const price = Number(p.price || 0);
  const old = oldPrice(p);
  const discount = discountPercent(p);

  return `
    <div class="catalog-price-wrap">
      ${old > price && old > 0 ? `<div class="catalog-card-oldprice">${fmt.format(old)} ₽</div>` : ''}
      <div class="catalog-card-price">${fmt.format(price)} ₽</div>
      ${discount > 0 ? `<div class="catalog-card-discount">-${discount}%</div>` : ''}
    </div>
  `;
}

async function getCollection(name) {
  const snap = await getDocs(collection(db, name));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function renderCatalogMenu() {
  const parentsBox = document.querySelector('#catalogParents');
  const childrenBox = document.querySelector('#catalogChildren');
  const titleBox = document.querySelector('#megaTitle');

  if (!parentsBox || !childrenBox || !titleBox) return;

  const parents = categories.filter(c => !c.parentId);
  const children = categories.filter(c => c.parentId);

  function catName(c) {
    return c.title || c.name || 'Без названия';
  }

  function renderChildren(parent) {
    const list = children.filter(c => c.parentId === parent.id || c.parentId === parent.externalId);
    titleBox.textContent = catName(parent);

    childrenBox.innerHTML = list.length
      ? list.map(child => `
        <a href="catalog.html?category=${encodeURIComponent(catName(child))}" class="mega-child">
          <span>${child.icon || 'AS'}</span>
          <div><b>${catName(child)}</b><small>Смотреть товары</small></div>
        </a>
      `).join('')
      : `
        <a href="catalog.html?category=${encodeURIComponent(catName(parent))}" class="mega-child">
          <span>${parent.icon || 'AS'}</span>
          <div><b>Все товары категории</b><small>${catName(parent)}</small></div>
        </a>
      `;
  }

  parentsBox.innerHTML = parents.length
    ? parents.map((parent, index) => `
      <button class="mega-parent ${index === 0 ? 'active' : ''}" type="button" data-parent="${parent.id}">
        <span>${parent.icon || 'AS'}</span>${catName(parent)}
      </button>
    `).join('')
    : '<p class="muted">Категорий пока нет</p>';

  if (parents[0]) renderChildren(parents[0]);

  document.querySelectorAll('.mega-parent').forEach(btn => {
    btn.addEventListener('mouseenter', () => {
      document.querySelectorAll('.mega-parent').forEach(b => b.classList.remove('active'));
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

function setupAuth() {
  const modal = document.querySelector('#authModal');
  const openAuth = document.querySelector('#openAuth');
  const closeAuth = document.querySelector('#closeAuth');
  const accountDrop = document.querySelector('#accountDrop');
  const accountBtn = document.querySelector('#accountBtn');
  const userEmail = document.querySelector('#userEmail');
  const logout = document.querySelector('#logout');

  if (openAuth && modal) {
    openAuth.onclick = () => modal.classList.add('open');
  }

  if (closeAuth && modal) {
    closeAuth.onclick = () => modal.classList.remove('open');
  }

  document.querySelectorAll('.tab').forEach(t => {
    t.onclick = () => {
      document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      document.querySelector('#loginForm').style.display = t.dataset.tab === 'login' ? 'block' : 'none';
      document.querySelector('#registerForm').style.display = t.dataset.tab === 'register' ? 'block' : 'none';
    };
  });

  const loginForm = document.querySelector('#loginForm');
  if (loginForm) {
    loginForm.onsubmit = async e => {
      e.preventDefault();
      await signInWithEmailAndPassword(auth, document.querySelector('#loginEmail').value.trim(), document.querySelector('#loginPass').value);
      modal.classList.remove('open');
    };
  }

  const registerForm = document.querySelector('#registerForm');
  if (registerForm) {
    registerForm.onsubmit = async e => {
      e.preventDefault();
      const res = await createUserWithEmailAndPassword(auth, document.querySelector('#regEmail').value.trim(), document.querySelector('#regPass').value);
      await setDoc(doc(db, COLLECTIONS.users, res.user.uid), {
        name: document.querySelector('#regName').value.trim(),
        email: document.querySelector('#regEmail').value.trim(),
        role: 'user',
        createdAt: new Date().toISOString()
      });
      await sendEmailVerification(res.user);
      alert('Аккаунт создан. Проверьте почту.');
      modal.classList.remove('open');
    };
  }

  onAuthStateChanged(auth, user => {
    if (user) {
      if (openAuth) openAuth.style.display = 'none';
      if (accountDrop) accountDrop.style.display = 'block';
      if (userEmail) userEmail.textContent = user.email || 'Аккаунт';
      if (accountBtn) accountBtn.textContent = 'Аккаунт ✓';

      if (logout) {
        logout.onclick = async () => {
          await signOut(auth);
          location.reload();
        };
      }
    } else {
      if (openAuth) {
        openAuth.style.display = 'inline-flex';
        openAuth.textContent = 'Аккаунт';
      }
      if (accountDrop) accountDrop.style.display = 'none';
    }
  });

  if (accountBtn && accountDrop) {
    accountBtn.onclick = e => {
      e.preventDefault();
      accountDrop.classList.toggle('open');
    };
  }
}

function setupHeaderButtons() {
  const cartBtn = document.querySelector('#cartBtn');
  const favBtn = document.querySelector('#favBtn');
  const searchForm = document.querySelector('.search');

  if (searchForm) searchForm.onsubmit = e => e.preventDefault();

  if (cartBtn) cartBtn.onclick = () => location.href = 'cart.html';
  if (favBtn) favBtn.onclick = () => alert('Избранное скоро будет доступно.');

  function goSearch() {
    const q = encodeURIComponent((topSearch?.value || '').trim());
    location.href = q ? `catalog.html?search=${q}` : 'catalog.html';
  }

  if (topSearchBtn) topSearchBtn.onclick = goSearch;

  if (topSearch) {
    topSearch.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        goSearch();
      }
    });
  }
}

async function load() {
  items = await getCollection(COLLECTIONS.products);

  try {
    categories = await getCollection(COLLECTIONS.categories);
    categories.sort((a, b) => {
      const ao = Number(a.order ?? 999999);
      const bo = Number(b.order ?? 999999);
      if (ao !== bo) return ao - bo;
      return String(a.title || a.name || '').localeCompare(String(b.title || b.name || ''), 'ru');
    });

    if (cat) {
      cat.innerHTML = '<option value="">Все категории</option>' + categories.map(c => {
        const name = c.title || c.name || 'Без названия';
        return `<option value="${name}">${name}</option>`;
      }).join('');
    }

    await renderCatalogMenu();
  } catch (e) {}

  const params = new URLSearchParams(location.search);
  const categoryFromUrl = params.get('category');
  const searchFromUrl = params.get('search');

  if (cat && categoryFromUrl) cat.value = categoryFromUrl;
  if (search && searchFromUrl) search.value = searchFromUrl;
  if (topSearch && searchFromUrl) topSearch.value = searchFromUrl;

  updateCartCount();
  render();
}

function render() {
  if (!grid) return;

  const q = (search?.value || '').toLowerCase();
  const c = cat?.value || '';

  let list = items.filter(p => {
    const text = `${p.code || ''} ${p.article || ''} ${title(p)} ${p.description || ''} ${p.category || ''}`.toLowerCase();
    if (c && p.category !== c) return false;
    if (q && !text.includes(q)) return false;
    if (!showZero && stock(p) <= 0) return false;
    return true;
  });

  if (sort?.value === 'priceAsc') list.sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
  if (sort?.value === 'priceDesc') list.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
  if (sort?.value === 'nameAsc') list.sort((a, b) => title(a).localeCompare(title(b), 'ru'));

  if (count) count.textContent = `${list.length} товаров`;

  if (zeroNotice) {
    zeroNotice.textContent = showZero ? 'Показаны все товары' : 'Товары с нулевым остатком скрыты';
  }

  grid.innerHTML = list.length
    ? list.map(p => `
      <article class="catalog-card">
        <a class="catalog-card-link" href="product.html?id=${p.id}">
          <div class="catalog-card-photo">
            ${image(p) ? `<img src="${image(p)}" alt="${title(p)}">` : '<span>Фото</span>'}
          </div>

          <div class="catalog-card-body">
            <h3>${title(p)}</h3>
            <div class="catalog-card-category">${p.category || 'Без категории'}</div>
            ${priceBlock(p)}
            <div class="catalog-card-stock">${stockText(p)}</div>
          </div>
        </a>

        <button class="catalog-cart-btn" data-id="${p.id}" type="button">В корзину</button>
      </article>
    `).join('')
    : '<div class="notice">Товары не найдены.</div>';

  document.querySelectorAll('[data-id]').forEach(btn => {
    btn.onclick = e => {
      e.preventDefault();
      e.stopPropagation();
      cart.push(btn.dataset.id);
      localStorage.setItem('cart', JSON.stringify(cart));
      updateCartCount();
      btn.textContent = 'Добавлено';
      setTimeout(() => btn.textContent = 'В корзину', 900);
    };
  });

  setTimeout(() => {
    window.scrollTo(0, window.scrollY);
    document.documentElement.scrollLeft = 0;
    document.body.scrollLeft = 0;
  }, 0);
}

search?.addEventListener('input', render);
cat?.addEventListener('change', render);
sort?.addEventListener('change', render);

if (zeroNotice) {
  zeroNotice.onclick = () => {
    if (!showZero) {
      if (confirm('Показать все товары, включая товары с нулевым остатком?')) {
        showZero = true;
        render();
      }
    } else {
      showZero = false;
      render();
    }
  };
}

setupAuth();
setupHeaderButtons();
load();