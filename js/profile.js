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
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, query, where, orderBy, limit, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';
import { updateCartCount, fmtPrice, productTitle, productImage } from './common.js';
import { sendLinkSmsCode, confirmLinkSmsCode, resendEmailVerification, userProviders, providerTitle, ensureUserProfile } from './auth-core.js';

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
  const carValue = data.car || data.carText || [data.carBrand, data.carModel, data.carYear].filter(Boolean).join(' ');
  const carInput = $('#profileCar');
  if (carInput) carInput.value = carValue || '';
  updateDiscountCardUI(user, data);
  setText($('#profileNameTitle'), name || 'Пользователь');
  setText($('#profileEmailTitle'), email);
  setText($('#discountCardEmail'), email);
  avatarHtml(photo, name, email);
}
async function saveProfile(user){
  const msg = $('#profileMsg');
  const name = $('#profileName').value.trim();
  const email = $('#profileEmail').value.trim();
  const phone = $('#profilePhone').value.trim();
  const city = $('#profileCity').value.trim();
  const address = $('#profileAddress').value.trim();
  const car = ($('#profileCar')?.value || '').trim();
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
    car,
    photoURL: user.photoURL || current.data.photoURL || '',
    updatedAt: new Date().toISOString(),
    createdAt: current.data.createdAt || new Date().toISOString(),
    role: current.data.role || 'user'
  }, { merge: true });
  setText($('#profileNameTitle'), name || 'Пользователь');
  setText($('#profileEmailTitle'), email);
  updateDiscountCardUI(user, { ...(current.data || {}), name, email, phone, city, address, car });
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
  const map = { profile:'account', photo:'account', avatar:'account', account:'account', edit:'account', password:'password', security:'security', login:'security', auth:'security', providers:'security', orders:'orders', favorites:'favorites', 'discount-card':'discount-card', discount:'discount-card', card:'discount-card' };
  const target = map[hash];
  if(target) document.querySelector(`[data-profile-tab="${target}"]`)?.click();
}
function activateProfileTab(tab) {
  const btn = document.querySelector(`[data-profile-tab="${tab}"]`);
  if (btn) btn.click();
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
  document.querySelectorAll('[data-profile-jump]').forEach(a => {
    a.addEventListener('click', e => {
      const tab = a.dataset.profileJump;
      if(!tab) return;
      e.preventDefault();
      location.hash = tab;
      activateProfileTab(tab);
    });
  });
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
    box.querySelectorAll('[data-order-toggle]').forEach(btn => btn.addEventListener('click', () => {
      const card = btn.closest('[data-order-card]');
      const collapsed = card.classList.toggle('collapsed');
      btn.textContent = collapsed ? 'Показать товары' : 'Скрыть товары';
    }));
  }catch(e){ box.innerHTML = '<div class="profile-empty">Не удалось загрузить избранное.</div>'; }
}
const ORDER_STATUSES = {
  new: 'Новый',
  processing: 'В обработке',
  ready: 'Готов к выдаче',
  completed: 'Выдан',
  done: 'Выдан',
  cancelled: 'Отменён',
  canceled: 'Отменён'
};

const PAYMENT_TITLES = {
  cash: 'Наличными',
  card: 'Банковской картой',
  installment: 'Рассрочка'
};

function orderDate(value, fallback) {
  try {
    const d = value?.toDate ? value.toDate() : new Date(value || fallback || Date.now());
    return d.toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
  } catch { return ''; }
}

function orderStatusTitle(status, statusTitle) {
  return statusTitle || ORDER_STATUSES[status] || status || 'Новый';
}

function normalizeBankName(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    const out = value.replace(/\[object Object\]/gi, '').replace(/object Object/gi, '').replace(/[\[\]]/g, '').replace(/\s*,\s*,+/g, ', ').trim();
    return out && !/^object$/i.test(out) ? out : '';
  }
  if (Array.isArray(value)) return value.map(normalizeBankName).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    const keys = ['name','bankName','title','label','text','value','id'];
    for (const key of keys) {
      const picked = normalizeBankName(value[key]);
      if (picked) return picked;
    }
    return '';
  }
  return normalizeBankName(String(value));
}

function orderPaymentTitle(order) {
  const inst = (order.installment && typeof order.installment === 'object') ? order.installment : {};
  const rawMethod = order.paymentMethod || order.payment || order.paymentType || '';
  const method = normalizeBankName(typeof rawMethod === 'object' ? (rawMethod.type || rawMethod.id || rawMethod.method || rawMethod.name || '') : rawMethod);
  const bank = normalizeBankName(order.installmentBank || inst.bank || inst.bankName || order.bank || order.bankName || order.paymentBank || '');
  const months = normalizeBankName(order.installmentMonths || inst.months || inst.term || order.months || '');
  const pay = order.installmentMonthlyPayment || inst.monthlyPayment || inst.monthly || order.monthlyPayment || '';
  if (/installment|credit|рассроч/i.test(method) || bank || months || pay) {
    return `Рассрочка${bank ? ` — ${bank}` : ''}${months ? `, ${months} мес.` : ''}${pay ? ` · ${fmtPrice(pay)}/мес.` : ''}`;
  }
  if (order.paymentMethodTitle) return normalizeBankName(order.paymentMethodTitle) || 'Наличными';
  return PAYMENT_TITLES[method] || normalizeBankName(method) || 'Наличными';
}

