import { auth } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getProducts } from './data-cache.js';

const cartList = document.querySelector('#cartList');
const totalBox = document.querySelector('#cartTotal');
const countBox = document.querySelector('#cartItemsCount');
const cartCount = document.querySelector('#cartCount');
const clearBtn = document.querySelector('#clearCart');
const checkoutBtn = document.querySelector('#checkoutBtn');
const discountCardBtn = document.querySelector('#discountCardBtn');
const quickModal = document.querySelector('#quickProductModal');
const quickProductContent = document.querySelector('#quickProductContent');

let productsCache = null;
let cart = normalizeCart(readCart());

function readCart() {
  try { return JSON.parse(localStorage.getItem('cart') || '[]'); }
  catch { return []; }
}

function normalizeCart(raw) {
  const map = new Map();
  (Array.isArray(raw) ? raw : []).forEach(item => {
    const id = typeof item === 'object' ? item.id : item;
    if (!id) return;
    const qty = Math.max(1, Number(typeof item === 'object' ? item.qty : 1) || 1);
    const key = String(id);
    map.set(key, { id: key, qty: (map.get(key)?.qty || 0) + qty });
  });
  return [...map.values()];
}

function save() {
  cart = normalizeCart(cart);
  localStorage.setItem('cart', JSON.stringify(cart));
  updateCartCounter();
}

function updateCartCounter() {
  const count = cart.reduce((s, i) => s + (Number(i.qty) || 1), 0);
  document.querySelectorAll('#cartCount,.cartCount').forEach(el => el.textContent = String(count));
}

function money(v) {
  return `${Math.round(Number(v || 0)).toLocaleString('ru-RU')} ₽`;
}

function title(p) { return p.title || p.name || p.productName || 'Товар'; }
function group(p) { return p.group || p.category || p.categoryName || 'Без категории'; }
function image(p) { return p.image || p.imageUrl || p.photo || p.photoUrl || p.img || ''; }
function stock(p) { return Number(p.stock ?? p.quantity ?? p.qty ?? p.balance ?? 0); }
function code(p) { return p.code || p.sku || p.article || p.id || ''; }

async function getProductMap() {
  if (!productsCache) productsCache = await getProducts();
  return new Map(productsCache.map(p => [String(p.id), p]));
}

function calcInstallment(total) {
  return [
    ['Агропромбанк', {3:.955, 6:.93, 9:.9, 12:.875}],
    ['Эксимбанк', {3:.955, 6:.93, 9:.9, 12:.886}],
    ['Сбербанк', {3:.96, 6:.93, 9:.9, 12:.88}],
  ].map(([bank, rates]) => ({ bank, rates }));
}

async function render() {
  save();
  if (!cartList) return;

  const productMap = await getProductMap();
  const rows = cart.map(item => ({ item, product: productMap.get(String(item.id)) })).filter(r => r.product);

  // Если товар удалили из Firebase, убираем его из корзины, но не очищаем корзину из-за отсутствия авторизации.
  if (rows.length !== cart.length) {
    cart = rows.map(r => r.item);
    save();
  }

  if (!rows.length) {
    cartList.innerHTML = `
      <div class="cart-empty-card">
        <h2>Корзина пустая</h2>
        <p>Добавь товары из каталога, а потом вернись к оформлению заказа.</p>
        <a href="catalog.html">Перейти в каталог</a>
      </div>`;
    if (totalBox) totalBox.textContent = '0 ₽';
    if (countBox) countBox.textContent = '0';
    renderInstallments(0);
    return;
  }

  const total = rows.reduce((sum, r) => sum + Number(r.product.price || 0) * (Number(r.item.qty) || 1), 0);
  const totalQty = rows.reduce((sum, r) => sum + (Number(r.item.qty) || 1), 0);

  cartList.innerHTML = rows.map(({ item, product }, index) => {
    const qty = Number(item.qty) || 1;
    const productTitle = title(product);
    return `
      <article class="cart-row" data-product-id="${product.id}">
        <button class="cart-product-open" type="button" data-index="${index}" title="Быстрый просмотр">
          <div class="cart-img">${image(product) ? `<img loading="lazy" decoding="async" src="${image(product)}" alt="${productTitle}">` : '<span>Фото</span>'}</div>
        </button>
        <div class="cart-product-info">
          <button class="cart-title-btn" type="button" data-index="${index}">${productTitle}</button>
          <p class="cart-meta">${group(product)}${code(product) ? ` · код: ${code(product)}` : ''}</p>
          <strong class="cart-mobile-price">${money(Number(product.price || 0) * qty)}</strong>
          <button class="quick-view-btn" type="button" data-index="${index}">👁 Быстрый просмотр</button>
        </div>
        <div class="cart-row-controls">
          <div class="qty cart-qty" aria-label="Количество товара">
            <button class="minus" data-index="${index}" type="button">−</button>
            <span>${qty}</span>
            <button class="plus" data-index="${index}" type="button">+</button>
          </div>
          <strong class="cart-line-price">${money(Number(product.price || 0) * qty)}</strong>
        </div>
        <button class="danger remove" data-index="${index}" type="button">Удалить</button>
      </article>`;
  }).join('');

  if (totalBox) totalBox.textContent = money(total);
  if (countBox) countBox.textContent = String(totalQty);
  renderInstallments(total);

  document.querySelectorAll('.plus').forEach(btn => btn.onclick = () => {
    const i = Number(btn.dataset.index);
    cart[i].qty = (Number(cart[i].qty) || 1) + 1;
    render();
  });
  document.querySelectorAll('.minus').forEach(btn => btn.onclick = () => {
    const i = Number(btn.dataset.index);
    cart[i].qty = Math.max(1, (Number(cart[i].qty) || 1) - 1);
    render();
  });
  document.querySelectorAll('.cart-product-open,.cart-title-btn,.quick-view-btn').forEach(btn => {
    btn.onclick = () => openQuickProduct(rows[Number(btn.dataset.index)]?.product);
  });
  document.querySelectorAll('.remove').forEach(btn => btn.onclick = () => {
    cart.splice(Number(btn.dataset.index), 1);
    render().finally(() => window.AutoStyleLoader?.hide?.());
  });
}

