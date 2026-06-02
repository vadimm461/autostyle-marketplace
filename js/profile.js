import { auth, db, storage, COLLECTIONS } from './firebase.js';
import {
  onAuthStateChanged,
  signOut,
  updateProfile,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  verifyBeforeUpdateEmail
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, query, where, orderBy, limit } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';
import { updateCartCount, fmtPrice, productTitle, productImage } from './common.js';

const $ = s => document.querySelector(s);

function clearCartAndFavorites(){
  localStorage.removeItem('cart');
  localStorage.removeItem('favorites');
  window.dispatchEvent(new Event('autostyle-storage-cleared'));
}

const usersCollection = COLLECTIONS.users || 'autostyle_users';
const productsCollection = COLLECTIONS.products || 'autostyle_products';

function setText(el, text){ if(el) el.textContent = text || ''; }
function message(el, text, ok=true){ if(!el) return; el.textContent = text || ''; el.classList.toggle('error', !ok); el.classList.toggle('ok', ok); }
function initials(name, email){ const base = (name || email || 'AS').trim(); return base.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase() || 'AS'; }
function avatarHtml(url, name, email){
  const el = $('#profileAvatar');
  if(!el) return;
  if(url){ el.innerHTML = `<img src="${url}" alt="${name || email || 'Профиль'}">`; el.classList.add('has-photo'); }
  else { el.textContent = initials(name, email); el.classList.remove('has-photo'); }
}
async function getUserDoc(uid){
  const primary = doc(db, usersCollection, uid);
  const snap = await getDoc(primary);
  if(snap.exists()) return { ref: primary, data: snap.data() };
  const legacy = doc(db, 'users', uid);
  const old = await getDoc(legacy);
  if(old.exists()) return { ref: primary, data: old.data() };
  return { ref: primary, data: {} };
}
function fillProfile(user, data={}){
  const name = data.name || user.displayName || '';
  const email = data.email || user.email || '';
  const photo = data.photoURL || user.photoURL || '';
  $('#profileName').value = name;
  $('#profileEmail').value = email;
  $('#profilePhone').value = data.phone || '';
  $('#profileCity').value = data.city || '';
  $('#profileAddress').value = data.address || '';
  setText($('#profileNameTitle'), name || 'Пользователь');
  setText($('#profileEmailTitle'), email);
  avatarHtml(photo, name, email);
}
async function saveProfile(user){
  const msg = $('#profileMsg');
  const name = $('#profileName').value.trim();
  const email = $('#profileEmail').value.trim();
  const phone = $('#profilePhone').value.trim();
  const city = $('#profileCity').value.trim();
  const address = $('#profileAddress').value.trim();
  const currentPassword = $('#profileCurrentPassword').value;
  message(msg, 'Сохраняю...', true);
  if(name !== (user.displayName || '')) await updateProfile(user, { displayName: name });
  if(email && email !== user.email){
    if(!currentPassword){ message(msg, 'Для смены email введи текущий пароль.', false); return; }
    const cred = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, cred);
    await verifyBeforeUpdateEmail(user, email);
  }
  const current = await getUserDoc(user.uid);
  await setDoc(current.ref, {
    uid: user.uid,
    name,
    email,
    phone,
    city,
    address,
    photoURL: user.photoURL || current.data.photoURL || '',
    updatedAt: new Date().toISOString(),
    createdAt: current.data.createdAt || new Date().toISOString(),
    role: current.data.role || 'user'
  }, { merge: true });
  setText($('#profileNameTitle'), name || 'Пользователь');
  setText($('#profileEmailTitle'), email);
  message(msg, email !== user.email ? 'Профиль сохранён. На новый email отправлено письмо подтверждения.' : 'Профиль сохранён.', true);
  $('#profileCurrentPassword').value = '';
}
async function uploadAvatar(user, file){
  const msg = $('#avatarMsg');
  if(!file) return;
  if(!file.type.startsWith('image/')){ message(msg, 'Выберите изображение.', false); return; }
  if(file.size > 5 * 1024 * 1024){ message(msg, 'Фото должно быть меньше 5 МБ.', false); return; }
  message(msg, 'Загружаю фото...', true);
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `autostyle_users/${user.uid}/avatar.${ext}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, { contentType: file.type });
  const url = await getDownloadURL(storageRef);
  await updateProfile(user, { photoURL: url });
  const current = await getUserDoc(user.uid);
  await setDoc(current.ref, { photoURL: url, updatedAt: new Date().toISOString() }, { merge: true });
  avatarHtml(url, $('#profileName').value.trim(), user.email);
  message(msg, 'Фото обновлено.', true);
}
async function changePassword(user){
  const msg = $('#passwordMsg');
  const oldPass = $('#oldPassword').value;
  const newPass = $('#newPassword').value;
  const newPass2 = $('#newPassword2').value;
  if(newPass !== newPass2){ message(msg, 'Новые пароли не совпадают.', false); return; }
  if(newPass.length < 6){ message(msg, 'Пароль должен быть не короче 6 символов.', false); return; }
  message(msg, 'Обновляю пароль...', true);
  const cred = EmailAuthProvider.credential(user.email, oldPass);
  await reauthenticateWithCredential(user, cred);
  await updatePassword(user, newPass);
  $('#passwordForm').reset();
  message(msg, 'Пароль обновлён.', true);
}
function activateProfileTabFromHash(){
  const hash = (location.hash || '').replace('#','');
  const map = { profile:'account', photo:'account', avatar:'account', account:'account', edit:'account', password:'password', orders:'orders', favorites:'favorites' };
  const target = map[hash];
  if(target) document.querySelector(`[data-profile-tab="${target}"]`)?.click();
}
function bindTabs(){
  document.querySelectorAll('[data-profile-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-profile-tab]').forEach(x => x.classList.remove('active'));
      document.querySelectorAll('[data-pane]').forEach(x => x.classList.remove('active'));
      btn.classList.add('active');
      document.querySelector(`[data-pane="${btn.dataset.profileTab}"]`)?.classList.add('active');
    });
  });
  setTimeout(activateProfileTabFromHash, 50);
  window.addEventListener('hashchange', activateProfileTabFromHash);
}
async function renderFavorites(){
  const box = $('#profileFavorites');
  if(!box) return;
  const ids = JSON.parse(localStorage.getItem('favorites') || '[]');
  if(!ids.length){ box.innerHTML = '<div class="profile-empty">Избранное пока пустое.</div>'; return; }
  try{
    const snap = await getDocs(collection(db, productsCollection));
    const products = snap.docs.map(d => ({ id:d.id, ...d.data() })).filter(p => ids.includes(p.id)).slice(0, 6);
    if(!products.length){ box.innerHTML = '<div class="profile-empty">Избранное пока пустое.</div>'; return; }
    box.innerHTML = products.map(p => {
      const img = productImage(p);
      return `<a class="profile-fav-card" href="product.html?id=${p.id}">
        <div>${img ? `<img src="${img}" alt="${productTitle(p)}">` : '<span>Фото</span>'}</div>
        <b>${productTitle(p)}</b>
        <em>${fmtPrice(p.price || 0)}</em>
      </a>`;
    }).join('');
  }catch(e){ box.innerHTML = '<div class="profile-empty">Не удалось загрузить избранное.</div>'; }
}
async function renderOrders(user){
  const box = $('#ordersList');
  if(!box) return;
  try{
    const ordersCollection = 'autostyle_orders';
    const q = query(collection(db, ordersCollection), where('userId','==',user.uid), orderBy('createdAt','desc'), limit(20));
    const snap = await getDocs(q);
    if(snap.empty){ box.innerHTML = '<div class="profile-empty">Заказов пока нет.</div>'; return; }
    box.innerHTML = snap.docs.map(d => {
      const o = d.data();
      return `<div class="profile-order"><div><b>Заказ ${d.id.slice(0,8)}</b><span>${o.createdAt ? new Date(o.createdAt).toLocaleDateString('ru-RU') : ''}</span></div><strong>${fmtPrice(o.total || 0)}</strong><em>${o.status || 'Новый'}</em></div>`;
    }).join('');
  }catch(e){ box.innerHTML = '<div class="profile-empty">Заказов пока нет.</div>'; }
}
function setupSearch(){
  const input = $('#siteSearch'), btn = $('#siteSearchBtn');
  const go = () => { const q = encodeURIComponent((input?.value || '').trim()); location.href = q ? `catalog.html?search=${q}` : 'catalog.html'; };
  btn?.addEventListener('click', go);
  input?.addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); go(); } });
}

bindTabs();
setupSearch();
updateCartCount();

onAuthStateChanged(auth, async user => {
  try{
    if(!user){ $('#profileGuest').hidden = false; $('#profileApp').hidden = true; $('#profileLogout').style.display='none'; window.AutoStyleLoader?.hide(); return; }
    $('#profileGuest').hidden = true;
    $('#profileApp').hidden = false;
    $('#profileLogout').style.display='inline-flex';
    $('#profileLogout').onclick = async () => { clearCartAndFavorites(); await signOut(auth); location.href = 'index.html'; };
    const current = await getUserDoc(user.uid);
    fillProfile(user, current.data);
    $('#profileForm').onsubmit = async e => { e.preventDefault(); try{ await saveProfile(user); }catch(err){ message($('#profileMsg'), 'Ошибка: ' + (err.message || err), false); } };
    $('#avatarInput').onchange = async e => { try{ await uploadAvatar(user, e.target.files[0]); }catch(err){ message($('#avatarMsg'), 'Ошибка загрузки: ' + (err.message || err), false); } };
    $('#passwordForm').onsubmit = async e => { e.preventDefault(); try{ await changePassword(user); }catch(err){ message($('#passwordMsg'), 'Ошибка: ' + (err.message || err), false); } };
    await renderFavorites();
    await renderOrders(user);
    window.AutoStyleLoader?.hide();
  }catch(e){ console.error(e); window.AutoStyleLoader?.hide(); }
});
