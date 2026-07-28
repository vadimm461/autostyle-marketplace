import { auth, db, COLLECTIONS } from './firebase.js';
import {
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendEmailVerification, sendPasswordResetEmail, signOut,
  updateProfile
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const USERS = COLLECTIONS.users || 'autostyle_users';
export const providerTitle = id => ({ password:'Email/пароль' }[id] || id);
export function userProviders(user){ return (user?.providerData || []).map(p => p.providerId).filter(id => id === 'password'); }
export async function ensureUserProfile(user, extra={}){
  if(!user) return;
  const ref = doc(db, USERS, user.uid);
  const snap = await getDoc(ref);
  const old = snap.exists() ? snap.data() : {};
  const providers = userProviders(user);
  const data = {
    uid: user.uid,
    name: extra.name || old.name || user.displayName || '',
    email: user.email || extra.email || old.email || '',
    phone: extra.phone || old.phone || '',
    photoURL: user.photoURL || old.photoURL || '',
    authProviders: providers,
    emailVerified: !!user.emailVerified,
    phoneVerified: false,
    role: old.role || 'user',
    updatedAt: new Date().toISOString(),
    createdAt: old.createdAt || new Date().toISOString()
  };
  await setDoc(ref, data, { merge:true });
}
function isPasswordEmailUser(user){
  return (user?.providerData || []).some(p => p.providerId === 'password') && !!user.email;
}


export function getAuthErrorMessage(error, fallback='Ошибка авторизации'){
  const code = String(error?.code || '').trim();
  const raw = String(error?.message || error || '').toUpperCase();
  if([
    'auth/invalid-credential',
    'auth/wrong-password',
    'auth/user-not-found',
    'auth/invalid-login-credentials',
    'auth/invalid-email'
  ].includes(code) || raw.includes('INVALID_LOGIN_CREDENTIALS') || raw.includes('INVALID_PASSWORD') || raw.includes('EMAIL_NOT_FOUND')){
    return 'Неверный логин или пароль';
  }
  if(code === 'auth/too-many-requests') return 'Слишком много попыток входа. Попробуйте позже';
  if(code === 'auth/network-request-failed') return 'Проверьте подключение к интернету';
  if(code === 'auth/user-disabled') return 'Аккаунт заблокирован';
  if(code === 'auth/email-already-in-use') return 'Такая почта уже зарегистрирована';
  if(code === 'auth/weak-password') return 'Пароль должен быть не короче 6 символов';
  if(code === 'auth/missing-email') return 'Введите почту';
  return fallback;
}
export async function resetPassword(email){
  const cleanEmail = String(email || '').trim();
  if(!cleanEmail) throw new Error('Введите почту, чтобы восстановить пароль');
  await sendPasswordResetEmail(auth, cleanEmail);
  return true;
}

export async function loginEmail(email, pass){
  const res = await signInWithEmailAndPassword(auth, email, pass);

  await res.user.reload();

  // ВАЖНО: админку нельзя ломать проверкой emailVerified.
  // Сначала читаем профиль пользователя. Если role === 'admin', пускаем админа даже без подтверждённой почты.
  const ref = doc(db, USERS, res.user.uid);
  const snap = await getDoc(ref);
  const profile = snap.exists() ? snap.data() : {};
  const isUserAdmin = profile.role === 'admin';

  // Обычный пользователь с email/password обязан подтвердить почту.
  if(!isUserAdmin && isPasswordEmailUser(res.user) && !res.user.emailVerified){
    try { await sendEmailVerification(res.user); } catch(e) {}
    await signOut(auth);
    throw new Error('Аккаунт не активирован. Перейдите на почту и активируйте аккаунт. Если не видите письмо — проверьте папку «Спам».');
  }

  await ensureUserProfile(res.user);
  return res.user;
}
export async function registerEmail(name, email, pass){
  const res = await createUserWithEmailAndPassword(auth, email, pass);
  if(name) await updateProfile(res.user, { displayName:name });
  await ensureUserProfile(res.user, { name, email });
  await sendEmailVerification(res.user);

  // Не оставляем нового пользователя авторизованным до подтверждения почты.
  await signOut(auth);

  return res.user;
}
export async function resendEmailVerification(){
  if(!auth.currentUser) throw new Error('Сначала войдите в аккаунт.');
  await sendEmailVerification(auth.currentUser);
}
export async function logoutAndClear(){ await signOut(auth); }
