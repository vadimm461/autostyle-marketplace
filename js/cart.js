import { auth, db, COLLECTIONS } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { addDoc, collection, doc, getDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
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
const installmentBox = document.querySelector('#installmentBox') || document.querySelector('.installment-box');
const paymentInputs = [...document.querySelectorAll('input[name="paymentMethod"]')];

let productsCache = null;
let cart = normalizeCart(readCart());
let lastCartRows = [];
let lastCartTotal = 0;
let discountCardApplied = false;
let discountCardPercent = 0;
let isCheckoutBusy = false;

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
function getStockValue(p) {
  const raw = p?.stock ?? p?.quantity ?? p?.qty ?? p?.balance ?? p?.availableQty ?? p?.available ?? null;
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : null;
}
function stock(p) {
  const n = getStockValue(p);
  return n === null ? null : n;
}
function isOverStock(item, product) {
  const available = stock(product);
  return available !== null && (Number(item.qty) || 1) > available;
}
function cartHasStockProblems(rows) {
  return rows.some(({ item, product }) => {
    const available = stock(product);
    return available !== null && (available <= 0 || (Number(item.qty) || 1) > available);
  });
}
function code(p) { return p.code || p.sku || p.article || p.id || ''; }

async function getProductMap() {
  if (!productsCache) productsCache = await getProducts();
  return new Map(productsCache.map(p => [String(p.id), p]));
}

function calcInstallment(total) {
  return [
    { bank: 'Агропромбанк', className: 'agro', logo: 'assets/bank-agroprombank.jpg', rates: {3:.955, 6:.93, 9:.9, 12:.875} },
    { bank: 'Эксимбанк', className: 'exim', logo: 'assets/bank-eximbank.jpg', rates: {3:.955, 6:.93, 9:.9, 12:.886} },
    { bank: 'Сбербанк', className: 'sber', logo: 'assets/bank-sberbank.webp', rates: {3:.96, 6:.93, 9:.9, 12:.88} },
  ];
}
function getPaymentMethod() {
  return document.querySelector('input[name="paymentMethod"]:checked')?.value || 'cash';
}

function getDiscountedTotal(total) {
  const pct = discountCardApplied ? Math.max(0, Math.min(100, Number(discountCardPercent || 0))) : 0;
  return Math.max(0, Math.round(Number(total || 0) * (100 - pct) / 100));
}
function renderCartTotal(total) {
  const finalTotal = getDiscountedTotal(total);
  if (totalBox) {
    totalBox.innerHTML = discountCardApplied && discountCardPercent > 0
      ? `<span class="cart-total-old">${money(total)}</span> ${money(finalTotal)} <small>−${discountCardPercent}%</small>`
      : money(total);
  }
  renderInstallments(finalTotal);
}

function paymentTitle(value) {
  return {
    cash: 'Наличными',
    card: 'Банковской картой',
    installment: 'Рассрочка'
  }[value] || value || 'Наличными';
}

function updatePaymentUI() {
  const method = getPaymentMethod();
  document.querySelectorAll('.payment-option').forEach(label => {
    const input = label.querySelector('input[name="paymentMethod"]');
    label.classList.toggle('active', input?.value === method);
  });
  if (installmentBox) {
    installmentBox.hidden = method !== 'installment';
    if (method === 'installment') installmentBox.open = true;
  }
}

paymentInputs.forEach(input => input.addEventListener('change', updatePaymentUI));
updatePaymentUI();


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
    lastCartRows = [];
    lastCartTotal = 0;
    renderInstallments(0);
    return;
  }

  const total = rows.reduce((sum, r) => sum + Number(r.product.price || 0) * (Number(r.item.qty) || 1), 0);
  const totalQty = rows.reduce((sum, r) => sum + (Number(r.item.qty) || 1), 0);
  lastCartRows = rows;
  lastCartTotal = total;

  const hasStockProblems = cartHasStockProblems(rows);
  if (checkoutBtn) {
    checkoutBtn.disabled = hasStockProblems;
    checkoutBtn.classList.toggle('cart-checkout-disabled', hasStockProblems);
    checkoutBtn.title = hasStockProblems ? 'Исправьте количество товаров: оно превышает остаток на сайте.' : '';
  }

  cartList.innerHTML = rows.map(({ item, product }, index) => {
    const qty = Number(item.qty) || 1;
    const productTitle = title(product);
    const available = stock(product);
    const limited = available !== null;
    const overStock = limited && qty > available;
    const outOfStock = limited && available <= 0;
    const maxReached = limited && qty >= available;
    return `
      <article class="cart-row ${overStock || outOfStock ? 'cart-stock-error' : ''}" data-product-id="${product.id}">
        <button class="cart-product-open" type="button" data-index="${index}" title="Быстрый просмотр">
          <div class="cart-img">${image(product) ? `<img loading="lazy" decoding="async" src="${image(product)}" alt="${productTitle}">` : '<span>Фото</span>'}</div>
        </button>
        <div class="cart-product-info">
          <button class="cart-title-btn" type="button" data-index="${index}">${productTitle}</button>
          <p class="cart-meta">${group(product)}${code(product) ? ` · код: ${code(product)}` : ''}</p>
          <p class="cart-stock-line ${overStock || outOfStock ? 'bad' : ''}">${limited ? `В наличии: ${available}` : 'Остаток уточняется'}</p>
          ${overStock ? `<p class="cart-stock-warning">Нельзя заказать ${qty}. На сайте доступно только ${available}.</p>` : ''}
          ${outOfStock ? `<p class="cart-stock-warning">Товара сейчас нет в наличии.</p>` : ''}
          <strong class="cart-mobile-price">${money(Number(product.price || 0) * qty)}</strong>
          <button class="quick-view-btn" type="button" data-index="${index}"><img alt="" src="assets/icons/search.svg"> Быстрый просмотр</button>
        </div>
        <div class="cart-row-controls">
          <div class="qty cart-qty" aria-label="Количество товара">
            <button class="minus" data-index="${index}" type="button">−</button>
            <span>${qty}</span>
            <button class="plus" data-index="${index}" type="button" ${maxReached || outOfStock ? 'disabled' : ''}>+</button>
          </div>
          <strong class="cart-line-price">${money(Number(product.price || 0) * qty)}</strong>
        </div>
        <button class="danger remove" data-index="${index}" type="button">Удалить</button>
      </article>`;
  }).join('');

  renderCartTotal(total);
  if (countBox) countBox.textContent = String(totalQty);

  document.querySelectorAll('.plus').forEach(btn => btn.onclick = () => {
    const i = Number(btn.dataset.index);
    const row = rows[i];
    const available = row ? stock(row.product) : null;
    const current = Number(cart[i].qty) || 1;
    if (available !== null && current >= available) {
      alert(`Больше добавить нельзя. В наличии только ${available}.`);
      return;
    }
    cart[i].qty = current + 1;
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
    updatePaymentUI();
    return;
  }

  const banks = calcInstallment(total);
  inst.innerHTML = banks.map(({bank, className, logo, rates}, idx) => {
    const monthsHtml = Object.entries(rates).map(([months, k]) => {
      const payment = Math.ceil(total * k / Number(months));
      return `<button class="bank-month" type="button" data-months="${months}" data-payment="${payment}">
        <em>${months} мес.</em><strong>${money(payment)}/мес.</strong>
      </button>`;
    }).join('');

    return `
      <div class="installment-bank ${className} ${idx === 0 ? 'selected' : ''}" data-bank="${bank}" aria-expanded="${idx === 0 ? 'true' : 'false'}">
        <button class="bank-head" type="button">
          <img src="${logo}" alt="${bank}">
          <b>${bank}</b>
          <i>${idx === 0 ? 'Выбрано' : 'Выбрать'}</i>
        </button>
        <div class="bank-months">${monthsHtml}</div>
      </div>`;
  }).join('');

  inst.querySelectorAll('.installment-bank').forEach(card => {
    const head = card.querySelector('.bank-head');
    head?.addEventListener('click', () => {
      inst.querySelectorAll('.installment-bank').forEach(x => {
        x.classList.remove('selected');
        x.setAttribute('aria-expanded', 'false');
        const label = x.querySelector('.bank-head i');
        if (label) label.textContent = 'Выбрать';
      });
      card.classList.add('selected');
      card.setAttribute('aria-expanded', 'true');
      const label = card.querySelector('.bank-head i');
      if (label) label.textContent = 'Выбрано';
      if (!card.querySelector('.bank-month.selected')) {
        card.querySelector('.bank-month[data-months="12"]')?.classList.add('selected');
      }
    });
    const defaultMonth = card.querySelector('.bank-month[data-months="12"]') || card.querySelector('.bank-month');
    if (defaultMonth) defaultMonth.classList.add('selected');
  });

  inst.querySelectorAll('.bank-month').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const bank = btn.closest('.installment-bank');
      bank?.querySelectorAll('.bank-month').forEach(x => x.classList.remove('selected'));
      btn.classList.add('selected');
      if (bank && !bank.classList.contains('selected')) bank.querySelector('.bank-head')?.click();
    });
  });

  updatePaymentUI();
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
        <div class="quick-tags"><span>${group(product)}</span><span class="stock-pill">В наличии: ${stock(product) === null ? '—' : stock(product)}</span></div>
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
async function getActiveDiscountCard(user) {
  if (!user) return null;
  const profile = await getUserProfile(user);
  const active = Boolean(profile?.discountCard?.active || profile?.discountCardActive);
  if (!active) return null;
  let percent = Number(profile?.discountCard?.discount ?? profile?.discountCard?.discountPercent ?? profile?.discount ?? profile?.discountPercent ?? 0) || 0;
  try {
    const cardSnap = await getDoc(doc(db, COLLECTIONS.discountCards || 'autostyle_discount_cards', user.uid));
    if (cardSnap.exists()) {
      const card = cardSnap.data();
      percent = Number(card.discount ?? card.discountPercent ?? percent) || percent;
    }
  } catch(e) { console.warn('discount card percent load error', e); }
  return { active:true, percent: Math.max(0, Math.min(100, Math.round(percent))) };
}
async function hasActiveDiscountCard(user) {
  const card = await getActiveDiscountCard(user);
  return Boolean(card?.active);
}

