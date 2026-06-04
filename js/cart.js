import { db, COLLECTIONS, auth } from './firebase.js';
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

let cart = JSON.parse(localStorage.getItem('cart') || '[]');
cart = cart.map(i => typeof i==='object'? i : {id:i,qty:1});

function clearCartAndFavorites(){
  localStorage.removeItem('cart');
  localStorage.removeItem('favorites');
  window.dispatchEvent(new Event('autostyle-storage-cleared'));
}


function money(v) {
  return `${Number(v || 0).toLocaleString('ru-RU')} ₽`;
}

function save() {
  localStorage.setItem('cart', JSON.stringify(cart));
  if (cartCount) cartCount.textContent = cart.reduce((s,i)=>s+(i.qty||1),0);
}

let productsCache = null;
async function loadProduct(id) {
  if (!productsCache) productsCache = await getProducts();
  return productsCache.find(p => String(p.id) === String(id)) || null;
}

async function render() {
  save();

  if (!cartList) return;

  if (!cart.length) {
    cartList.innerHTML = '<div class="info-card">Корзина пустая.</div>';
    if (totalBox) totalBox.textContent = '0 ₽';
    if (countBox) countBox.textContent = '0';
    return;
  }

  const products=(await Promise.all(cart.map(i=>loadProduct(i.id)))).filter(Boolean);
  const total = products.reduce((sum,p,idx)=>sum+Number(p.price||0)*(cart[idx]?.qty||1),0);

  cartList.innerHTML = products.map((p, index) => {
    const qty = cart[index]?.qty || 1;
    const title = p.title || p.name || 'Товар';
    return `
    <div class="cart-row" data-product-id="${p.id}">
      <button class="cart-product-open" type="button" data-index="${index}" title="Быстрый просмотр">
        <div class="cart-img">${p.image ? `<img loading="lazy" decoding="async" src="${p.image}" alt="${title}">` : 'Фото'}</div>
      </button>
      <div class="cart-product-info">
        <button class="cart-title-btn" type="button" data-index="${index}">${title}</button>
        <p class="muted">${p.category || 'Без категории'} ${p.code ? `· код: ${p.code}` : ''}</p>
        <div class="cart-product-bottom">
          <div class="qty cart-qty">
            <button class="minus" data-index="${index}" type="button">−</button>
            <span>${qty}</span>
            <button class="plus" data-index="${index}" type="button">+</button>
          </div>
          <strong>${money(Number(p.price || 0) * qty)}</strong>
        </div>
      </div>
      <button class="danger remove" data-index="${index}" type="button">Удалить</button>
    </div>`;
  }).join('');

  if (totalBox) totalBox.textContent = money(total);
  if (countBox) countBox.textContent = String(cart.reduce((s,i)=>s+(i.qty||1),0));
const inst=document.getElementById('installmentResults');
if(inst){
 const banks=[['Агропромбанк',{3:.955,6:.93,9:.9,12:.875}],['Эксимбанк',{3:.955,6:.93,9:.9,12:.886}],['Сбербанк',{3:.96,6:.93,9:.9,12:.88}]];
 inst.innerHTML = banks.map(([n,r]) => `
   <div class="installment-bank">
     <b>${n}</b>
     ${Object.entries(r).map(([m,k]) => `<div class="installment-row"><span>${m} мес.</span><strong>${money(Math.ceil(total * k / Number(m)))}/мес</strong></div>`).join('')}
   </div>
 `).join('');
}

  document.querySelectorAll('.plus').forEach(btn=>btn.onclick=()=>{cart[btn.dataset.index].qty=(cart[btn.dataset.index].qty||1)+1;render();});
  document.querySelectorAll('.minus').forEach(btn=>btn.onclick=()=>{let i=cart[btn.dataset.index];i.qty=Math.max(1,(i.qty||1)-1);render();});
  document.querySelectorAll('.cart-product-open,.cart-title-btn').forEach(btn=>btn.onclick=()=>openQuickProduct(products[Number(btn.dataset.index)]));
 document.querySelectorAll('.remove').forEach(btn => {
    btn.onclick = () => {
      cart.splice(Number(btn.dataset.index),1);
      render().finally(() => window.AutoStyleLoader && window.AutoStyleLoader.hide());
    };
  });
}


function openQuickProduct(product) {
  if (!product || !quickModal || !quickProductContent) return;
  const title = product.title || product.name || 'Товар';
  const oldPrice = Number(product.oldPrice || product.old_price || 0);
  const price = Number(product.price || 0);
  const hasDiscount = oldPrice > price && price > 0;
  quickProductContent.innerHTML = `
    <div class="quick-product">
      <div class="quick-product-img">${product.image ? `<img src="${product.image}" alt="${title}">` : 'Фото'}</div>
      <div class="quick-product-info">
        <div class="muted">${product.category || 'Без категории'}</div>
        <h2>${title}</h2>
        <div class="quick-price-line">
          <b>${money(price)}</b>
          ${hasDiscount ? `<span>${money(oldPrice)}</span>` : ''}
        </div>
        <p class="quick-stock">В наличии: ${Number(product.stock || product.quantity || product.qty || 0) || '—'}</p>
        <p class="quick-desc">${product.description || 'Описание товара пока не добавлено.'}</p>
        <div class="quick-actions">
          <a class="primary" href="product.html?id=${encodeURIComponent(product.id)}">Открыть карточку</a>
          <a class="secondary-btn" href="catalog.html">Продолжить покупки</a>
        </div>
      </div>
    </div>`;
  quickModal.classList.add('open');
  quickModal.setAttribute('aria-hidden','false');
}

function closeQuickProduct() {
  if (!quickModal) return;
  quickModal.classList.remove('open');
  quickModal.setAttribute('aria-hidden','true');
}

if (quickModal) {
  quickModal.querySelector('.quick-modal-close')?.addEventListener('click', closeQuickProduct);
  quickModal.querySelector('.quick-modal-backdrop')?.addEventListener('click', closeQuickProduct);
  document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape') closeQuickProduct(); });
}

if (clearBtn) {
  clearBtn.onclick = () => {
    cart = [];
    render().finally(() => window.AutoStyleLoader && window.AutoStyleLoader.hide());
  };
}

if (discountCardBtn) {
  discountCardBtn.onclick = () => alert('Скидочную карту подключим следующим шагом.');
}

if (checkoutBtn) {
  checkoutBtn.onclick = () => alert('Оформление заказа подключим следующим шагом.');
}

onAuthStateChanged(auth, user => {
  if (!user) { clearCartAndFavorites(); cart = []; }
  else { cart = JSON.parse(localStorage.getItem('cart') || '[]'); }
  render().finally(() => window.AutoStyleLoader && window.AutoStyleLoader.hide());
});
