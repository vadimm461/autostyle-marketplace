import { auth, db } from './firebase.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const qs = (s, r = document) => r.querySelector(s);
const qsa = (s, r = document) => [...r.querySelectorAll(s)];
let currentUser = null;
let profile = {};

function esc(v){
  return String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}
function initials(name, email){
  const base = String(name || email || 'AS').trim();
  return (base.split(/\s+/).slice(0,2).map(x => x[0]).join('') || 'AS').toUpperCase();
}
function closeAuthModal(){
  const modal = qs('#authModal');
  if (modal) modal.classList.remove('open', 'show');
}
function getAccountButton(){
  return qs('.topbar #accountBtn, .topbar #openAuth, .topbar a[href="profile.html"].icon-btn, .topbar a[href*="profile.html"].icon-btn');
}
function normalizeAccountButton(){
  const btn = getAccountButton();
  if (!btn) return null;
  if (btn.id !== 'accountBtn' || btn.tagName !== 'BUTTON') {
    const b = document.createElement('button');
    b.id = 'accountBtn';
    b.className = btn.className || 'icon-btn';
    b.type = 'button';
    b.textContent = 'Аккаунт';
    btn.replaceWith(b);
    return b;
  }
  btn.type = 'button';
  btn.textContent = 'Аккаунт';
  return btn;
}
function ensureDropdown(){
  const btn = normalizeAccountButton();
  if (!btn) return null;
  let dd = qs('#accountMenuDropdown');
  if (!dd) {
    dd = document.createElement('div');
    dd.id = 'accountMenuDropdown';
    dd.className = 'as-account-dropdown';
    btn.insertAdjacentElement('afterend', dd);
  }
  return dd;
}
function renderDropdown(){
  const dd = ensureDropdown();
  if (!dd || !currentUser) return;
  const name = profile.name || profile.displayName || currentUser.displayName || 'Вадим';
  const email = currentUser.email || profile.email || currentUser.phoneNumber || '';
  const photo = profile.photoURL || profile.photo || profile.avatar || currentUser.photoURL || '';
  const avatar = photo ? `<img src="${esc(photo)}" alt="${esc(name)}" loading="lazy" decoding="async">` : esc(initials(name, email));
  dd.innerHTML = `
    <a class="as-account-user" href="profile.html#home">
      <span class="as-account-avatar">${avatar}</span>
      <span class="as-account-info"><b>${esc(name)}</b><small>${esc(email)}</small></span>
    </a>
    <div class="as-account-status">● Вы авторизованы</div>
    <nav class="as-account-menu">
      <a href="profile.html#discount-card">💳 Скидочная карта</a>
      <a href="profile.html#orders">📦 Ваши заказы</a>
      <a href="favorites.html">♡ Избранное</a>
      <a href="cart.html">🛒 Корзина</a>
      <button id="accountLogoutBtn" type="button">Выйти</button>
    </nav>`;
  qs('#accountLogoutBtn', dd)?.addEventListener('click', async () => {
    await signOut(auth);
    dd.classList.remove('is-open');
    location.reload();
  });
}
function openLogin(){
  closeDropdown();
  const modal = qs('#authModal');
  if (modal) modal.classList.add('open', 'show');
  else window.AutoStyleOpenAuthModal?.();
}
function closeDropdown(){
  const dd = qs('#accountMenuDropdown');
  const btn = qs('#accountBtn');
  if (dd) dd.classList.remove('is-open');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}
function toggleDropdown(){
  if (!currentUser) { openLogin(); return; }
  closeAuthModal();
  renderDropdown();
  const dd = ensureDropdown();
  const btn = qs('#accountBtn');
  const opened = dd.classList.toggle('is-open');
  btn?.setAttribute('aria-expanded', opened ? 'true' : 'false');
}
function bind(){
  normalizeAccountButton();
  document.addEventListener('click', e => {
    const btn = e.target.closest('#accountBtn');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    toggleDropdown();
  }, true);
  document.addEventListener('click', e => {
    if (e.target.closest('#accountMenuDropdown') || e.target.closest('#accountBtn')) return;
    closeDropdown();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDropdown(); });
}

bind();
onAuthStateChanged(auth, async user => {
  currentUser = user;
  profile = {};
  normalizeAccountButton();
  closeDropdown();
  if (!user) return;
  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (snap.exists()) profile = snap.data() || {};
  } catch (err) { console.warn('account profile load error', err); }
  renderDropdown();
});