if (discountCardBtn) {
  discountCardBtn.onclick = async () => {
    const user = auth.currentUser;
    if (!user) {
      alert('Скидочная карта доступна после входа в аккаунт.');
      location.href = 'login.html';
      return;
    }
    const card = await getActiveDiscountCard(user);
    if (!card?.active) {
      alert('Сначала получите скидочную карту в личном кабинете. Заполните профиль и нажмите «Получить скидочную карту».');
      location.href = 'profile.html#discount-card';
      return;
    }
    discountCardApplied = true;
    discountCardPercent = Number(card.percent || 0);
    discountCardBtn.classList.add('applied');
    discountCardBtn.textContent = discountCardPercent > 0 ? `Скидка ${discountCardPercent}% применена` : 'Скидочная карта применена';
    renderCartTotal(lastCartTotal);
  };
}
checkoutBtn && (checkoutBtn.onclick = createOrderFromCart);

async function getUserProfile(user) {
  if (!user) return null;
  try {
    const snap = await getDoc(doc(db, COLLECTIONS.users || 'autostyle_users', user.uid));
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    console.warn('user profile load error', err);
    return null;
  }
}

function getSelectedInstallment() {
  const selected = document.querySelector('.installment-bank.selected');
  if (!selected) return null;
  const bank = selected.dataset.bank || selected.querySelector('.bank-head b')?.textContent?.trim() || '';
  const month = selected.querySelector('.bank-month.selected') || selected.querySelector('.bank-month[data-months="12"]') || selected.querySelector('.bank-month');
  return {
    bank,
    months: Number(month?.dataset.months || 12),
    monthsTitle: `${Number(month?.dataset.months || 12)} мес.`,
    monthlyPayment: Number(month?.dataset.payment || 0),
    monthlyPaymentText: month?.querySelector('strong')?.textContent?.trim() || ''
  };
}

