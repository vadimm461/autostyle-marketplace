import { auth } from './firebase.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

function clearLocalGuestData(){
  try {
    localStorage.removeItem('cart');
    localStorage.removeItem('favorites');
    localStorage.removeItem('autostyle_user_email');
  } catch (_) {}
}

function bindHeader(){
  const accountDrop = $('#accountDrop');
  const accountBtn = $('#accountBtn');
  const openAuth = $('#openAuth');
  const modal = $('#authModal');

  if (accountDrop) {
    accountDrop.classList.add('as-auth-owned');
    accountDrop.classList.remove('open');
    accountDrop.addEventListener('click', e => e.stopPropagation());
  }

  if (accountBtn && !accountBtn.dataset.stableBound) {
    accountBtn.dataset.stableBound = '1';
    accountBtn.type = 'button';
    accountBtn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      accountDrop?.classList.toggle('open');
    }, true);
  }

  if (openAuth && !openAuth.dataset.stableBound) {
    openAuth.dataset.stableBound = '1';
    openAuth.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      if (modal) modal.classList.add('open', 'show');
      else window.AutoStyleOpenAuthModal?.();
    }, true);
  }

  document.addEventListener('click', e => {
    if (!e.target.closest('#accountDrop') && !e.target.closest('#accountBtn')) accountDrop?.classList.remove('open');
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') accountDrop?.classList.remove('open'); });

  document.addEventListener('click', async e => {
    const btn = e.target.closest('#logout, #accountLogoutBtn, #profileLogout, #asAccountLogout');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    btn.disabled = true;
    try {
      clearLocalGuestData();
      await signOut(auth);
    } finally {
      location.href = 'index.html';
    }
  }, true);
}

function setHeaderGuest(){
  document.documentElement.dataset.authState = 'guest';
  document.body?.classList.add('as-auth-guest');
  document.body?.classList.remove('as-auth-user');
  const openAuth = $('#openAuth');
  const accountDrop = $('#accountDrop');
  const notificationsBtn = $('#notificationsBtn');
  if (openAuth) openAuth.style.display = 'inline-flex';
  if (accountDrop) { accountDrop.style.display = 'none'; accountDrop.classList.remove('open'); }
  if (notificationsBtn) notificationsBtn.style.display = 'none';
}

function setHeaderUser(user){
  document.documentElement.dataset.authState = 'user';
  document.body?.classList.remove('as-auth-guest');
  document.body?.classList.add('as-auth-user');
  const openAuth = $('#openAuth');
  const accountDrop = $('#accountDrop');
  const notificationsBtn = $('#notificationsBtn');
  const userEmail = $('#userEmail');
  if (openAuth) openAuth.style.display = 'none';
  if (accountDrop) accountDrop.style.display = 'block';
  if (notificationsBtn) notificationsBtn.style.display = 'inline-flex';
  if (userEmail) userEmail.textContent = user.email || user.displayName || 'Пользователь';
}

bindHeader();
setHeaderGuest();
onAuthStateChanged(auth, user => {
  if (user) setHeaderUser(user);
  else setHeaderGuest();
});
