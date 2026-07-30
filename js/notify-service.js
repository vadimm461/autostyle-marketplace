import { auth, db, COLLECTIONS } from './firebase.js';
import {
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
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
export const USER_GROUPS_COLLECTION = 'autostyle_user_groups';

export function stripHtml(html){
  const div = document.createElement('div');
  div.innerHTML = html || '';
  return div.textContent || div.innerText || '';
}

// Notification HTML is entered through the admin rich-text editor and is
// stored in Firestore. Render it in a deliberately small, safe subset: a
// pasted <style>, fixed-position element, event handler, or iframe must never
// be able to cover the site's header and navigation.
const SAFE_NOTIFICATION_TAGS = new Set([
  'a','b','strong','i','em','u','s','del','mark','small','sub','sup','br',
  'p','div','span','blockquote','pre','code','h1','h2','h3','h4','h5','h6',
  'ul','ol','li','hr','img','table','thead','tbody','tfoot','tr','th','td'
]);
const REMOVE_NOTIFICATION_TAGS = new Set([
  'script','style','link','meta','base','iframe','object','embed','form',
  'input','button','select','textarea','option','video','audio','canvas','svg'
]);
const SAFE_NOTIFICATION_STYLE_PROPERTIES = new Set([
  'color','background-color','font-size','font-family','font-weight',
  'font-style','text-decoration','text-align','line-height','letter-spacing',
  'border-radius','max-width','vertical-align'
]);

function safeNotificationUrl(value, kind){
  const raw = String(value || '').trim();
  if (!raw || /^javascript:|^vbscript:|^data:(?!image\/)/i.test(raw)) return '';
  if (kind === 'image' && /^data:image\/(?:png|gif|jpe?g|webp);/i.test(raw)) return raw;
  if (/^(?:https?:|mailto:|tel:|\/|\.?\.?\/|#)/i.test(raw)) return raw;
  return '';
}

function safeNotificationStyle(value){
  const probe = document.createElement('span');
  probe.style.cssText = String(value || '');
  const kept = [];
  for (let i = 0; i < probe.style.length; i += 1) {
    const property = probe.style[i].toLowerCase();
    if (!SAFE_NOTIFICATION_STYLE_PROPERTIES.has(property)) continue;
    const cssValue = probe.style.getPropertyValue(property).trim();
    if (!cssValue || /url\s*\(|expression\s*\(|javascript\s*:|[{}]/i.test(cssValue)) continue;
    kept.push(`${property}:${cssValue}`);
  }
  return kept.join(';');
}

export function sanitizeNotificationHtml(html){
  const raw = String(html || '').trim();
  if (!raw) return '';
  let template;
  try {
    template = document.createElement('template');
    template.innerHTML = raw;
  } catch (_) {
    return '';
  }

  [...template.content.querySelectorAll('*')].forEach(node => {
    const tag = node.tagName.toLowerCase();
    if (REMOVE_NOTIFICATION_TAGS.has(tag)) {
      node.remove();
      return;
    }
    if (!SAFE_NOTIFICATION_TAGS.has(tag)) {
      const parent = node.parentNode;
      if (!parent) return;
      while (node.firstChild) parent.insertBefore(node.firstChild, node);
      node.remove();
      return;
    }

    [...node.attributes].forEach(attribute => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value;
      if (name.startsWith('on') || ['id','class','srcset','formaction'].includes(name)) {
        node.removeAttribute(attribute.name);
        return;
      }
      if (name === 'style') {
        const style = safeNotificationStyle(value);
        if (style) node.setAttribute('style', style);
        else node.removeAttribute('style');
        return;
      }
      const allowed = ['alt','title','aria-label','colspan','rowspan','target','rel'].includes(name);
      if (tag === 'a' && name === 'href') {
        const href = safeNotificationUrl(value, 'link');
        if (href) node.setAttribute('href', href);
        else node.removeAttribute('href');
        return;
      }
      if (tag === 'img' && name === 'src') {
        const src = safeNotificationUrl(value, 'image');
        if (src) node.setAttribute('src', src);
        else node.removeAttribute('src');
        return;
      }
      if (!allowed) node.removeAttribute(attribute.name);
    });

    if (tag === 'a' && node.hasAttribute('href')) {
      const href = node.getAttribute('href') || '';
      if (/^https?:/i.test(href)) {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
    }
    if (tag === 'img' && node.hasAttribute('src')) {
      node.setAttribute('loading', 'lazy');
      node.setAttribute('decoding', 'async');
    }
  });

  return template.innerHTML;
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

export function userCreatedMs(user){
  try{
    const t = user?.metadata?.creationTime || user?.createdAt || user?.createdAtLocal || 0;
    const ms = new Date(t).getTime();
    return Number.isFinite(ms) ? ms : 0;
  }catch(e){ return 0; }
}

export function isNotificationAfterRegistration(n, user){
  if (!user) return false;
  const created = notificationMs(n);
  const userCreated = userCreatedMs(user);
  if (!userCreated || !created) return true;
  // Небольшой запас на разницу времени сервера/клиента.
  return created >= (userCreated - 60000);
}

export function isNotificationForUser(n, user, groupIds = []){
  if (!n || !user) return false;
  if (!isNotificationAfterRegistration(n, user)) return false;
  const audience = n.audience || 'all';
  if (audience === 'all') return true;
  if (audience === 'user') return n.userId === user.uid || n.uid === user.uid || (n.userEmail && n.userEmail === user.email);
  if (audience === 'group') return !!(n.groupId && groupIds.includes(n.groupId));
  return false;
}

async function loadUserGroupIds(user){
  if (!user?.uid) return [];
  const ids = new Set();
  try{
    const userSnap = await getDoc(doc(db, COLLECTIONS.users || 'autostyle_users', user.uid));
    if (userSnap.exists()) {
      const data = userSnap.data() || {};
      (data.groupIds || data.groups || []).forEach(id => id && ids.add(String(id)));
    }
  }catch(e){ console.warn('user groups from profile error', e); }
  try{
    const groupsSnap = await getDocs(query(collection(db, USER_GROUPS_COLLECTION), where('userIds','array-contains', user.uid)));
    groupsSnap.docs.forEach(d => ids.add(d.id));
  }catch(e){ console.warn('user groups query error', e); }
  return [...ids];
}

export function watchNotifications(user, callback){
  if (!user?.uid) {
    cacheNotifications([]);
    callback({ list: [], readIds: new Set(), unread: 0 });
    return () => {};
  }

  const docs = new Map();
  const unsubs = [];
  let readIds = cachedReadIds();
  let groupIds = [];
  let lastList = cachedNotifications().filter(n => isNotificationForUser(n, user, groupIds));

  function visibleDocs(){
    return normalizeList(docs).filter(n => isNotificationForUser(n, user, groupIds));
  }

  function emit(){
    const list = visibleDocs();
    cacheNotifications(list);
    callback({ list, readIds, unread: list.filter(n => !readIds.has(n.id)).length });
  }

  callback({ list: lastList, readIds, unread: lastList.filter(n => !readIds.has(n.id)).length });

  const applySnapshot = snap => {
    snap.docChanges().forEach(change => {
      if (change.type === 'removed') docs.delete(change.doc.id);
      else docs.set(change.doc.id, { id: change.doc.id, ...change.doc.data() });
    });
    lastList = visibleDocs();
    emit();
  };

  loadUserGroupIds(user).then(ids => {
    groupIds = ids;
    emit();

    try{
      unsubs.push(onSnapshot(
        query(collection(db, NOTIFICATIONS_COLLECTION), where('audience','==','all'), limit(80)),
        applySnapshot,
        err => console.warn('global notifications snapshot error', err)
      ));
    }catch(e){ console.warn('global notifications query error', e); }

    try{
      unsubs.push(onSnapshot(
        query(collection(db, NOTIFICATIONS_COLLECTION), where('userId','==', user.uid), limit(80)),
        applySnapshot,
        err => console.warn('user notifications snapshot error', err)
      ));
    }catch(e){ console.warn('user notifications query error', e); }

    groupIds.forEach(groupId => {
      try{
        unsubs.push(onSnapshot(
          query(collection(db, NOTIFICATIONS_COLLECTION), where('audience','==','group'), where('groupId','==', groupId), limit(80)),
          applySnapshot,
          err => console.warn('group notifications snapshot error', err)
        ));
      }catch(e){ console.warn('group notifications query error', e); }
    });
  });

  const readRef = doc(db, NOTIFICATION_READS_COLLECTION, user.uid);
  unsubs.push(onSnapshot(readRef, snap => {
    readIds = new Set(snap.exists() ? (snap.data().readIds || []) : []);
    cacheReadIds(readIds);
    emit();
  }, err => console.warn('notification reads snapshot error', err)));

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

export async function createNotification({ title, html, text, audience = 'all', userId = '', userEmail = '', groupId = '', groupName = '', type = 'manual', orderId = '', orderNumber = '', link = '' }){
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
  if (groupId) payload.groupId = groupId;
  if (groupName) payload.groupName = groupName;
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