async function renderOrders(user){
  const box = $('#ordersList');
  if(!box) return;
  box.innerHTML = '<div class="profile-empty">Загружаю заказы...</div>';
  try{
    const ordersCollection = COLLECTIONS.orders || 'autostyle_orders';
    let docs = [];
    try {
      const q = query(collection(db, ordersCollection), where('userId','==',user.uid), orderBy('createdAt','desc'), limit(20));
      const snap = await getDocs(q);
      docs = snap.docs;
    } catch(indexErr) {
      console.warn('orders ordered query failed, fallback', indexErr);
      const snap = await getDocs(query(collection(db, ordersCollection), where('userId','==',user.uid), limit(50)));
      docs = snap.docs.sort((a,b) => String((b.data().createdAtText || '')).localeCompare(String((a.data().createdAtText || '')))).slice(0,20);
    }
    if(!docs.length){ box.innerHTML = '<div class="profile-empty">Заказов пока нет.</div>'; return; }

    box.innerHTML = docs.map(d => {
      const o = d.data();
      const items = Array.isArray(o.items) ? o.items : [];
      const qty = Number(o.totalQty || items.reduce((s,x)=>s+Number(x.qty||0),0));
      const status = orderStatusTitle(o.status, o.statusTitle);
      return `<article class="profile-order-card collapsed" data-order-card>
        <div class="profile-order-top">
          <div>
            <h3>Заказ ${o.orderNumber || ('#' + d.id.slice(0,8))}</h3>
            <p>${orderDate(o.createdAt, o.createdAtText)}</p>
          </div>
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:flex-end">
            <span class="profile-order-status status-${o.status || 'new'}">${status}</span>
            <button class="profile-order-toggle" type="button" data-order-toggle>Показать товары</button>
          </div>
        </div>
        <div class="profile-order-meta">
          <span>Товаров: <b>${qty}</b></span>
          <span class="profile-order-payment">Оплата: <b>${orderPaymentTitle(o)}</b></span>
          <span>Сумма: <b>${fmtPrice(o.total || 0)}</b></span>
        </div>
        <div class="profile-order-items">
          ${items.map(item => `<div class="profile-order-item">
            <div class="profile-order-img">${item.image ? `<img src="${item.image}" alt="">` : '<span>Фото</span>'}</div>
            <div>
              <b>${item.title || 'Товар'}</b>
              <p>${item.group || ''}${item.code ? ` · код: ${item.code}` : ''}</p>
            </div>
            <strong>${Number(item.qty || 1)} × ${fmtPrice(item.price || 0)}</strong>
          </div>`).join('')}
        </div>
      </article>`;
    }).join('');
    box.querySelectorAll('[data-order-toggle]').forEach(btn => btn.addEventListener('click', () => {
      const card = btn.closest('[data-order-card]');
      const collapsed = card.classList.toggle('collapsed');
      btn.textContent = collapsed ? 'Показать товары' : 'Скрыть товары';
    }));
  }catch(e){
    console.error('profile orders error', e);
    box.innerHTML = '<div class="profile-empty">Не удалось загрузить заказы.</div>';
  }
}

function isProfileComplete(data={}) {
  const name = (data.name || $('#profileName')?.value || '').trim();
  const email = (data.email || $('#profileEmail')?.value || '').trim();
  const phone = (data.phone || $('#profilePhone')?.value || '').trim();
  const city = (data.city || $('#profileCity')?.value || '').trim();
  const address = (data.address || $('#profileAddress')?.value || '').trim();
  const car = (data.car || data.carText || $('#profileCar')?.value || '').trim();
  return Boolean(name && email && phone && city && address && car);
}

function makeDiscountCardNumber(uid='') {
  const base = String(uid).split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  let body = '29' + String(base).padStart(5,'0').slice(-5) + String(Date.now()).slice(-5);
  body = body.slice(0,12).padEnd(12,'0');
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(body[i]) * (i % 2 === 0 ? 1 : 3);
  const check = (10 - (sum % 10)) % 10;
  return body + check;
}

