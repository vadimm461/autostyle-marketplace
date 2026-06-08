import { auth, db, COLLECTIONS } from './firebase.js';
import {
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  arrayUnion
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

export const NOTIFICATIONS_COLLECTION = COLLECTIONS.notifications || 'autostyle_notifications';
export const NOTIFICATION_READS_COLLECTION = COLLECTIONS.notificationReads || 'autostyle_notification_reads';
export const NOTIFICATION_CACHE_KEY = 'autostyle_notifications_cache_v2';
export const NOTIFICATION_READ_CACHE_KEY = 'autostyle_notifications_read_ids_v2';

export function stripHtml(html){
  const div = document.createElement('div');
  div.innerHTML = html || '';
  return div.textContent || div.innerText || '';
}

export function esc(v){
  return String(v ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#039;');
}

export function fmt(v){
  try{
    const d = v?.toDate ? v.toDate() : new Date(v || Date.now());
    return d.toLocaleString('ru-RU');
  }catch(e){ return ''; }
}

export function notificationMs(n){
  try{
    const value = n.createdAt || n.createdAtLocal || n.updatedAt || 0;
    const d = value?.toDate ? value.toDate() : new Date(value || 0);
    return d.getTime() || 0;
  }catch(e){ return 0; }
}

export function notificationText(n){
  return n.text || stripHtml(n.html) || '';
}

function cacheNotifications(list){
  try{
    const safe = list.map(n => ({
      ...n,
      createdAt: n.createdAt?.toDate ? n.createdAt.toDate().toISOString() : n.createdAt,
      updatedAt: n.updatedAt?.toDate ? n.updatedAt.toDate().toISOString() : n.updatedAt
    }));
    localStorage.setItem(NOTIFICATION_CACHE_KEY, JSON.stringify(safe.slice(0, 100)));
  }catch(e){}
}

export function cachedNotifications(){
  try { return JSON.parse(localStorage.getItem(NOTIFICATION_CACHE_KEY) || '[]') || []; }
  catch(e){ return []; }
}

export function cachedReadIds(){
  try { return new Set(JSON.parse(localStorage.getItem(NOTIFICATION_READ_CACHE_KEY) || '[]') || []); }
  catch(e){ return new Set(); }
}

function cacheReadIds(ids){
  try { localStorage.setItem(NOTIFICATION_READ_CACHE_KEY, JSON.stringify([...ids])); }
  catch(e){}
}

function normalizeList(map){
  return [...map.values()].sort((a,b) => notificationMs(b) - notificationMs(a));
}

export function isNotificationForUser(n, user){
  if (!n) return false;
  if ((n.audience || 'all') === 'all') return true;
  if (!user) return false;
  return n.userId === user.uid || n.uid === user.uid || n.userEmail === user.email;
}

export function watchNotifications(user, callback){
  const docs = new Map();
  const unsubs = [];
  let readIds = cachedReadIds();
  let lastList = cachedNotifications().filter(n => isNotificationForUser(n, user));

  function emit(){
    const list = normalizeList(docs.size ? docs : new Map(lastList.map(n => [n.id, n])));
    cacheNotifications(list);
    callback({ list, readIds, unread: list.filter(n => !readIds.has(n.id)).length });
  }

  callback({ list: lastList, readIds, unread: lastList.filter(n => !readIds.has(n.id)).length });

  const applySnapshot = snap => {
    snap.docChanges().forEach(change => {
      if (change.type === 'removed') docs.delete(change.doc.id);
      else docs.set(change.doc.id, { id: change.doc.id, ...change.doc.data() });
    });
    lastList = normalizeList(docs);
    emit();
  };

  try{
    // Без orderBy: так не нужен составной индекс Firestore для audience + createdAt.
    // Сортировка выполняется на клиенте в normalizeList().
    unsubs.push(onSnapshot(
      query(collection(db, NOTIFICATIONS_COLLECTION), where('audience','==','all'), limit(80)),
      applySnapshot,
      err => console.warn('global notifications snapshot error', err)
    ));
  }catch(e){ console.warn('global notifications query error', e); }

  if (user?.uid) {
    try{
      // Без orderBy: так не нужен составной индекс Firestore для userId + createdAt.
      // Сортировка выполняется на клиенте в normalizeList().
      unsubs.push(onSnapshot(
        query(collection(db, NOTIFICATIONS_COLLECTION), where('userId','==', user.uid), limit(80)),
        applySnapshot,
        err => console.warn('user notifications snapshot error', err)
      ));
    }catch(e){ console.warn('user notifications query error', e); }

    const readRef = doc(db, NOTIFICATION_READS_COLLECTION, user.uid);
    unsubs.push(onSnapshot(readRef, snap => {
      readIds = new Set(snap.exists() ? (snap.data().readIds || []) : []);
      cacheReadIds(readIds);
      emit();
    }, err => console.warn('notification reads snapshot error', err)));
  }

  return () => unsubs.forEach(fn => { try{ fn(); }catch(e){} });
}

export async function markNotificationRead(user, notificationId){
  if (!notificationId) return;
  const ids = cachedReadIds();
  ids.add(notificationId);
  cacheReadIds(ids);
  if (!user?.uid) return;
  await setDoc(doc(db, NOTIFICATION_READS_COLLECTION, user.uid), {
    userId: user.uid,
    readIds: arrayUnion(notificationId),
    updatedAt: serverTimestamp()
  }, { merge: true });
}

export async function markNotificationsRead(user, notificationIds){
  const ids = [...new Set((notificationIds || []).filter(Boolean))];
  if (!ids.length) return;
  const cached = cachedReadIds();
  ids.forEach(id => cached.add(id));
  cacheReadIds(cached);
  if (!user?.uid) return;
  const payload = { userId: user.uid, updatedAt: serverTimestamp() };
  ids.forEach(id => { payload.readIds = arrayUnion(id); });
  await setDoc(doc(db, NOTIFICATION_READS_COLLECTION, user.uid), {
    userId: user.uid,
    readIds: arrayUnion(...ids),
    updatedAt: serverTimestamp()
  }, { merge: true });
}

export async function createNotification({ title, html, text, audience = 'all', userId = '', userEmail = '', type = 'manual', orderId = '', orderNumber = '', link = '' }){
  const cleanText = (text || stripHtml(html) || '').trim();
  const payload = {
    title: String(title || 'Уведомление').trim(),
    html: html || `<p>${esc(cleanText)}</p>`,
    text: cleanText,
    audience,
    type,
    createdAt: serverTimestamp(),
    createdAtLocal: new Date().toISOString(),
    unread: true
  };
  if (userId) payload.userId = userId;
  if (userEmail) payload.userEmail = userEmail;
  if (orderId) payload.orderId = orderId;
  if (orderNumber) payload.orderNumber = orderNumber;
  if (link) payload.link = link;
  return addDoc(collection(db, NOTIFICATIONS_COLLECTION), payload);
}

export async function createOrderStatusNotification(order, statusTitle, statusKey){
  if (!order || !(order.userId || order.uid || order.userEmail)) return null;
  const orderNumber = order.orderNumber || order.id || '';
  return createNotification({
    title: `Статус заказа ${orderNumber ? `№${orderNumber}` : ''} изменён`,
    html: `<p>Ваш заказ ${orderNumber ? `<b>№${esc(orderNumber)}</b>` : ''} теперь имеет статус: <b>${esc(statusTitle)}</b>.</p>`,
    text: `Ваш заказ ${orderNumber ? `№${orderNumber}` : ''} теперь имеет статус: ${statusTitle}.`,
    audience: 'user',
    userId: order.userId || order.uid || '',
    userEmail: order.userEmail || '',
    type: 'order_status',
    orderId: order.id || '',
    orderNumber,
    link: 'profile.html#orders'
  });
}

export async function createPasswordChangedNotification(user){
  if (!user?.uid) return null;
  return createNotification({
    title: 'Пароль изменён',
    html: '<p>Пароль от вашего аккаунта AutoStyle был успешно изменён.</p><p>Если это были не вы, срочно свяжитесь с поддержкой магазина.</p>',
    text: 'Пароль от вашего аккаунта AutoStyle был успешно изменён. Если это были не вы, свяжитесь с поддержкой.',
    audience: 'user',
    userId: user.uid,
    userEmail: user.email || '',
    type: 'password_changed',
    link: 'profile.html#security'
  });
}
