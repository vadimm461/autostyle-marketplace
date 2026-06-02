import { db, COLLECTIONS } from './firebase.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const $ = s => document.querySelector(s);
let cart = JSON.parse(localStorage.getItem('cart') || '[]');
let favs = JSON.parse(localStorage.getItem('favorites') || '[]');

const money = v => `${Number(v || 0).toLocaleString('ru-RU')} ₽`;
const stock = p => Number(p.stock ?? p.quantity ?? p.count ?? 0);
const title = p => p.title || p.name || 'Без названия';
const image = p => p.image || p.imageUrl || p.photo || '';
const group = p => p.group || p.category || p.categoryName || 'Без группы';
const oldPrice = p => Number(p.oldPrice || p.priceOld || p.compareAtPrice || 0);
const isInstallment = p => p.installment === true || p.installmentAvailable === true || p.credit === true;
function discount(p){
  const d = Number(p.discount || p.discountPercent || 0);
  if (d > 0) return d;
  const op = oldPrice(p), pr = Number(p.price || 0);
  return op > pr && pr > 0 ? Math.round((op - pr) / op * 100) : 0;
}
function saveCart(){
  localStorage.setItem('cart', JSON.stringify(cart));
  $('#cartCount') && ($('#cartCount').textContent = cart.length);
}
function saveFav(){ localStorage.setItem('favorites', JSON.stringify(favs)); }
function saveViewed(id){
  let v = JSON.parse(localStorage.getItem('viewedProducts') || '[]');
  v = v.filter(x => x !== id);
  v.unshift(id);
  localStorage.setItem('viewedProducts', JSON.stringify(v.slice(0, 12)));
}
function setupSearch(){
  const input = $('#siteSearch') || $('#homeSearch'), btn = $('#siteSearchBtn') || $('#homeSearchBtn');
  const go = () => {
    const q = encodeURIComponent((input?.value || '').trim());
    location.href = q ? `catalog.html?search=${q}` : 'catalog.html';
  };
  btn && (btn.onclick = go);
  input && input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
}
async function loadProduct(){
  const box = $('#productView');
  if (!box) return;
  const id = new URLSearchParams(location.search).get('id');
  if (!id) { box.innerHTML = '<div class="product-message">Товар не найден.</div>'; return; }
  try {
    const snap = await getDoc(doc(db, COLLECTIONS.products, id));
    if (!snap.exists()) { box.innerHTML = '<div class="product-message">Товар удалён или не найден.</div>'; return; }
    const p = { id: snap.id, ...snap.data() };
    const s = stock(p), name = title(p), img = image(p), d = discount(p), op = oldPrice(p), inst = isInstallment(p);
    saveViewed(p.id);
    document.title = `${name} — AutoStyle`;
    const favActive = favs.includes(p.id);
    box.innerHTML = `
      <div class="product-gallery product-card-clean">
        <div class="main-photo product-main-photo">
          ${d ? `<span class="discount-badge product-sale-badge">-${d}%</span>` : ''}
          ${img ? `<img src="${img}" alt="${name}">` : `<div class="photo-empty">Фото</div>`}
        </div>
      </div>
      <div class="product-info-panel product-card-clean product-info-clean">
        <div class="breadcrumbs product-breadcrumbs"><a href="index.html">Главная</a> / <a href="catalog.html">Каталог</a> / <span>${group(p)}</span></div>
        <h1>${name}</h1>
        <div class="product-meta-row"><span class="product-category-pill">${group(p)}</span>${d ? `<span class="product-discount-pill">Скидка ${d}%</span>` : ''}${inst ? `<span class="product-installment-pill">Доступно в рассрочку</span>` : ''}</div>
        <div class="buy-card product-buy-card">
          <div class="product-price-box">
            <div class="price-row-card product-price-row">
              <div class="price-big product-price-big">${money(p.price)}</div>
              ${op ? `<div class="old-price product-old-price">${money(op)}</div>` : ''}
            </div>
            ${s > 0 ? `<div class="stock-ok product-stock-ok">В наличии: ${s}</div>` : `<div class="stock-zero product-stock-zero">Нет в наличии</div>`}
          </div>
          <div class="product-actions">
            <button id="addToCart" class="buy-btn product-action-btn" ${s <= 0 ? 'disabled' : ''}>В корзину</button>
            <button id="favProduct" class="quick-btn product-fav-btn ${favActive ? 'active' : ''}" type="button">${favActive ? '♥ В избранном' : '♡ В избранное'}</button>
          </div>
        </div>
        <section class="product-block"><h2>Описание</h2><p>${p.description || 'Описание товара пока не добавлено.'}</p></section>
        <section class="product-block"><h2>Характеристики</h2>
          <div class="spec"><span>Название</span><b>${name}</b></div>
          <div class="spec"><span>Группа</span><b>${group(p)}</b></div>
          <div class="spec"><span>Остаток</span><b>${s}</b></div>
          <div class="spec"><span>Цена</span><b>${money(p.price)}</b></div>
          ${inst ? `<div class="spec"><span>Рассрочка</span><b>Доступна</b></div>` : ''}
          ${d ? `<div class="spec"><span>Скидка</span><b>${d}%</b></div>` : ''}
        </section>
      </div>`;
    $('#addToCart') && ($('#addToCart').onclick = () => {
      if (s <= 0) return;
      cart.push(p.id); saveCart();
      $('#addToCart').textContent = '✓ Добавлено';
      setTimeout(() => $('#addToCart').textContent = 'В корзину', 1200);
    });
    $('#favProduct') && ($('#favProduct').onclick = () => {
      favs = favs.includes(p.id) ? favs.filter(x => x !== p.id) : [...favs, p.id];
      saveFav();
      $('#favProduct').classList.toggle('active', favs.includes(p.id));
      $('#favProduct').textContent = favs.includes(p.id) ? '♥ В избранном' : '♡ В избранное';
    });
  } catch (err) {
    box.innerHTML = `<div class="product-message">Ошибка загрузки: ${err.message}</div>`;
  }
}
saveCart(); setupSearch(); loadProduct().finally(()=>window.AutoStyleLoader&&window.AutoStyleLoader.hide());