function ean13Svg(code) {
  const L = {'0':'0001101','1':'0011001','2':'0010011','3':'0111101','4':'0100011','5':'0110001','6':'0101111','7':'0111011','8':'0110111','9':'0001011'};
  const G = {'0':'0100111','1':'0110011','2':'0011011','3':'0100001','4':'0011101','5':'0111001','6':'0000101','7':'0010001','8':'0001001','9':'0010111'};
  const R = {'0':'1110010','1':'1100110','2':'1101100','3':'1000010','4':'1011100','5':'1001110','6':'1010000','7':'1000100','8':'1001000','9':'1110100'};
  const P = ['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];
  code = String(code || '').replace(/\D/g,'').padEnd(13,'0').slice(0,13);
  const parity = P[Number(code[0]) || 0];
  let bits = '101';
  for (let i=1;i<=6;i++) bits += (parity[i-1] === 'L' ? L : G)[code[i]];
  bits += '01010';
  for (let i=7;i<=12;i++) bits += R[code[i]];
  bits += '101';
  const w = 190, h = 56, barW = w / bits.length;
  let rects = '';
  for (let i=0;i<bits.length;i++) if(bits[i] === '1') rects += `<rect x="${(i*barW).toFixed(2)}" y="0" width="${Math.ceil(barW)+.4}" height="44"/>`;
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="EAN13 ${code}" xmlns="http://www.w3.org/2000/svg"><rect width="${w}" height="${h}" rx="6" fill="#fff"/>${rects}<text x="${w/2}" y="53" text-anchor="middle" font-family="monospace" font-size="10" fill="#111827">${code.replace(/(\d)(\d{6})(\d{6})/,'$1 $2 $3')}</text></svg>`;
}

function updateDiscountCardUI(user, data={}) {
  const box = $('#discountCardBox');
  if (!box) return;
  const complete = isProfileComplete(data);
  const card = data.discountCard || {};
  const active = Boolean(card.active || data.discountCardActive);
  const number = card.number || data.discountCardNumber || makeDiscountCardNumber(user?.uid || data.uid || data.email || '');
  const title = $('#discountCardStateTitle');
  const text = $('#discountCardStateText');
  const button = $('#getDiscountCardBtn');
  const cartLink = $('#discountCartLink');
  setText($('#discountCardName'), data.name || user?.displayName || data.email || user?.email || 'AutoStyle');
  setText($('#discountCardNumber'), active ? number : 'Карта пока не активна');
  const barcode = $('#discountBarcode');
  if (barcode) barcode.innerHTML = active ? ean13Svg(number) : '<div class="discount-card-lock">Заполните профиль</div>';
  box.classList.toggle('discount-locked', !active);
  box.classList.toggle('discount-active', active);
  if (active) {
    setText(title, 'Скидочная карта активна');
    setText(text, 'Карта привязана к аккаунту. При оформлении заказа можно будет применить скидку.');
    if (button) { button.hidden = true; button.style.display = 'none'; }
    if (cartLink) cartLink.hidden = false;
  } else {
    setText(title, 'Карта недоступна');
    setText(text, 'Заполните имя, телефон, город, адрес и автомобиль, чтобы получить скидочную карту.');
    if (button) {
      button.hidden = false;
      button.style.display = '';
      button.textContent = complete ? 'ПОЛУЧИТЬ СКИДОЧНУЮ КАРТУ' : 'ЗАПОЛНИТЬ ПРОФИЛЬ';
    }
    if (cartLink) cartLink.hidden = true;
  }
}

async function getDiscountCard(user) {
  const msg = $('#profileMsg');
  const current = await getUserDoc(user.uid);
  const data = {
    ...current.data,
    name: $('#profileName')?.value?.trim() || current.data.name || user.displayName || '',
    email: $('#profileEmail')?.value?.trim() || current.data.email || user.email || '',
    phone: $('#profilePhone')?.value?.trim() || current.data.phone || '',
    city: $('#profileCity')?.value?.trim() || current.data.city || '',
    address: $('#profileAddress')?.value?.trim() || current.data.address || '',
    car: $('#profileCar')?.value?.trim() || current.data.car || ''
  };
  if (!isProfileComplete(data)) {
    location.hash = 'account';
    activateProfileTab('account');
    message(msg, 'Заполни имя, телефон, город, адрес и автомобиль, затем сохрани профиль.', false);
    return;
  }
  const number = current.data.discountCard?.number || current.data.discountCardNumber || makeDiscountCardNumber(user.uid);
  const issuedAt = new Date().toISOString();
  const cardData = {
    userId: user.uid,
    uid: user.uid,
    number,
    type: 'EAN13',
    active: true,
    name: data.name,
    email: data.email,
    phone: data.phone,
    city: data.city,
    address: data.address,
    car: data.car,
    issuedAt,
    updatedAt: issuedAt,
    searchText: `${data.name} ${data.email} ${data.phone} ${number} ${data.city} ${data.car}`.toLowerCase()
  };
  await setDoc(current.ref, {
    uid: user.uid,
    name: data.name,
    email: data.email,
    phone: data.phone,
    city: data.city,
    address: data.address,
    car: data.car,
    discountCard: { active: true, number, type: 'EAN13', issuedAt },
    discountCardActive: true,
    discountCardNumber: number,
    updatedAt: issuedAt,
    createdAt: current.data.createdAt || issuedAt,
    role: current.data.role || 'user'
  }, { merge: true });
  await setDoc(doc(db, COLLECTIONS.discountCards || 'autostyle_discountCards', user.uid), {
    ...cardData,
    createdAt: current.data.discountCard?.issuedAt || issuedAt,
    createdAtServer: serverTimestamp()
  }, { merge: true });
  updateDiscountCardUI(user, { ...data, discountCard: { active: true, number } });
  message(msg, 'Скидочная карта активирована.', true);
}


function renderAuthSecurity(user){
  const box = $('#authSecurityBox'); if(!box || !user) return;
  const providers = userProviders(user);
  const phoneText = user.phoneNumber || 'не привязан';
  box.innerHTML = `
    <div class="auth-link-card">
      <div class="auth-card-icon">🔐</div>
      <b>Способы входа</b>
      <div class="auth-provider-list" style="margin:12px 0">${providers.length ? providers.map(p=>`<span class="auth-provider-pill">${providerTitle(p)}</span>`).join('') : '<span class="auth-provider-pill">Email/пароль</span>'}</div>
      <p class="muted">Почта: <span class="${user.emailVerified?'auth-verified':'auth-not-verified'}">${user.emailVerified?'подтверждена':'не подтверждена'}</span><br>Телефон: <span class="${user.phoneNumber?'auth-verified':'auth-not-verified'}">${phoneText}</span></p>
    </div>
    <div class="auth-link-card">
      <div class="auth-card-icon">✉️</div>
      <b>Подтверждение почты</b>
      <p class="muted">Отправьте письмо подтверждения на текущий e-mail. После подтверждения обновите страницу.</p>
      <button id="resendProfileEmail" class="profile-save" type="button">Отправить письмо</button>
    </div>
    <div class="auth-link-card">
      <div class="auth-card-icon">📱</div>
      <b>Привязка телефона</b>
      <p class="muted">Введите номер в формате +373... и подтвердите кодом из SMS.</p>
      <div class="auth-sms-row"><input id="profileLinkPhone" value="${user.phoneNumber||''}" placeholder="+373..."><button id="profileSendSms" class="profile-save" type="button">Получить код</button></div>
      <div class="auth-sms-row" style="margin-top:8px"><input id="profileSmsCode" placeholder="Код из SMS"><button id="profileConfirmSms" class="profile-save" type="button">Подтвердить</button></div>
      <div id="profile-recaptcha"></div>
    </div>`;
  const msg = $('#profileAuthMsg'); const say=t=>message(msg,t,true); const fail=t=>message(msg,t,false);
  $('#resendProfileEmail')?.addEventListener('click', async()=>{try{await resendEmailVerification(); say('Письмо подтверждения отправлено.');}catch(e){fail('Ошибка: '+(e.message||e));}});
  $('#profileSendSms')?.addEventListener('click', async()=>{try{say('Отправляем SMS...'); await sendLinkSmsCode($('#profileLinkPhone').value.trim(),'profile-recaptcha'); say('Код отправлен.');}catch(e){fail('Ошибка SMS: '+(e.message||e));}});
  $('#profileConfirmSms')?.addEventListener('click', async()=>{try{await confirmLinkSmsCode($('#profileSmsCode').value.trim()); await auth.currentUser.reload(); renderAuthSecurity(auth.currentUser); say('Телефон привязан.');}catch(e){fail('Ошибка подтверждения: '+(e.message||e));}});
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
    renderAuthSecurity(user);
    $('#profileForm').onsubmit = async e => { e.preventDefault(); try{ await saveProfile(user); }catch(err){ message($('#profileMsg'), 'Ошибка: ' + (err.message || err), false); } };
    $('#avatarInput').onchange = async e => { try{ await uploadAvatar(user, e.target.files[0]); }catch(err){ message($('#avatarMsg'), 'Ошибка загрузки: ' + (err.message || err), false); } };
    $('#passwordForm').onsubmit = async e => { e.preventDefault(); try{ await changePassword(user); }catch(err){ message($('#passwordMsg'), 'Ошибка: ' + (err.message || err), false); } };
    const getCardBtn = $('#getDiscountCardBtn');
    if (getCardBtn) getCardBtn.onclick = async () => { try { await getDiscountCard(user); } catch(err) { alert('Не удалось получить карту: ' + (err.message || err)); } };
    await renderFavorites();
    await renderOrders(user);
    window.AutoStyleLoader?.hide();
  }catch(e){ console.error(e); window.AutoStyleLoader?.hide(); }
});
