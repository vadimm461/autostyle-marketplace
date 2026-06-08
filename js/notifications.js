import { auth, db, COLLECTIONS } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { collection, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
  watchNotifications,
  markNotificationRead,
  markNotificationsRead,
  esc,
  fmt,
  notificationText
} from './notify-service.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

let currentUser = null;
let state = { list: [], readIds: new Set(), unread: 0 };
let unsubscribe = null;
let pageMode = 'list';
let openNotificationId = new URLSearchParams(location.search).get('id') || localStorage.getItem('autostyle_selected_notification') || '';


async function loadCollectionSafe(name){
  try{
    const snap = await getDocs(collection(db, name));
    return snap.docs.map(d => ({ id:d.id, ...d.data() }));
  }catch(e){
    console.warn('catalog menu load error', name, e);
    return [];
  }
}
function initNotificationCatalogMenu(){
  const menu = document.querySelector('.catalog-menu');
  const btn = document.querySelector('.catalog-btn');
  if (!menu || !btn || menu.dataset.notifyCatalogReady === '1') return;
  menu.dataset.notifyCatalogReady = '1';
  btn.addEventListener('click', async e => {
    e.preventDefault();
    e.stopPropagation();
    menu.classList.toggle('open');
    if (menu.classList.contains('open')) await renderNotificationCatalogMenu();
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.catalog-menu')) menu.classList.remove('open');
  });
}
function catName(c){ return c?.title || c?.name || 'Без названия'; }
function catId(c){ return String(c?.id || c?.externalId || catName(c)).trim(); }
function parentKey(c){ return String(c?.parentId || c?.parent || c?.parentExternalId || '').trim(); }
function normCatText(text){ return String(text || '').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/[\s_-]+/g, ' '); }
function isBlockedCatalogName(text){ const n = normCatText(text); return n === 'тмц' || n === 'я мусорка' || n === 'ямусорка' || n.includes('мусорка'); }
function isServiceGroup(c){ return /^\s*\d+[.)-]?\s*/.test(catName(c)); }
function sortCats(a,b){ return Number(a.order ?? 999) - Number(b.order ?? 999) || catName(a).localeCompare(catName(b), 'ru'); }
function parentAllLabel(parent){
  const raw = catName(parent).trim();
  const lower = raw.toLocaleLowerCase('ru-RU');
  const map = { 'инструмент':'инструменты', 'аккумулятор':'аккумуляторы', 'ароматизатор':'ароматизаторы', 'лампочка':'лампочки', 'колпак':'колпаки', 'коврик':'коврики', 'фильтр':'фильтры' };
  return 'Все ' + (map[lower] || lower);
}
function shortChildName(child, parent){
  let childName = catName(child).trim();
  const parentName = catName(parent).trim();
  const re = new RegExp('^' + parentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+', 'i');
  childName = childName.replace(re, '').trim();
  return childName || catName(child);
}
async function renderNotificationCatalogMenu(){
  const pb = $('#catalogParents'), cb = $('#catalogChildren'), tb = $('#megaTitle');
  if (!pb || !cb || !tb) return;
  if (pb.dataset.loaded === '1') return;
  pb.innerHTML = '<p class="muted">Загружаем категории...</p>';
  let cats = await loadCollectionSafe(COLLECTIONS.categories || 'autostyle_categories');
  cats = cats.filter(c => catName(c).trim() && !isBlockedCatalogName(catName(c))).sort(sortCats);
  const byId = new Map();
  cats.forEach(c => [catId(c), String(c.externalId || '').trim()].filter(Boolean).forEach(id => byId.set(id, c)));
  const parentOf = c => byId.get(parentKey(c));
  const showInTopCatalog = c => c.showInTopCatalog !== false && c.hideFromTopCatalog !== true && !isBlockedCatalogName(catName(c)) && !isServiceGroup(c);
  const childrenOf = parent => {
    const ids = [catId(parent), String(parent.externalId || '').trim()].filter(Boolean);
    return cats.filter(c => ids.includes(parentKey(c)) && showInTopCatalog(c)).sort(sortCats);
  };
  let parents = cats.filter(c => {
    if (!showInTopCatalog(c)) return false;
    const p = parentOf(c);
    if (!p) return !parentKey(c) || childrenOf(c).length > 0;
    if (isServiceGroup(p)) return true;
    return childrenOf(c).length > 0;
  });
  const seen = new Set();
  parents = parents.filter(c => { const key = catId(c) || catName(c).toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; }).sort(sortCats);
  function render(parent){
    const list = childrenOf(parent);
    tb.textContent = catName(parent);
    const allItem = `<a href="catalog.html?category=${encodeURIComponent(catName(parent))}" class="mega-child mega-child-all"><div><b>${parentAllLabel(parent)}</b><small>Основная категория и все подкатегории</small></div></a>`;
    cb.innerHTML = allItem + list.map(ch => `<a href="catalog.html?category=${encodeURIComponent(catName(ch))}" class="mega-child"><div><b>${shortChildName(ch,parent)}</b><small>${catName(ch)}</small></div></a>`).join('');
  }
  pb.dataset.loaded = '1';
  pb.innerHTML = parents.length ? parents.map((p,i)=>`<button class="mega-parent ${i ? '' : 'active'}" data-parent="${catId(p)}" type="button">${catName(p)}</button>`).join('') : '<p class="muted">Категорий пока нет</p>';
  if (parents[0]) render(parents[0]);
  $$('.mega-parent').forEach(btn => btn.onmouseenter = btn.onclick = () => {
    $$('.mega-parent').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const p = parents.find(x => catId(x) === btn.dataset.parent);
    if (p) render(p);
  });
}

function isRead(id){ return state.readIds.has(id); }
function unreadList(){ return state.list.filter(n => !isRead(n.id)); }
function readList(){ return state.list.filter(n => isRead(n.id)); }

function updateCount(){
  const count = state.unread || 0;
  $$('#notificationCount').forEach(el => {
    el.dataset.count = String(count);
    el.textContent = count ? String(count) : '';
  });
}

function ensureDropdown(){
  let dd = $('#notificationsDropdown');
  if (!dd) {
    dd = document.createElement('div');
    dd.id = 'notificationsDropdown';
    dd.className = 'as-notify-dropdown';
    document.body.appendChild(dd);
  }
  return dd;
}

function notificationPreview(n){
  const readClass = isRead(n.id) ? ' is-read' : ' is-unread';
  return `
    <button class="as-notify-preview${readClass}" type="button" data-notify-id="${esc(n.id)}">
      <div class="as-notify-preview-title">${!isRead(n.id) ? '<span class="as-notify-dot"></span>' : ''}${esc(n.title || 'Уведомление')}</div>
      <div class="as-notify-preview-text">${esc(notificationText(n))}</div>
      <div class="as-notify-preview-date">${esc(fmt(n.createdAt || n.createdAtLocal))}</div>
    </button>`;
}

function bindNotificationOpen(root){
  root.querySelectorAll('[data-notify-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.notifyId;
      localStorage.setItem('autostyle_selected_notification', id);
      await markNotificationRead(currentUser, id);
      const n = state.list.find(x => x.id === id);
      if (n?.link && !location.pathname.endsWith('notifications.html')) {
        location.href = n.link;
        return;
      }
      location.href = `notifications.html?id=${encodeURIComponent(id)}`;
    });
  });
}

