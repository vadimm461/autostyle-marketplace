import { auth, db, COLLECTIONS } from './firebase.js';

import {
  onAuthStateChanged,
  signOut
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

import {
  collection,
  getDocs
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const fmt = new Intl.NumberFormat('ru-RU');

const grid = document.querySelector('#catalogGrid');
const search = document.querySelector('#search');
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

function setupAuthHeader() {
  const openAuth = document.querySelector('#openAuth');
  const accountDrop = document.querySelector('#accountDrop');
  const accountBtn = document.querySelector('#accountBtn');
  const userEmail = document.querySelector('#userEmail');
  const logout = document.querySelector('#logout');

  onAuthStateChanged(auth, user => {
    if (user) {
      if (openAuth) openAuth.style.display = 'none';

      if (accountDrop) {
        accountDrop.style.display = 'block';
        accountDrop.classList.add('active-account');
      }

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

      if (accountDrop) {
        accountDrop.style.display = 'none';
        accountDrop.classList.remove('active-account');
      }
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
  document.querySelectorAll('.catalog-btn').forEach(btn => {
    btn.type = 'button';
    btn.onclick = e => {
      const menu = document.querySelector('.catalog-menu');
      if (!menu) return;
      menu.classList.toggle('open');
    };
  });

  const cartBtn = [...document.querySelectorAll('.icon-btn')].find(b => b.textContent.includes('Корзина'));
  if (cartBtn) {
    cartBtn.type = 'button';
    cartBtn.onclick = () => location.href = 'cart.html';
  }

  const favBtn = [...document.querySelectorAll('.icon-btn')].find(b => b.textContent.includes('Избранное'));
  if (favBtn) {
    favBtn.type = 'button';
    favBtn.onclick = () => alert('Избранное скоро будет доступно.');
  }

  const searchFormBtn = document.querySelector('.search button');
  const siteSearchInput = document.querySelector('.search input');

  if (searchFormBtn && siteSearchInput) {
    searchFormBtn.type = 'button';
    searchFormBtn.onclick = () => {
      const q = encodeURIComponent(siteSearchInput.value.trim());
      location.href = q ? `catalog.html?search=${q}` : 'catalog.html';
    };
  }

  if (siteSearchInput) {
    siteSearchInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const q = encodeURIComponent(siteSearchInput.value.trim());
        location.href = q ? `catalog.html?search=${q}` : 'catalog.html';
      }
    });
  }
}

async function load() {
  const productsSnap = await getDocs(collection(db, COLLECTIONS.products));
  items = productsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  try {
    const catSnap = await getDocs(collection(db, COLLECTIONS.categories));
    categories = catSnap.docs.map(d => ({ id: d.id, ...d.data() }));
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
  } catch (e) {}

  const params = new URLSearchParams(location.search);
  const categoryFromUrl = params.get('category');
  const searchFromUrl = params.get('search');

  if (cat && categoryFromUrl) cat.value = categoryFromUrl;
  if (search && searchFromUrl) search.value = searchFromUrl;

  const topSearch = document.querySelector('.search input');
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
    zeroNotice.textContent = showZero
      ? 'Показаны все товары'
      : 'Товары с нулевым остатком скрыты';
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
            <div class="catalog-card-price">${fmt.format(Number(p.price || 0))} ₽</div>
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
}

search?.addEventListener('input', render);
cat?.addEventListener('change', render);
sort?.addEventListener('change', render);

setupAuthHeader();
setupHeaderButtons();
load();
