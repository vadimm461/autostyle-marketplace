import { auth, db } from './firebase.js';

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

import {
  doc,
  setDoc,
  getDoc
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const msg = document.getElementById('msg');

function showMessage(text) {
  if (msg) msg.textContent = text;
  else alert(text);
}

if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    try {
      showMessage('Выполняется вход...');

      const result = await signInWithEmailAndPassword(auth, email, password);

      const userSnap = await getDoc(doc(db, 'users', result.user.uid));

      if (userSnap.exists() && userSnap.data().role === 'admin') {
        window.location.href = 'admin.html';
      } else {
        window.location.href = 'index.html';
      }

    } catch (error) {
      showMessage('Ошибка входа: ' + error.message);
    }
  });
}

if (registerForm) {
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    try {
      showMessage('Создаём аккаунт...');

      const result = await createUserWithEmailAndPassword(auth, email, password);

      await setDoc(doc(db, 'users', result.user.uid), {
        name: name,
        email: email,
        role: 'user',
        createdAt: new Date().toISOString()
      });

      window.location.href = 'index.html';

    } catch (error) {
      if (error.code === 'auth/email-already-in-use') {
        showMessage('Этот email уже зарегистрирован. Перейдите на страницу входа.');
      } else if (error.code === 'auth/weak-password') {
        showMessage('Пароль слишком слабый. Минимум 6 символов.');
      } else {
        showMessage('Ошибка регистрации: ' + error.message);
      }
    }
  });
}