function renderDropdown(){
  const dd = ensureDropdown();
  const list = state.list.slice(0, 8);
  dd.innerHTML = `
    <div class="as-notify-dropdown-head">
      <h3>Уведомления</h3>
      ${state.unread ? `<button type="button" id="markAllNotificationsRead">Прочитать все</button>` : ''}
    </div>
    ${list.length ? list.map(notificationPreview).join('') : `<div class="as-notify-empty">Пока уведомлений нет.</div>`}
    <a class="as-notify-preview" href="notifications.html"><b>Открыть все уведомления</b></a>`;
  bindNotificationOpen(dd);
  $('#markAllNotificationsRead')?.addEventListener('click', async e => {
    e.preventDefault();
    await markNotificationsRead(currentUser, unreadList().map(n => n.id));
  });
  updateCount();
  return dd;
}

function bindHeader(){
  const btn = $('#notificationsBtn');
  if (!btn || btn.dataset.bound === '1') return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    const dd = renderDropdown();
    dd.classList.toggle('open');
  });
  document.addEventListener('click', e => {
    const dd = $('#notificationsDropdown');
    if (!dd) return;
    if (e.target.closest('#notificationsBtn') || e.target.closest('#notificationsDropdown')) return;
    dd.classList.remove('open');
  });
}

