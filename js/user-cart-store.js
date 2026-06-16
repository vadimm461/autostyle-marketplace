import { auth, db, COLLECTIONS } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const USERS_COLLECTION = COLLECTIONS.users || 'autostyle_users';
let currentUser = auth.currentUser || null;
let currentCart = [];
let readyPromise = null;

function userRef(user = currentUser) {
  return user ? doc(db, USERS_COLLECTION, user.uid) : null;
}

export function cartItemId(item) {
  if (!item) return '';
  if (typeof item !== 'object') return String(item);
  return String(item.id ?? item.productId ?? item.productID ?? item.product_id ?? item.uid ?? item.docId ?? item.documentId ?? item.sku ?? item.code ?? item.article ?? '');
}

export function normalizeUserCart(raw) {
  const map = new Map();
  (Array.isArray(raw) ? raw : []).forEach(item => {
    const id = cartItemId(item);
    if (!id) return;
    const qtyRaw = typeof item === 'object' ? (item.qty ?? item.quantity ?? item.count ?? 1) : 1;
    const qty = Math.max(1, Number(qtyRaw) || 1);
    const key = String(id);
    const prev = map.get(key);
    const snapshot = typeof item === 'object' ? { ...item, id: key } : { id: key };
    map.set(key, { ...snapshot, id: key, qty: (prev?.qty || 0) + qty });
  });
  return [...map.values()];
}

export function cartQtyCount(rows = currentCart) {
  return (Array.isArray(rows) ? rows : []).reduce((sum, item) => sum + (Number(item?.qty ?? item?.quantity ?? item?.count ?? 1) || 1), 0);
}

export function updateCartBadges(rows = currentCart) {
  const count = cartQtyCount(rows);
  document.querySelectorAll('#cartCount,.cartCount,#appCartBadge,[data-as-cart-count]').forEach(el => {
    el.textContent = count ? String(count) : '0';
    if (el.dataset) el.dataset.count = String(count);
  });
}

function emitCartChanged() {
  updateCartBadges(currentCart);
  window.dispatchEvent(new CustomEvent('autostyle-cart-updated', { detail: { cart: currentCart, count: cartQtyCount(currentCart) } }));
}

export async function loadUserCart(user = currentUser) {
  currentUser = user || auth.currentUser || null;
  if (!currentUser) {
    currentCart = [];
    emitCartChanged();
    return currentCart;
  }
  const snap = await getDoc(userRef(currentUser));
  const data = snap.exists() ? (snap.data() || {}) : {};
  currentCart = normalizeUserCart(data.cart || data.cartItems || []);
  emitCartChanged();
  return currentCart;
}

export async function saveUserCart(rows = currentCart, user = currentUser) {
  currentUser = user || auth.currentUser || null;
  if (!currentUser) throw new Error('Для корзины нужно войти в аккаунт');
  currentCart = normalizeUserCart(rows);
  await setDoc(userRef(currentUser), {
    cart: currentCart,
    cartUpdatedAt: serverTimestamp()
  }, { merge: true });
  emitCartChanged();
  return currentCart;
}

export async function addUserCartItem(productId, qty = 1) {
  if (!productId) return currentCart;
  await waitUserCartReady();
  if (!currentUser) throw new Error('Войдите в аккаунт, чтобы добавить товар в корзину');
  const next = normalizeUserCart([...currentCart, { id: String(productId), qty: Math.max(1, Number(qty) || 1) }]);
  return saveUserCart(next, currentUser);
}

export async function setUserCartQty(productId, qty) {
  await waitUserCartReady();
  const id = String(productId || '');
  const n = Math.max(1, Number(qty) || 1);
  return saveUserCart(currentCart.map(i => cartItemId(i) === id ? { ...i, id, qty: n } : i), currentUser);
}

export async function removeUserCartItem(productId) {
  await waitUserCartReady();
  const id = String(productId || '');
  return saveUserCart(currentCart.filter(i => cartItemId(i) !== id), currentUser);
}

export async function clearUserCart() {
  await waitUserCartReady();
  if (!currentUser) {
    currentCart = [];
    emitCartChanged();
    return currentCart;
  }
  return saveUserCart([], currentUser);
}

export function getCurrentUserCart() {
  return currentCart.slice();
}

export function getCurrentCartUser() {
  return currentUser;
}

export function waitUserCartReady() {
  if (!readyPromise) readyPromise = new Promise(resolve => {
    onAuthStateChanged(auth, async user => {
      currentUser = user || null;
      try { await loadUserCart(currentUser); } catch (err) { console.warn('user cart load error', err); currentCart = []; emitCartChanged(); }
      resolve(currentCart);
    });
  });
  return readyPromise;
}

onAuthStateChanged(auth, async user => {
  currentUser = user || null;
  try { await loadUserCart(currentUser); } catch (err) { console.warn('user cart refresh error', err); }
});

window.AutoStyleUserCart = {
  add: addUserCartItem,
  save: saveUserCart,
  load: loadUserCart,
  clear: clearUserCart,
  remove: removeUserCartItem,
  setQty: setUserCartQty,
  get: getCurrentUserCart,
  ready: waitUserCartReady,
  updateBadges: updateCartBadges
};
