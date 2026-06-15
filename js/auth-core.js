import { auth, db, COLLECTIONS } from './firebase.js';
import {
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendEmailVerification, signOut,
  RecaptchaVerifier, signInWithPhoneNumber, linkWithPhoneNumber,
  updateProfile, unlink
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const USERS = COLLECTIONS.users || 'autostyle_users';
export const providerTitle = id => ({ password:'Email/пароль', 'password':'Email/пароль', phone:'SMS/телефон', 'phone':'SMS/телефон' }[id] || id);
export function userProviders(user){ return (user?.providerData || []).map(p => p.providerId).filter(Boolean).filter(id => id === 'password' || id === 'phone'); }
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
    phone: user.phoneNumber || extra.phone || old.phone || '',
    photoURL: user.photoURL || old.photoURL || '',
    authProviders: providers,
    emailVerified: !!user.emailVerified,
    phoneVerified: !!user.phoneNumber,
    role: old.role || 'user',
    updatedAt: new Date().toISOString(),
    createdAt: old.createdAt || new Date().toISOString()
  };
  await setDoc(ref, data, { merge:true });
}
export async function loginEmail(email, pass){
  const res = await signInWithEmailAndPassword(auth, email, pass);
  await ensureUserProfile(res.user);
  return res.user;
}
export async function registerEmail(name, email, pass, phone=''){
  const res = await createUserWithEmailAndPassword(auth, email, pass);
  if(name) await updateProfile(res.user, { displayName:name });
  await ensureUserProfile(res.user, { name, email, phone });
  await sendEmailVerification(res.user);
  return res.user;
}
export async function resendEmailVerification(){
  if(!auth.currentUser) throw new Error('Сначала войдите в аккаунт.');
  await sendEmailVerification(auth.currentUser);
}
export async function unlinkProvider(providerId){
  if(!auth.currentUser) throw new Error('Сначала войдите в аккаунт.');
  if(providerId !== 'phone') throw new Error('В этой версии доступны только почта и телефон.');
  await unlink(auth.currentUser, providerId);
  await auth.currentUser.reload();
  await ensureUserProfile(auth.currentUser);
}
export function recaptcha(containerId='recaptcha-container'){
  if(!document.getElementById(containerId)){
    const div = document.createElement('div'); div.id = containerId; document.body.appendChild(div);
  }
  const key = '__asRecaptcha_' + containerId;
  if(!window[key]) window[key] = new RecaptchaVerifier(auth, containerId, { size:'invisible' });
  return window[key];
}
export async function sendSmsCode(phone, containerId='recaptcha-container'){
  const verifier = recaptcha(containerId);
  window.__asPhoneConfirmation = await signInWithPhoneNumber(auth, phone, verifier);
  return true;
}
export async function confirmSmsCode(code){
  if(!window.__asPhoneConfirmation) throw new Error('Сначала запросите SMS-код.');
  const res = await window.__asPhoneConfirmation.confirm(code);
  await ensureUserProfile(res.user, { phone:res.user.phoneNumber });
  window.__asPhoneConfirmation = null;
  return res.user;
}
export async function sendLinkSmsCode(phone, containerId='recaptcha-container'){
  if(!auth.currentUser) throw new Error('Сначала войдите в аккаунт.');
  const verifier = recaptcha(containerId);
  window.__asLinkPhoneConfirmation = await linkWithPhoneNumber(auth.currentUser, phone, verifier);
  return true;
}
export async function confirmLinkSmsCode(code){
  if(!window.__asLinkPhoneConfirmation) throw new Error('Сначала запросите SMS-код.');
  const res = await window.__asLinkPhoneConfirmation.confirm(code);
  await ensureUserProfile(res.user, { phone:res.user.phoneNumber });
  window.__asLinkPhoneConfirmation = null;
  return res.user;
}
export async function logoutAndClear(){ await signOut(auth); }
