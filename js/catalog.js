import { db, COLLECTIONS } from './firebase.js';

import {
  collection,
  getDocs
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const fmt = new Intl.NumberFormat('ru-RU');

const grid = document.querySelector('#catalogGrid');
const search = document.querySelector('#search');
const cat = document.querySelector('#category');

let items = [];

function productStock(p) {
  return Number(p.stock ?? p.quantity ?? p.count ?? 0);
}

function onlyInStock(products) {
  return products.filter(p => productStock(p) > 0);
}

function productTitle(p) {
  return p.title || p.name || 'Товар';
}

function productImage(p) {
  return p.image || p.imageUrl || p.photo || 'assets/placeholder.svg';
}

async function load() {
  const snap = await getDocs(collection(db, COLLECTIONS.products));
  items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  items = onlyInStock(items);

  const params = new URLSearchParams(location.search);
  const categoryFromUrl = params.get('category');
  const searchFromUrl = params.get('search');

  if (cat && categoryFromUrl) cat.value = categoryFromUrl;
  if (search && searchFromUrl) search.value = searchFromUrl;

  render();
}

function render() {
  if (!grid) return;

  const q = (search?.value || '').toLowerCase();
  const c = cat?.value || '';

  const list = items.filter(p => {
    const text = `${p.code || ''} ${productTitle(p)} ${p.description || ''} ${p.category || ''}`.toLowerCase();

    if (c && p.category !== c) return false;
    if (q && !text.includes(q)) return false;

    return productStock(p) > 0;
  });

  grid.innerHTML = list.length
    ? list.map(p => `
      <a class="product" href="product.html?id=${p.id}">
        <img class="pimg" src="${productImage(p)}" alt="${productTitle(p)}">

        <div class="pbody">
          <span class="chip">${p.category || 'AutoStyle'}</span>
          ${p.code ? `<span class="chip">Код: ${p.code}</span>` : ''}

          <h3>${productTitle(p)}</h3>

          <div class="price">${fmt.format(Number(p.price || 0))} ₽</div>
          <p class="muted">В наличии: ${productStock(p)}</p>
          <p class="muted">${(p.description || '').slice(0, 100)}</p>
        </div>
      </a>
    `).join('')
    : '<div class="notice">Товары не найдены или их нет в наличии.</div>';
}

search?.addEventListener('input', render);
cat?.addEventListener('change', render);

load();
