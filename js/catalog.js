import { db, COLLECTIONS } from './firebase.js';

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

let items = [];
let cart = JSON.parse(localStorage.getItem('cart') || '[]');

function updateCartCount() {
  if (cartCount) cartCount.textContent = cart.length;
}

function stock(p) {
  return Number(p.stock ?? p.quantity ?? p.count ?? 0);
}

function title(p) {
  return p.title || p.name || 'Товар';
}

function image(p) {
  return p.image || p.imageUrl || p.photo || '';
}

async function load() {
  const productsSnap = await getDocs(collection(db, COLLECTIONS.products));
  items = productsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  items = items.filter(p => stock(p) > 0);

  try {
    const catSnap = await getDocs(collection(db, COLLECTIONS.categories));
    const cats = catSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    cats.sort((a, b) => Number(a.order ?? 999999) - Number(b.order ?? 999999));

    if (cat) {
      cat.innerHTML = '<option value="">Все категории</option>' + cats.map(c => {
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

  updateCartCount();
  render();
}

function render() {
  if (!grid) return;

  const q = (search?.value || '').toLowerCase();
  const c = cat?.value || '';

  let list = items.filter(p => {
    const text = `${p.code || ''} ${title(p)} ${p.description || ''} ${p.category || ''}`.toLowerCase();
    if (c && p.category !== c) return false;
    if (q && !text.includes(q)) return false;
    return stock(p) > 0;
  });

  if (sort?.value === 'priceAsc') list.sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
  if (sort?.value === 'priceDesc') list.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
  if (sort?.value === 'nameAsc') list.sort((a, b) => title(a).localeCompare(title(b), 'ru'));

  if (count) count.textContent = `${list.length} товаров`;

  grid.innerHTML = list.length
    ? list.map(p => `
      <a class="product-card product-card-link" href="product.html?id=${p.id}">
        <div class="product-img">${image(p) ? `<img src="${image(p)}" alt="${title(p)}">` : 'Фото'}</div>
        <div class="product-title">${title(p)}</div>
        <div class="muted">${p.category || 'Без категории'}${p.code ? ` · код: ${p.code}` : ''}</div>
        <div class="price">${fmt.format(Number(p.price || 0))} ₽</div>
        <div class="stock in-stock">В наличии: ${stock(p)}</div>
        <button class="cart" data-id="${p.id}" type="button">В корзину</button>
      </a>
    `).join('')
    : '<div class="notice">Товары не найдены или их нет в наличии.</div>';

  document.querySelectorAll('[data-id]').forEach(btn => {
    btn.onclick = e => {
      e.preventDefault();
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

load();
