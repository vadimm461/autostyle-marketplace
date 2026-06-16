import { auth, db } from './firebase.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const $ = (s, r = document) => r.querySelector(s);
let currentUser = null;
let userProfile = {};

function esc(v){
  return String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}
function initials(name, email){
  const base = String(name || email || 'AS').trim();
  return (base.split(/\s+/).slice(0,2).map(x => x[0]).join('') || 'AS').toUpperCase();
}
function ensureAccountDrop(){
  let openBtn = $('#openAuth');
  let wrap = $('#accountDrop');
  if (!openBtn && !wrap) return null;
  if (!wrap && openBtn) {
    wrap = document.createElement('div');
    wrap.id = 'accountDrop';
    wrap.className = 'dropdown';
    wrap.style.display = 'none';
    wrap.innerHTML = '<button id="accountBtn" class="icon-btn" type="button">Аккаунт</button><div class="drop"></div>';
    openBtn.insertAdjacentElement('afterend', wrap);
  }
  let btn = $('#accountBtn', wrap);
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'accountBtn';
    btn.className = 'icon-btn';
    btn.type = 'button';
    btn.textContent = 'Аккаунт';
    wrap.prepend(btn);
  }
  let drop = $('.drop', wrap);
  if (!drop) {
    drop = document.createElement('div');
    drop.className = 'drop';
    wrap.appendChild(drop);
  }
  return { openBtn, wrap, btn, drop };
}
function renderAccountMenu(){
  const refs = ensureAccountDrop();
  if (!refs || !currentUser) return;
  const { openBtn, wrap, btn, drop } = refs;
  const name = userProfile.name || userProfile.displayName || currentUser.displayName || 'Вадим';
  const email = currentUser.email || userProfile.email || currentUser.phoneNumber || '';
  const photo = userProfile.photoURL || userProfile.photo || userProfile.avatar || currentUser.photoURL || '';
  const avatar = photo
    ? `<img loading="lazy" decoding="async" src="${esc(photo)}" alt="${esc(name)}">`
    : esc(initials(name, email));

  if (openBtn) openBtn.style.display = 'none';
  wrap.style.display = 'block';
  btn.textContent = 'Аккаунт';
  btn.setAttribute('aria-expanded', wrap.classList.contains('open') ? 'true' : 'false');
  drop.className = 'drop account-panel';
  drop.innerHTML = `
    <a class="account-user account-user-link" href="profile.html" title="Открыть профиль">
      <div class="account-avatar">${avatar}</div>
      <div>
        <b class="account-name">${esc(name)}</b>
        <span class="account-email">${esc(email)}</span>
      </div>
    </a>
    <div class="account-status">● Вы авторизованы</div>
    <nav class="account-menu">
      <a href="profile.html#discount-card">💳 Скидочная карта</a>
      <a href="profile.html#orders">📦 Ваши заказы</a>
      <a href="favorites.html">♡ Избранное</a>
      <a href="cart.html">🛒 Корзина</a>
      <button id="logout" class="account-logout" type="button">Выйти</button>
    </nav>`;
  $('#logout', drop)?.addEventListener('click', async (e) => {
    e.preventDefault();
    localStorage.removeItem('cart');
    localStorage.removeItem('favorites');
    await signOut(auth);
    location.reload();
  });
}
function closeAuthModal(){
  const modal = $('#authModal');
  if (!modal) return;
  modal.classList.remove('open', 'show');
}
function closeAccount(){
  const refs = ensureAccountDrop();
  if (!refs) return;
  refs.wrap.classList.remove('open');
  refs.btn.setAttribute('aria-expanded', 'false');
}
function toggleAccount(e){
  if (!currentUser) return;
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  closeAuthModal();
  renderAccountMenu();
  const { wrap, btn } = ensureAccountDrop();
  const isOpen = wrap.classList.toggle('open');
  btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
}
function bindAccountEvents(){
  if (document.documentElement.dataset.accountDropdownUnified === '1') return;
  document.documentElement.dataset.accountDropdownUnified = '1';

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('#accountBtn');
    if (btn) toggleAccount(e);
  }, true);

  document.addEventListener('click', (e) => {
    const openBtn = e.target.closest('#openAuth');
    if (openBtn && currentUser) toggleAccount(e);
  }, true);

  document.addEventListener('click', (e) => {
    if (e.target.closest('#accountDrop')) return;
    closeAccount();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAccount();
  });
}
function setLoggedOutHeader(){
  const refs = ensureAccountDrop();
  if (!refs) return;
  const { openBtn, wrap } = refs;
  wrap.classList.remove('open');
  wrap.style.display = 'none';
  if (openBtn) {
    openBtn.style.display = 'inline-flex';
    openBtn.onclick = (e) => { e.preventDefault(); window.AutoStyleOpenAuthModal?.(); };
  }
}

bindAccountEvents();
onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  userProfile = {};
  if (!user) { setLoggedOutHeader(); return; }
  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (snap.exists()) userProfile = snap.data() || {};
  } catch (e) {}
  renderAccountMenu();
});