function card(n){
  return `
    <article class="as-notify-full-card ${isRead(n.id) ? 'is-read' : 'is-unread'}" data-open-notification="${esc(n.id)}">
      <h3>${!isRead(n.id) ? '<span class="as-notify-dot"></span>' : ''}${esc(n.title || 'Уведомление')}</h3>
      <p>${esc(notificationText(n))}</p>
      <div class="as-notify-preview-date">${esc(fmt(n.createdAt || n.createdAtLocal))}</div>
    </article>`;
}

function renderPage(){
  const root = $('#notificationsPage');
  if (!root) return;

  function showList(){
    pageMode = 'list';
    openNotificationId = '';
    localStorage.removeItem('autostyle_selected_notification');
    const unread = unreadList();
    const read = readList();
    root.innerHTML = `
      <div class="as-notify-page-head">
        <h1>Уведомления</h1>
        ${unread.length ? `<button type="button" id="pageMarkAllRead">Отметить все прочитанными</button>` : ''}
      </div>
      <section class="as-notify-section">
        <h2>Непрочитанные <span>${unread.length}</span></h2>
        <div class="as-notify-list">${unread.length ? unread.map(card).join('') : '<div class="as-notify-empty">Новых уведомлений нет.</div>'}</div>
      </section>
      <section class="as-notify-section">
        <h2>Прочитанные <span>${read.length}</span></h2>
        <div class="as-notify-list">${read.length ? read.map(card).join('') : '<div class="as-notify-empty">Прочитанных уведомлений пока нет.</div>'}</div>
      </section>`;
    root.querySelectorAll('[data-open-notification]').forEach(cardEl => {
      cardEl.addEventListener('click', () => showDetail(cardEl.dataset.openNotification));
    });
    $('#pageMarkAllRead')?.addEventListener('click', () => markNotificationsRead(currentUser, unread.map(n => n.id)));
  }

  async function showDetail(id){
    pageMode = 'detail';
    openNotificationId = id;
    const n = state.list.find(x => String(x.id) === String(id)) || state.list[0];
    if (!n) { showList(); return; }
    await markNotificationRead(currentUser, n.id);
    root.innerHTML = `
      <button type="button" class="as-notify-back">← Все уведомления</button>
      <h1 class="as-notify-detail-title">${esc(n.title || 'Уведомление')}</h1>
      <div class="as-notify-detail-date">${esc(fmt(n.createdAt || n.createdAtLocal))}</div>
      <div class="as-notify-detail-body">${n.html || `<p>${esc(notificationText(n))}</p>`}</div>
      ${n.link ? `<p><a class="primary as-notify-link" href="${esc(n.link)}">Перейти</a></p>` : ''}`;
    root.querySelector('.as-notify-back').addEventListener('click', showList);
  }

  if (openNotificationId) showDetail(openNotificationId);
  else if (pageMode === 'detail') showDetail(openNotificationId);
  else showList();
}

function applyState(next){
  state = next;
  updateCount();
  if ($('#notificationsDropdown')?.classList.contains('open')) renderDropdown();
  renderPage();
}

function ensureUnifiedHeader(){
  const header = document.querySelector('header.topbar, header');
  if (!header) return;
  const bar = header.querySelector('.bar') || header;
  ensureUnifiedCatalog(bar);
  normalizeHeaderActionButtons(bar);
  updateCartBadgeCount();
}

function ensureUnifiedCatalog(bar){
  let btn = bar.querySelector('.catalog-btn');
  if (!btn) return;
  let menu = btn.closest('.catalog-menu');
  if (!menu) {
    menu = document.createElement('div');
    menu.className = 'catalog-menu';
    btn.parentNode.insertBefore(menu, btn);
    menu.appendChild(btn);
  }
  btn.classList.add('as-catalog-unified');
  btn.setAttribute('type', btn.tagName === 'BUTTON' ? 'button' : 'button');
  btn.innerHTML = '<span class="as-catalog-icon">☰</span><span class="as-catalog-text">Каталог</span>';
  if (!menu.querySelector('.catalog-popup')) {
    const popup = document.createElement('div');
    popup.className = 'catalog-popup mega-catalog';
    popup.innerHTML = '<div class="mega-left"><h3>Каталог товаров</h3><div id="catalogParents" class="mega-parent-list"></div></div><div class="mega-right"><h3 id="megaTitle">Выберите категорию</h3><div id="catalogChildren" class="mega-child-grid"></div></div>';
    menu.appendChild(popup);
  }
  initNotificationCatalogMenu();
}

