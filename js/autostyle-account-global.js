import { auth } from './firebase.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

function waitAccountMenu(cb, tries = 40) {
  if (window.AutoStyleAccountMenu && typeof window.AutoStyleAccountMenu.renderUser === 'function') {
    cb();
    return;
  }
  if (tries <= 0) return;
  setTimeout(() => waitAccountMenu(cb, tries - 1), 100);
}

function clearLocalUserData() {
  try { localStorage.removeItem('cart'); } catch (_) {}
  try { localStorage.removeItem('favorites'); } catch (_) {}
  try { localStorage.removeItem('autostyle_user'); } catch (_) {}
}

async function logout() {
  clearLocalUserData();
  try { await signOut(auth); } catch (e) { console.warn('logout error', e); }
  location.href = 'index.html';
}

function updateAccount(user) {
  waitAccountMenu(() => {
    if (user) {
      window.AutoStyleAccountMenu.renderUser(user, logout);
    } else {
      window.AutoStyleAccountMenu.renderGuest();
    }
  });
}

onAuthStateChanged(auth, updateAccount);
window.AutoStyleUpdateAccountMenu = () => updateAccount(auth.currentUser);