function renderInstallments(total) {
  const inst = document.getElementById('installmentResults');
  if (!inst) return;
  if (!total) {
    inst.innerHTML = '<div class="installment-empty">Добавь товары, чтобы рассчитать платеж.</div>';
    return;
  }
  inst.innerHTML = calcInstallment(total).map(({bank, rates}, idx) => `
    <label class="installment-bank ${idx === 0 ? 'selected' : ''}">
      <input type="radio" name="installmentBank" ${idx === 0 ? 'checked' : ''}>
      <span class="bank-head"><b>${bank}</b><i></i></span>
      <span class="bank-months">
        ${Object.entries(rates).map(([months, k]) => `
          <span><em>${months} мес.</em><strong>${money(Math.ceil(total * k / Number(months)))}/мес.</strong></span>`).join('')}
      </span>
    </label>`).join('');
  inst.querySelectorAll('.installment-bank').forEach(card => {
    card.addEventListener('click', () => {
      inst.querySelectorAll('.installment-bank').forEach(x => x.classList.remove('selected'));
      card.classList.add('selected');
    });
  });
}

function openQuickProduct(product) {
  if (!product || !quickModal || !quickProductContent) return;
  const productTitle = title(product);
  const price = Number(product.price || 0);
  const oldPrice = Number(product.oldPrice || product.old_price || 0);
  const hasDiscount = oldPrice > price && price > 0;
  quickProductContent.innerHTML = `
    <div class="quick-product">
      <div class="quick-product-img">${image(product) ? `<img src="${image(product)}" alt="${productTitle}">` : '<span>Фото</span>'}</div>
      <div class="quick-product-info">
        <button class="quick-modal-close-inline" type="button" aria-label="Закрыть">×</button>
        <h2>${productTitle}</h2>
        <div class="quick-tags"><span>${group(product)}</span><span class="stock-pill">В наличии: ${stock(product) || '—'}</span></div>
        <div class="quick-price-line"><b>${money(price)}</b>${hasDiscount ? `<span>${money(oldPrice)}</span>` : ''}</div>
        <p class="quick-desc"><b>Описание</b><br>${product.description || 'Описание товара пока не добавлено.'}</p>
        <div class="quick-actions">
          <a class="secondary-outline" href="catalog.html">Продолжить покупки</a>
          <a class="primary" href="product.html?id=${encodeURIComponent(product.id)}">Открыть карточку</a>
        </div>
      </div>
    </div>`;
  quickModal.classList.add('open');
  quickModal.setAttribute('aria-hidden', 'false');
  quickProductContent.querySelector('.quick-modal-close-inline')?.addEventListener('click', closeQuickProduct);
}

function closeQuickProduct() {
  if (!quickModal) return;
  quickModal.classList.remove('open');
  quickModal.setAttribute('aria-hidden', 'true');
}

quickModal?.querySelector('.quick-modal-close')?.addEventListener('click', closeQuickProduct);
quickModal?.querySelector('.quick-modal-backdrop')?.addEventListener('click', closeQuickProduct);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeQuickProduct(); });

clearBtn && (clearBtn.onclick = () => { cart = []; render().finally(() => window.AutoStyleLoader?.hide?.()); });
discountCardBtn && (discountCardBtn.onclick = () => alert('Скидочную карту подключим следующим шагом.'));
checkoutBtn && (checkoutBtn.onclick = () => alert('Оформление заказа подключим следующим шагом.'));

// Важно: не очищаем корзину просто из-за гостевого режима. Очистка делается только при явном выходе из аккаунта в общем коде сайта.
onAuthStateChanged(auth, () => {
  cart = normalizeCart(readCart());
  render().finally(() => window.AutoStyleLoader?.hide?.());
});
