import { auth, db } from './firebase.js';

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  signOut
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const msg = document.getElementById('msg');

function showMessage(text) {
  if (msg) msg.textContent = text;
  else alert(text);
}

function errorText(error) {
  if (error.code === 'auth/email-already-in-use') return 'Этот email уже зарегистрирован. Перейдите на страницу входа.';
  if (error.code === 'auth/weak-password') return 'Пароль слишком слабый. Минимум 6 символов.';
  if (error.code === 'auth/invalid-credential') return 'Неверный email или пароль.';
  if (error.code === 'auth/too-many-requests') return 'Слишком много попыток. Попробуйте позже.';
  return error.message;
}

if (registerForm) {
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('name')?.value.trim() || '';
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    try {
      showMessage('Создаём аккаунт...');
      const result = await createUserWithEmailAndPassword(auth, email, password);

      await setDoc(doc(db, 'users', result.user.uid), {
        name,
        email,
        role: 'user',
        emailVerified: false,
        createdAt: serverTimestamp()
      }, { merge: true });

      await sendEmailVerification(result.user);
      await signOut(auth);

      showMessage('Аккаунт создан. Мы отправили письмо подтверждения на email. Подтвердите почту и потом войдите.');
    } catch (error) {
      showMessage('Ошибка регистрации: ' + errorText(error));
    }
  });
}

if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    try {
      showMessage('Выполняется вход...');
      const result = await signInWithEmailAndPassword(auth, email, password);

      await result.user.reload();

      if (!result.user.emailVerified) {
        await sendEmailVerification(result.user).catch(() => {});
        await signOut(auth);
        showMessage('Подтвердите email. Мы отправили письмо подтверждения ещё раз.');
        return;
      }

      await setDoc(doc(db, 'users', result.user.uid), {
        email: result.user.email,
        emailVerified: true,
        lastLoginAt: serverTimestamp()
      }, { merge: true });

      const userSnap = await getDoc(doc(db, 'users', result.user.uid));
      const role = userSnap.exists() ? userSnap.data().role : 'user';

      window.location.href = role === 'admin' ? 'admin.html' : 'index.html';
    } catch (error) {
      showMessage('Ошибка входа: ' + errorText(error));
    }
  });
}
