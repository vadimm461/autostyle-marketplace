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
let catalogCategoriesCache = null;

function qsEscapeAttr(value){ return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }

/* ================= HEADER ================= */

function ensureHeaderReadyClass(){
  document.documentElement.classList.add('as-header-icons-ready');
}

function makeIconButton(el, type, icon, label){
  if (!el) return;
  el.classList.add('as-header-action');
  el.dataset.asAction = type;
  el.innerHTML = `<span class="as-header-icon" aria-hidden="true">${icon}</span><span class="as-header-label">${label}</span>${el.querySelector('b')?.outerHTML || ''}`;
  el.setAttribute('aria-label', label);
  el.title = label;
}

function normalizeHeaderButtons(){
  const bar = document.querySelector('header .bar');
  if (!bar || bar.dataset.asHeaderNormalized === '1') return;
  bar.dataset.asHeaderNormalized = '1';

  const authBtn = $('#openAuth');
  const accountDrop = $('#accountDrop');
  const accountBtn = $('#accountBtn');
  const notifyBtn = $('#notificationsBtn');
  const favBtn = document.querySelector('header .bar a[href*="favorites.html"]');
  const cartBtn = document.querySelector('header .bar a[href*="cart.html"]');

  if (authBtn) makeIconButton(authBtn, 'auth', '👤', 'Войти');
  if (accountBtn) makeIconButton(accountBtn, 'profile', '👤', 'Профиль');
  if (notifyBtn) makeIconButton(notifyBtn, 'notifications', '🔔', 'Уведомления');
  if (favBtn) makeIconButton(favBtn, 'favorites', '♡', 'Избранное');
  if (cartBtn) makeIconButton(cartBtn, 'cart', '🛒', 'Корзина');

  if (notifyBtn && !notifyBtn.querySelector('#notificationCount')) {
    notifyBtn.insertAdjacentHTML('beforeend', '<b id="notificationCount" class="as-notify-count" data-count="0"></b>');
  }
  if (cartBtn && !cartBtn.querySelector('#cartCount')) {
    cartBtn.insertAdjacentHTML('beforeend', '<b id="cartCount">0</b>');
  }
  if (favBtn && !favBtn.querySelector('#favoritesCountBadge')) {
    favBtn.insertAdjacentHTML('beforeend', '<b id="favoritesCountBadge" class="as-fav-count" data-count="0"></b>');
  }

  if (accountDrop) {
    accountDrop.classList.add('as-account-drop');
    const drop = accountDrop.querySelector('.drop');
    if (drop && !drop.querySelector('.as-profile-direct')) {
      drop.insertAdjacentHTML('afterbegin', '<a class="as-profile-direct" href="profile.html">Открыть профиль</a>');
    }
  }
}

function updateAuthHeader(user){
  const openAuth = $('#openAuth');
  const accountDrop = $('#accountDrop');
  const userEmail = $('#userEmail');

  if (user) {
    if (openAuth) openAuth.style.setProperty('display', 'none', 'important');
    if (accountDrop) accountDrop.style.setProperty('display', 'inline-block', 'important');
    if (userEmail) userEmail.textContent = user.email || user.phoneNumber || user.displayName || 'Пользователь';
  } else {
    if (openAuth) openAuth.style.setProperty('display', 'inline-flex', 'important');
    if (accountDrop) accountDrop.style.setProperty('display', 'none', 'important');
  }
}

function bindProfileDropdown(){
  const accBtn = $('#accountBtn');
  const accDrop = $('#accountDrop');
  if (!accBtn || !accDrop || accDrop.dataset.asProfileBound === '1') return;
  accDrop.dataset.asProfileBound = '1';
  accBtn.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    accDrop.classList.toggle('open');
  });
  accDrop.addEventListener('click', e => e.stopPropagation());
  document.addEventListener('click', () => accDrop.classList.remove('open'));
}

function getArrayFromStorage(keys){
  for (const key of keys) {
    try {
      const data = JSON.parse(localStorage.getItem(key) || '[]');
      if (Array.isArray(data)) return data;
    } catch {}
  }
  return [];
}

function updateHeaderCounters(){
  const cart = getArrayFromStorage(['cart', 'autostyle_cart', 'as_cart']);
  const favs = getArrayFromStorage(['favorites', 'autostyle_favorites', 'as_favorites', 'favs']);
  const cartQty = cart.reduce((sum, item) => sum + Number(item.qty || item.quantity || item.count || 1), 0);
  $$('#cartCount').forEach(el => {
    el.textContent = cartQty ? String(cartQty) : '';
    el.dataset.count = String(cartQty);
  });
  $$('#favoritesCountBadge').forEach(el => {
    el.textContent = favs.length ? String(favs.length) : '';
    el.dataset.count = String(favs.length);
  });
}

window.addEventListener('storage', updateHeaderCounters);
document.addEventListener('click', () => setTimeout(updateHeaderCounters, 50));

/* ================= CATALOG MENU ================= */

function ensureCatalogMarkup(){
  let btn = document.querySelector('header .catalog-btn');
  if (!btn) return null;

  let menu = btn.closest('.catalog-menu');
  if (!menu) {
    menu = document.createElement('div');
    menu.className = 'catalog-menu';
    btn.parentNode.insertBefore(menu, btn);
    menu.appendChild(btn);
  }

  if (btn.tagName === 'A') {
    const newBtn = document.createElement('button');
    newBtn.className = btn.className;
    newBtn.type = 'button';
    newBtn.innerHTML = btn.innerHTML || '☰ Каталог';
    btn.replaceWith(newBtn);
    btn = newBtn;
  }

  if (!menu.querySelector('.catalog-popup')) {
    menu.insertAdjacentHTML('beforeend', `
      <div class="catalog-popup mega-catalog">
        <div class="mega-left"><h3>Каталог товаров</h3><div id="catalogParents" class="mega-parent-list"></div></div>
        <div class="mega-right"><h3 id="megaTitle">Выберите категорию</h3><div id="catalogChildren" class="mega-child-grid"></div></div>
      </div>`);
  }

  return menu;
}

