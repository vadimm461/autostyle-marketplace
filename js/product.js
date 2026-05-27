import { db, COLLECTIONS } from './firebase.js';

import {
  doc,
  getDoc
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const $ = s => document.querySelector(s);

let cart = JSON.parse(localStorage.getItem('cart') || '[]');

function money(v) {
  return `${Number(v || 0).toLocaleString('ru-RU')} ₽`;
}

function stock(p) {
  return Number(p.stock ?? p.quantity ?? p.count ?? 0);
}

function title(p) {
  return p.title || p.name || 'Без названия';
}

function image(p) {
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
function priceHtml(p, cls='price-big') {
  const d = discountInfo(p);
  return `<div class="product-price-wrap"><span class="${cls} price-current">${money(d.price)}</span>${d.oldPrice ? `<span class="price-old">${money(d.oldPrice)}</span>` : ''}${d.discount ? `<span class="discount-badge">-${d.discount}%</span>` : ''}</div>`;
}

function saveCart() {
  localStorage.setItem('cart', JSON.stringify(cart));
  const c = $('#cartCount');
  if (c) c.textContent = cart.length;
}

function setupSearch() {
  const input = $('#siteSearch');
  const btn = $('#siteSearchBtn');

  function go() {
    const q = encodeURIComponent((input?.value || '').trim());
    location.href = q ? `catalog.html?search=${q}` : 'catalog.html';
  }

  if (btn) btn.onclick = go;
  if (input) input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      go();
    }
  });
}

async function loadProduct() {
  const box = $('#productView');
  if (!box) return;

  box.innerHTML = '<div class="app-loader">Загружаем товар...</div>';

  const id = new URLSearchParams(location.search).get('id');

  if (!id) {
    box.innerHTML = '<div class="product-message">Товар не найден.</div>';
    return;
  }

  try {
    const snap = await getDoc(doc(db, COLLECTIONS.products, id));

    if (!snap.exists()) {
      box.innerHTML = '<div class="product-message">Товар удалён или не найден.</div>';
      return;
    }

    const p = { id: snap.id, ...snap.data() };
    const s = stock(p);
    const name = title(p);
    const img = image(p);

    document.title = `${name} — AutoStyle`;

    box.innerHTML = `
      <div class="product-gallery">
        <div class="promo-strip"><b>🔥 Акция</b><span>AutoStyle</span></div>
        <div class="main-photo">${discountInfo(p).discount ? `<span class="card-discount-badge">-${discountInfo(p).discount}%</span>` : ''}${img ? `<img src="${img}" alt="${name}">` : `<div class="photo-empty">Фото</div>`}</div>
        <div class="photo-dots"><span class="active"></span><span></span><span></span></div>
        <div class="floating-tags">
          <span>Хит</span>
          <span>${p.category || 'Каталог'}</span>
          ${p.code ? `<span>Код: ${p.code}</span>` : ''}
        </div>
      </div>

      <div class="product-info-panel">
        <div class="breadcrumbs">
          <a href="index.html">Главная</a><span>/</span>
          <a href="catalog.html">Каталог</a><span>/</span>
          <span>${p.category || 'Товар'}</span>
        </div>

        <h1>${name}</h1>

        <div class="chips">
          ${p.code ? `<span>Код: ${p.code}</span>` : ''}
          ${p.category ? `<span>${p.category}</span>` : ''}
          ${p.externalId ? `<span>ID 1C: ${p.externalId}</span>` : ''}
        </div>

        <div class="viewer-row">
          <div>👤 <b>3</b> просматривают</div>
          <div>🛒 <b>${Math.max(cart.length, 1)}</b> в корзине</div>
          <div>❤️ <b>5</b> в избранном</div>
        </div>

        <div class="buy-card">
          <div>
            ${priceHtml(p, 'price-big')}
            ${s > 0 ? `<div class="stock-ok">В наличии: ${s}</div>` : `<div class="stock-zero">Нет в наличии</div>`}
          </div>
          <button id="addToCart" class="buy-btn" ${s <= 0 ? 'disabled' : ''}>🛒 В корзину</button>
          <button class="quick-btn" type="button">Купить в 1 клик</button>
        </div>

        <section class="product-block">
          <h2>Описание</h2>
          <p>${p.description || 'Описание товара пока не добавлено. Данные товара синхронизируются с 1С.'}</p>
        </section>

        <section class="product-block">
          <h2>Характеристики</h2>
          <div class="spec"><span>Название</span><b>${name}</b></div>
          <div class="spec"><span>Код товара</span><b>${p.code || 'Не указан'}</b></div>
          <div class="spec"><span>Категория</span><b>${p.category || 'Без категории'}</b></div>
          <div class="spec"><span>Остаток</span><b>${s}</b></div>
          <div class="spec"><span>Цена</span><b>${money(p.price)}</b></div>
          ${discountInfo(p).oldPrice ? `<div class="spec"><span>Цена до скидки</span><b>${money(discountInfo(p).oldPrice)}</b></div>` : ''}
          ${discountInfo(p).discount ? `<div class="spec"><span>Скидка</span><b>${discountInfo(p).discount}%</b></div>` : ''}
        </section>
      </div>
    `;

    const btn = $('#addToCart');
    if (btn) {
      btn.onclick = () => {
        if (s <= 0) return;
        cart.push(p.id);
        saveCart();
        btn.textContent = '✓ Добавлено';
        setTimeout(() => btn.textContent = '🛒 В корзину', 1200);
      };
    }
  } catch (err) {
    box.innerHTML = `<div class="product-message">Ошибка загрузки: ${err.message}</div>`;
  }
}

saveCart();
setupSearch();
loadProduct();
