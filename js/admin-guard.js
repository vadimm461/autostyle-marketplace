import { auth, db, COLLECTIONS } from './firebase.js';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

document.documentElement.classList.add('admin-locked');

function showAdminScreen(message = '') {
  const old = document.getElementById('adminRoleScreen');
  if (old) old.remove();
  document.body.insertAdjacentHTML('afterbegin', `
    <div class="admin-password-screen" id="adminRoleScreen">
      <form class="admin-password-card" id="adminRoleForm">
        <a class="admin-password-logo" href="index.html"><span>AS</span> AUTO <b>STYLE</b></a>
        <h1>Вход в админку</h1>
        ${message ? `<p>${message}</p>` : ''}
        <label>Email
          <input id="adminEmailInput" type="email" autocomplete="username" placeholder="admin@email.com" autofocus>
        </label>
        <label>Пароль аккаунта
          <input id="adminPasswordInput" type="password" autocomplete="current-password" placeholder="Пароль Firebase Auth">
        </label>
        <div class="admin-password-error" id="adminRoleError"></div>
        <button type="submit">Войти</button>
        <a class="admin-password-back" href="index.html">← Вернуться на сайт</a>
      </form>
    </div>
  `);

  document.getElementById('adminRoleForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('adminEmailInput').value.trim();
    const pass = document.getElementById('adminPasswordInput').value;
    const errBox = document.getElementById('adminRoleError');
    errBox.textContent = '';
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (err) {
      console.error(err);
      errBox.textContent = 'Не удалось войти. Проверьте email и пароль.';
    }
  });
}

async function isAdminUser(user) {
  if (!user) return false;
  try {
    const ref = doc(db, COLLECTIONS.users || 'autostyle_users', user.uid);
    const snap = await getDoc(ref);
    return snap.exists() && snap.data().role === 'admin';
  } catch (err) {
    console.error('Admin role check failed:', err);
    return false;
  }
}

async function unlockAdmin() {
  const screen = document.getElementById('adminRoleScreen');
  if (screen) screen.remove();
  document.documentElement.classList.remove('admin-locked');
  try {
    await import('./admin.js');
    await import('./admin-footer-editor.js');
  } catch (err) {
    console.error(err);
    alert('Не удалось загрузить админку. Проверьте консоль браузера.');
  }
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    showAdminScreen();
    return;
  }

  const ok = await isAdminUser(user);
  if (ok) {
    unlockAdmin();
    return;
  }

  await signOut(auth).catch(() => {});
  showAdminScreen('У этого аккаунта нет роли admin. Доступ запрещён.');
});