function iconForAction(kind){
  return kind === 'profile' ? '👤' : kind === 'notify' ? '🔔' : kind === 'fav' ? '♡' : '🛒';
}
function labelForAction(kind){
  return kind === 'profile' ? 'Профиль' : kind === 'notify' ? 'Уведомления' : kind === 'fav' ? 'Избранное' : 'Корзина';
}
function detectActionKind(el){
  const text = String(el.textContent || '').toLowerCase();
  const href = String(el.getAttribute('href') || '').toLowerCase();
  if (el.id === 'notificationsBtn' || text.includes('уведом')) return 'notify';
  if (href.includes('favorites') || text.includes('избран')) return 'fav';
  if (href.includes('cart') || text.includes('корзин')) return 'cart';
  if (el.id === 'openAuth' || el.id === 'accountBtn' || href.includes('profile') || text.includes('аккаунт') || text.includes('профиль')) return 'profile';
  return '';
}
function normalizeOneAction(el, kind){
  if (!el || !kind) return;
  el.classList.add('icon-btn', 'as-header-action', `as-header-${kind}`);
  if (kind === 'notify') {
    el.id = 'notificationsBtn';
    el.setAttribute('type', 'button');
  }
  if (kind === 'fav' && el.tagName === 'BUTTON' && !el.dataset.asFavClickReady) {
    el.dataset.asFavClickReady = '1';
    el.addEventListener('click', e => { e.preventDefault(); location.href = 'favorites.html'; });
  }
  let badge = '';
  if (kind === 'notify') badge = '<b id="notificationCount" class="as-notify-count as-action-badge" data-count="0"></b>';
  if (kind === 'cart') {
    const old = el.querySelector('#cartCount, .cartCount');
    const value = old ? old.textContent.trim() : '0';
    badge = `<b id="cartCount" class="as-cart-count as-action-badge">${value}</b>`;
  }
  el.innerHTML = `<span class="as-action-icon">${iconForAction(kind)}</span><span class="as-action-label">${labelForAction(kind)}</span>${badge}`;
  const order = { profile: 1, notify: 2, fav: 3, cart: 4 }[kind] || 9;
  el.style.order = String(order);
}
function normalizeHeaderActionButtons(bar){
  let actions = bar.querySelector('.as-header-actions');
  const candidates = Array.from(bar.querySelectorAll(':scope > a, :scope > button, :scope > div.dropdown > button, :scope > div.dropdown')).filter(el => {
    if (el.classList?.contains('catalog-menu') || el.classList?.contains('search')) return false;
    return detectActionKind(el) || el.id === 'accountDrop';
  });
  if (!actions) {
    actions = document.createElement('div');
    actions.className = 'as-header-actions';
    const first = candidates[0];
    if (first) first.parentNode.insertBefore(actions, first);
    else bar.appendChild(actions);
  }
  Array.from(bar.children).forEach(el => {
    if (el === actions) return;
    if (el.id === 'accountDrop' || detectActionKind(el)) actions.appendChild(el);
  });
  Array.from(actions.children).forEach(el => {
    if (el.id === 'accountDrop') {
      el.classList.add('as-header-account-wrap');
      const btn = el.querySelector('#accountBtn');
      if (btn) normalizeOneAction(btn, 'profile');
      return;
    }
    const kind = detectActionKind(el);
    if (kind) normalizeOneAction(el, kind);
  });
}
function updateCartBadgeCount(){
  const raw = localStorage.getItem('cart') || '[]';
  let count = 0;
  try {
    const cart = JSON.parse(raw);
    count = Array.isArray(cart) ? cart.reduce((s, item) => s + Number(item.qty || item.quantity || 1), 0) : Object.keys(cart || {}).length;
  } catch(e) {}
  $$('#cartCount').forEach(el => { el.textContent = count ? String(count) : '0'; el.dataset.count = String(count); });
}

window.addEventListener('storage', updateCartBadgeCount);
window.addEventListener('autostyle-cart-updated', updateCartBadgeCount);
setInterval(updateCartBadgeCount, 1200);

function start(user){
  currentUser = user || null;
  ensureUnifiedHeader();
  initNotificationCatalogMenu();
  bindHeader();
  if (unsubscribe) unsubscribe();
  unsubscribe = watchNotifications(currentUser, applyState);
}

document.addEventListener('DOMContentLoaded', ensureUnifiedHeader);
onAuthStateChanged(auth, start);
start(auth.currentUser);
setTimeout(ensureUnifiedHeader, 300);
setTimeout(ensureUnifiedHeader, 1000);
