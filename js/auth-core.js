import { auth, db, COLLECTIONS, waitForAuthReady } from './firebase.js';
import {
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendEmailVerification, sendPasswordResetEmail, signOut,
  updateProfile
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { trackEvent } from './site-analytics.js';

const USERS = COLLECTIONS.users || 'autostyle_users';
export const providerTitle = id => ({ password:'Email/пароль' }[id] || id);
export function userProviders(user){ return (user?.providerData || []).map(p => p.providerId).filter(id => id === 'password'); }
export async function ensureUserProfile(user, extra={}){
  if(!user) return;
  const ref = doc(db, USERS, user.uid);
  let old = {};
  try {
    const snap = await getDoc(ref);
    old = snap.exists() ? snap.data() : {};
  } catch (error) {
    // Authentication itself must not be reported as failed because the
    // profile document is temporarily unavailable.
    console.warn('AutoStyle profile read skipped:', error);
    return old;
  }
  const providers = userProviders(user);
  const data = {
    uid: user.uid,
    name: extra.name || old.name || user.displayName || '',
    email: user.email || extra.email || old.email || '',
    phone: extra.phone || old.phone || '',
    carBrand: extra.carBrand || old.carBrand || '',
    carYear: extra.carYear || old.carYear || '',
    carModel: extra.carModel || old.carModel || '',
    car: extra.car || old.car || [extra.carBrand || old.carBrand, extra.carModel || old.carModel, extra.carYear || old.carYear].filter(Boolean).join(' '),
    photoURL: user.photoURL || old.photoURL || '',
    authProviders: providers,
    emailVerified: !!user.emailVerified,
    phoneVerified: false,
    role: old.role || 'user',
    updatedAt: new Date().toISOString(),
    createdAt: old.createdAt || new Date().toISOString()
  };
  try {
    await setDoc(ref, data, { merge:true });
  } catch (error) {
    console.warn('AutoStyle profile sync skipped:', error);
  }
  return data;
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
  await waitForAuthReady();
  const res = await signInWithEmailAndPassword(auth, email, pass);
  await ensureUserProfile(res.user);
  try { await trackEvent('login'); } catch(e) {}
  return res.user;
}
export async function registerEmail(name, email, pass, profile={}){
  await waitForAuthReady();
  const res = await createUserWithEmailAndPassword(auth, email, pass);
  if(name) await updateProfile(res.user, { displayName:name });
  await ensureUserProfile(res.user, { name, email, ...profile });
  try { await trackEvent('registration'); } catch(e) {}
  await sendEmailVerification(res.user);
  return res.user;
}
export async function resendEmailVerification(){
  if(!auth.currentUser) throw new Error('Сначала войдите в аккаунт.');
  await sendEmailVerification(auth.currentUser);
}
export async function logoutAndClear(){ await signOut(auth); }

export function isUserVerifiedByAnyMethod(user, profile={}){
  if(!user) return false;
  return Boolean(user.emailVerified || profile?.emailVerified === true || profile?.verified === true || profile?.isVerified === true);
}

export async function getProfileVerification(user=auth.currentUser){
  if(!user) return { verified:false, profile:null, reason:'guest' };
  try { await user.reload?.(); } catch(_) {}
  const freshUser = auth.currentUser || user;
  let profile = null;
  try {
    const snap = await getDoc(doc(db, USERS, freshUser.uid));
    profile = snap.exists() ? (snap.data() || {}) : null;
  } catch(e) {
    console.warn('profile verification load error', e);
  }
  return {
    verified: isUserVerifiedByAnyMethod(freshUser, profile),
    profile,
    user: freshUser,
    reason: isUserVerifiedByAnyMethod(freshUser, profile) ? 'verified' : 'not-verified'
  };
}

export function profileVerificationMessage(){
  return 'Корзина и заказы доступны после подтверждения почты. Откройте письмо от AutoStyle и подтвердите Email.';
}