async function createOrderFromCart() {
  const user = auth.currentUser;
  if (!user) {
    alert('Оформить заказ можно только после входа в аккаунт.');
    location.href = 'login.html';
    return;
  }

  if (isCheckoutBusy) return;
  isCheckoutBusy = true;
  if (checkoutBtn) {
    checkoutBtn.disabled = true;
    checkoutBtn.textContent = 'Создаём заказ...';
  }

  try {
    const productMap = await getProductMap();
    const rows = normalizeCart(readCart()).map(item => ({ item, product: productMap.get(String(item.id)) })).filter(r => r.product);
    if (!rows.length) {
      alert('Корзина пустая. Добавь товары перед оформлением заказа.');
      return;
    }

    const stockProblem = rows.find(({ item, product }) => {
      const available = stock(product);
      return available !== null && (available <= 0 || (Number(item.qty) || 1) > available);
    });
    if (stockProblem) {
      const available = stock(stockProblem.product);
      alert(`Нельзя оформить заказ: «${title(stockProblem.product)}». В корзине ${Number(stockProblem.item.qty) || 1}, а в наличии ${available}.`);
      await render();
      return;
    }

    const profile = await getUserProfile(user);
    const items = rows.map(({ item, product }) => {
      const qty = Number(item.qty) || 1;
      const price = Number(product.price || 0);
      return {
        productId: String(product.id),
        title: title(product),
        group: group(product),
        code: code(product),
        image: image(product),
        price,
        qty,
        lineTotal: price * qty
      };
    });
    const subtotal = items.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0);
    const total = getDiscountedTotal(subtotal);
    const totalQty = items.reduce((sum, item) => sum + Number(item.qty || 0), 0);
    const orderNumber = `AS-${Date.now().toString().slice(-8)}`;
    const paymentMethod = getPaymentMethod();
    const installment = paymentMethod === 'installment' ? getSelectedInstallment() : null;
    if (paymentMethod === 'installment' && !installment?.bank) {
      alert('Выберите банк для рассрочки.');
      return;
    }

    await addDoc(collection(db, COLLECTIONS.orders || 'autostyle_orders'), {
      orderNumber,
      status: 'new',
      statusTitle: 'Новый',
      userId: user.uid,
      userEmail: user.email || '',
      userName: profile?.name || user.displayName || '',
      userPhone: profile?.phone || '',
      userCar: profile?.car || profile?.carText || '',
      items,
      subtotal,
      total,
      totalQty,
      discountCardApplied,
      discountCardPercent: discountCardApplied ? discountCardPercent : 0,
      paymentMethod,
      paymentMethodTitle: paymentTitle(paymentMethod),
      installment: installment ? {
        bank: String(installment.bank || ''),
        months: Number(installment.months || 0),
        monthsTitle: String(installment.monthsTitle || ''),
        monthlyPayment: Number(installment.monthlyPayment || 0),
        monthlyPaymentText: String(installment.monthlyPaymentText || '')
      } : null,
      installmentBank: installment?.bank ? String(installment.bank) : '',
      installmentMonths: installment?.months || null,
      installmentMonthlyPayment: installment?.monthlyPayment || null,
      discountCardRequested: false,
      createdAt: serverTimestamp(),
      createdAtText: new Date().toISOString(),
      source: 'site-cart'
    });

    cart = [];
    save();
    await render();
    alert(`Заказ ${orderNumber} создан и отправлен в админку.`);
  } catch (err) {
    console.error('order create error', err);
    alert('Не удалось оформить заказ: ' + (err?.message || err));
  } finally {
    isCheckoutBusy = false;
    if (checkoutBtn) {
      checkoutBtn.disabled = false;
      checkoutBtn.textContent = 'Оформить заказ';
    }
  }
}

function waitAccountMenu(cb, tries = 20) {
  if (window.AutoStyleAccountMenu) return cb();
  if (tries <= 0) return;
  setTimeout(() => waitAccountMenu(cb, tries - 1), 100);
}

// Важно: не очищаем корзину просто из-за гостевого режима. Очистка делается только при явном выходе из аккаунта в общем коде сайта.
onAuthStateChanged(auth, user => {
  waitAccountMenu(() => {
    if (user) {
      window.AutoStyleAccountMenu.renderUser(user, async () => {
        localStorage.removeItem('cart');
        localStorage.removeItem('favorites');
        await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js').then(m => m.signOut(auth));
        location.href = 'index.html';
      });
    } else {
      window.AutoStyleAccountMenu.renderGuest();
    }
  });
  cart = normalizeCart(readCart());
  render().finally(() => window.AutoStyleLoader?.hide?.());
});
