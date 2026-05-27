import { db, COLLECTIONS } from './firebase.js';

import {
  doc,
  getDoc
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const cartList = document.querySelector('#cartList');
const totalBox = document.querySelector('#cartTotal');
const countBox = document.querySelector('#cartItemsCount');
const cartCount = document.querySelector('#cartCount');
const clearBtn = document.querySelector('#clearCart');
const checkoutBtn = document.querySelector('#checkoutBtn');

let cart = JSON.parse(localStorage.getItem('cart') || '[]');

function money(v) {
  return `${Number(v || 0).toLocaleString('ru-RU')} ₽`;
}

function save() {
  localStorage.setItem('cart', JSON.stringify(cart));
  if (cartCount) cartCount.textContent = cart.length;
}

async function loadProduct(id) {
  const snap = await getDoc(doc(db, COLLECTIONS.products, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
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

  const products = (await Promise.all(cart.map(id => loadProduct(id)))).filter(Boolean);
  const total = products.reduce((sum, p) => sum + Number(p.price || 0), 0);

  cartList.innerHTML = products.map((p, index) => `
    <div class="cart-row">
      <div class="cart-img">${p.image ? `<img src="${p.image}" alt="${p.title || p.name}">` : 'Фото'}</div>
      <div>
        <b>${p.title || p.name || 'Товар'}</b>
        <p class="muted">${p.category || 'Без категории'} ${p.code ? `· код: ${p.code}` : ''}</p>
        <strong>${money(p.price)}</strong>
      </div>
      <button class="danger remove" data-index="${index}">Удалить</button>
    </div>
  `).join('');

  if (totalBox) totalBox.textContent = money(total);
  if (countBox) countBox.textContent = String(products.length);

  document.querySelectorAll('.remove').forEach(btn => {
    btn.onclick = () => {
      cart.splice(Number(btn.dataset.index), 1);
      render();
    };
  });
}

if (clearBtn) {
  clearBtn.onclick = () => {
    cart = [];
    render();
  };
}

if (checkoutBtn) {
  checkoutBtn.onclick = () => alert('Оформление заказа подключим следующим шагом.');
}

render();