async function loadCollectionSafe(name){
  try{
    const snap = await getDocs(collection(db, name));
    return snap.docs.map(d => ({ id:d.id, ...d.data() }));
  }catch(e){
    console.warn('catalog menu load error', name, e);
    return [];
  }
}

function catName(c){ return c?.title || c?.name || c?.category || c?.group || 'Без названия'; }
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

async function getCatalogCategories(){
  if (catalogCategoriesCache) return catalogCategoriesCache;
  let cats = await loadCollectionSafe(COLLECTIONS.categories || 'autostyle_categories');

  // Если категорий нет или правила временно не дали прочитать, берём группы из товаров.
  if (!cats.length) {
    const products = await loadCollectionSafe(COLLECTIONS.products || 'autostyle_products');
    const map = new Map();
    products.forEach(p => [p.group, p.category, p.categoryName].forEach(raw => {
      const title = String(raw || '').trim();
      if (!title || isBlockedCatalogName(title)) return;
      const key = title.toLocaleLowerCase('ru-RU');
      if (!map.has(key)) map.set(key, { id:key, title, order:999 });
    }));
    cats = [...map.values()];
  }

  catalogCategoriesCache = cats.filter(c => catName(c).trim() && !isBlockedCatalogName(catName(c))).sort(sortCats);
  return catalogCategoriesCache;
}

async function renderCatalogMenu(){
  const pb = $('#catalogParents'), cb = $('#catalogChildren'), tb = $('#megaTitle');
  if (!pb || !cb || !tb) return;
  pb.innerHTML = '<p class="muted">Загружаем категории...</p>';
  cb.innerHTML = '';

  const cats = await getCatalogCategories();
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
    if (!p) return true;
    if (isServiceGroup(p)) return true;
    return false;
  });

  const seen = new Set();
  parents = parents.filter(c => {
    const key = (catId(c) || catName(c)).toLocaleLowerCase('ru-RU');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort(sortCats);

  function render(parent){
    const list = childrenOf(parent);
    tb.textContent = catName(parent);
    const allItem = `<a href="catalog.html?category=${encodeURIComponent(catName(parent))}" class="mega-child mega-child-all"><div><b>${qsEscapeAttr(parentAllLabel(parent))}</b><small>Основная категория${list.length ? ' и все подкатегории' : ''}</small></div></a>`;
    cb.innerHTML = allItem + (list.length ? list.map(ch => `<a href="catalog.html?category=${encodeURIComponent(catName(ch))}" class="mega-child"><div><b>${qsEscapeAttr(shortChildName(ch,parent))}</b><small>${qsEscapeAttr(catName(ch))}</small></div></a>`).join('') : '');
  }

  pb.innerHTML = parents.length
    ? parents.map((p,i)=>`<button class="mega-parent ${i ? '' : 'active'}" data-parent="${qsEscapeAttr(catId(p))}" type="button">${qsEscapeAttr(catName(p))}</button>`).join('')
    : '<p class="muted">Категорий пока нет</p>';
  if (parents[0]) render(parents[0]);
  $$('.mega-parent').forEach(btn => {
    const openParent = () => {
      $$('.mega-parent').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const p = parents.find(x => catId(x) === btn.dataset.parent);
      if (p) render(p);
    };
    btn.addEventListener('mouseenter', openParent);
    btn.addEventListener('click', openParent);
  });
}

function initCatalogMenu(){
  const menu = ensureCatalogMarkup();
  if (!menu || menu.dataset.asCatalogReady === '1') return;
  menu.dataset.asCatalogReady = '1';
  const btn = menu.querySelector('.catalog-btn');
  const popup = menu.querySelector('.catalog-popup');

  const open = async () => {
    menu.classList.add('open');
    popup?.classList.add('open');
    if (!menu.dataset.asCatalogLoaded) {
      menu.dataset.asCatalogLoaded = '1';
      await renderCatalogMenu();
    }
  };
  const close = () => { menu.classList.remove('open'); popup?.classList.remove('open'); };

  btn?.addEventListener('click', async e => {
    e.preventDefault();
    e.stopPropagation();
    if (menu.classList.contains('open')) close(); else await open();
  });
  btn?.addEventListener('mouseenter', open);
  popup?.addEventListener('mouseenter', open);
  document.addEventListener('click', e => {
    if (!e.target.closest('.catalog-menu')) close();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

  // Подгружаем сразу, чтобы при первом открытии не было пустого окна.
  setTimeout(async () => {
    if (!menu.dataset.asCatalogLoaded) {
      menu.dataset.asCatalogLoaded = '1';
      await renderCatalogMenu();
    }
  }, 0);
}

/* ================= NOTIFICATIONS ================= */

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

function bindHeaderNotifications(){
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
  updateHeaderCounters();
  if ($('#notificationsDropdown')?.classList.contains('open')) renderDropdown();
  renderPage();
}

function bootHeader(){
  ensureHeaderReadyClass();
  normalizeHeaderButtons();
  bindProfileDropdown();
  bindHeaderNotifications();
  initCatalogMenu();
  updateHeaderCounters();
}

function start(user){
  currentUser = user || null;
  bootHeader();
  updateAuthHeader(currentUser);
  if (unsubscribe) unsubscribe();
  unsubscribe = watchNotifications(currentUser, applyState);
}

bootHeader();
onAuthStateChanged(auth, start);
start(auth.currentUser);
