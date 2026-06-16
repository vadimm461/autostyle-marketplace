import { auth, db, COLLECTIONS } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getProfileVerification, profileVerificationMessage } from './auth-core.js';

let authReady = false;
let authUser = auth.currentUser || null;
let readyPromise = new Promise(resolve => {
  const unsub = onAuthStateChanged(auth, user => {
    authUser = user || null;
    authReady = true;
    resolve(authUser);
    unsub();
  });
});

function usersCollection(){ return COLLECTIONS.users || 'autostyle_users'; }
function userRef(user = authUser){ return user ? doc(db, usersCollection(), user.uid) : null; }

export function normalizeCart(rows){
  const map = new Map();
  (Array.isArray(rows) ? rows : []).forEach(item => {
    const id = typeof item === 'object'
      ? String(item.id ?? item.productId ?? item.productID ?? item.product_id ?? item.uid ?? item.docId ?? item.sku ?? item.code ?? item.article ?? '').trim()
      : String(item || '').trim();
    if (!id) return;
    const qtyRaw = typeof item === 'object' ? (item.qty ?? item.quantity ?? item.count ?? 1) : 1;
    const qty = Math.max(1, Number(qtyRaw) || 1);
    const prev = map.get(id);
    const snapshot = typeof item === 'object' ? { ...item, id } : { id };
    map.set(id, { ...snapshot, id, qty: (prev?.qty || 0) + qty });
  });
  return [...map.values()];
}

export function cartQtyCount(rows = []){
  return normalizeCart(rows).reduce((sum, item) => sum + Math.max(1, Number(item.qty || 1) || 1), 0);
}

export function setHeaderCartCount(count){
  document.querySelectorAll('#cartCount,.cartCount').forEach(el => { el.textContent = String(count || 0); });
}

export async function waitCartAuth(){
  if (authReady) return authUser;
  return readyPromise;
}

export async function getUserCart(){
  const user = await waitCartAuth();
  if (!user) {
    setHeaderCartCount(0);
    return [];
  }
  const snap = await getDoc(userRef(user));
  const data = snap.exists() ? (snap.data() || {}) : {};
  const rows = normalizeCart(data.cart || data.cartItems || data.basket || []);
  setHeaderCartCount(cartQtyCount(rows));
  return rows;
}

export async function saveUserCart(rows){
  const user = await waitCartAuth();
  if (!user) {
    setHeaderCartCount(0);
    return [];
  }
  const cart = normalizeCart(rows);
  await setDoc(userRef(user), { cart, cartUpdatedAt: serverTimestamp() }, { merge: true });
  setHeaderCartCount(cartQtyCount(cart));
  window.dispatchEvent(new CustomEvent('autostyle-cart-updated', { detail: { cart } }));
  return cart;
}

export async function addToUserCart(product, qty = 1){
  const user = await waitCartAuth();
  if (!user) {
    if (typeof window.openLoginPopup === 'function') window.openLoginPopup('Войдите в аккаунт, чтобы добавить товар в корзину.');
    else alert('Войдите в аккаунт, чтобы добавить товар в корзину.');
    return null;
  }
  const check = await getProfileVerification(user);
  if (!check.verified) {
    const message = profileVerificationMessage();
    if (typeof window.openLoginPopup === 'function') window.openLoginPopup(message);
    else alert(message);
    return null;
  }
  const id = typeof product === 'object'
    ? String(product.id ?? product.productId ?? product.uid ?? product.docId ?? product.sku ?? product.code ?? product.article ?? '').trim()
    : String(product || '').trim();
  if (!id) return null;
  const cart = await getUserCart();
  const index = cart.findIndex(item => String(item.id) === id);
  if (index >= 0) cart[index].qty = Math.max(1, Number(cart[index].qty || 1)) + Math.max(1, Number(qty || 1));
  else cart.push(typeof product === 'object' ? { ...product, id, qty: Math.max(1, Number(qty || 1)) } : { id, qty: Math.max(1, Number(qty || 1)) });
  return saveUserCart(cart);
}

export function watchUserCart(callback){
  return onAuthStateChanged(auth, async user => {
    authUser = user || null;
    authReady = true;
    const cart = user ? await getUserCart().catch(() => []) : [];
    callback(cart, user || null);
  });
}
