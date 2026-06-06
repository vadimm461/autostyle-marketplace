
import { db, COLLECTIONS } from './firebase.js';
import {
  collection, getDocs, query, orderBy, limit
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const COLLECTION = COLLECTIONS.notifications || 'autostyle_notifications';
const LOCAL_KEY = 'autostyle_notifications_cache';
const READ_KEY = 'autostyle_notifications_read_at';

function $(s){ return document.querySelector(s); }
function $$(s){ return [...document.querySelectorAll(s)]; }
function stripHtml(html){
  const div = document.createElement('div');
  div.innerHTML = html || '';
  return div.textContent || div.innerText || '';
}
function esc(v){
  return String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#039;");
}
function fmt(v){
  try{
    const d = v?.toDate ? v.toDate() : new Date(v || Date.now());
    return d.toLocaleString('ru-RU');
  }catch(e){ return ''; }
}
function createdMs(n){
  try{
    const d = n.createdAt?.toDate ? n.createdAt.toDate() : new Date(n.createdAt || 0);
    return d.getTime();
  }catch(e){ return 0; }
}
function localList(){
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]') || []; } catch(e){ return []; }
}
function saveLocal(list){
  localStorage.setItem(LOCAL_KEY, JSON.stringify(list.slice(0, 80)));
}
async function loadNotifications(){
  let list = [];
  try{
    const snap = await getDocs(query(collection(db, COLLECTION), orderBy('createdAt','desc'), limit(50)));
    list = snap.docs.map(d => ({ id:d.id, ...d.data() }));
    saveLocal(list.map(n => ({...n, createdAt: n.createdAt?.toDate ? n.createdAt.toDate().toISOString() : n.createdAt})));
  }catch(e){
    list = localList();
  }
  if (!list.length) {
    list = [{
      id:'welcome',
      title:'AutoStyle',
      html:'<p>Здесь будут уведомления магазина: акции, новости и статусы заказов.</p>',
      text:'Здесь будут уведомления магазина: акции, новости и статусы заказов.',
      createdAt:new Date().toISOString()
    }];
  }
  return list;
}
function unreadCount(list){
  const readAt = Number(localStorage.getItem(READ_KEY) || 0);
  return list.filter(n => createdMs(n) > readAt).length;
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
async function renderDropdown(){
  const list = await loadNotifications();
  const dd = ensureDropdown();
  dd.innerHTML = `<h3>Уведомления</h3>` + (list.length ? list.slice(0,8).map((n, i) => `
    <button class="as-notify-preview" type="button" data-notify-id="${esc(n.id || i)}">
      <div class="as-notify-preview-title">${esc(n.title || 'Уведомление')}</div>
      <div class="as-notify-preview-text">${esc(n.text || stripHtml(n.html) || '')}</div>
      <div class="as-notify-preview-date">${esc(fmt(n.createdAt))}</div>
    </button>
  `).join('') : `<div class="as-notify-empty">Пока уведомлений нет.</div>`);
  dd.insertAdjacentHTML('beforeend', `<a class="as-notify-preview" href="notifications.html"><b>Открыть все уведомления</b></a>`);
  dd.querySelectorAll('[data-notify-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      localStorage.setItem('autostyle_selected_notification', btn.dataset.notifyId);
      location.href = `notifications.html?id=${encodeURIComponent(btn.dataset.notifyId)}`;
    });
  });
  localStorage.setItem(READ_KEY, String(Date.now()));
  updateCount(list);
  return dd;
}
function updateCount(list){
  const count = unreadCount(list || localList());
  $$('#notificationCount').forEach(el => {
    el.dataset.count = String(count);
    el.textContent = count ? String(count) : '';
  });
}
function bindHeader(){
  const btn = $('#notificationsBtn');
  if (!btn || btn.dataset.bound === '1') return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', async e => {
    e.preventDefault();
    e.stopPropagation();
    const dd = await renderDropdown();
    dd.classList.toggle('open');
  });
  document.addEventListener('click', e => {
    const dd = $('#notificationsDropdown');
    if (!dd) return;
    if (e.target.closest('#notificationsBtn') || e.target.closest('#notificationsDropdown')) return;
    dd.classList.remove('open');
  });
}
async function renderPage(){
  const root = $('#notificationsPage');
  if (!root) return;
  const list = await loadNotifications();
  const params = new URLSearchParams(location.search);
  const id = params.get('id') || localStorage.getItem('autostyle_selected_notification');
  function showList(){
    root.innerHTML = `
      <div class="as-notify-page-head">
        <h1>Уведомления</h1>
      </div>
      <div class="as-notify-list">
        ${list.map((n, i) => `
          <article class="as-notify-full-card" data-open-notification="${esc(n.id || i)}">
            <h3>${esc(n.title || 'Уведомление')}</h3>
            <p>${esc(n.text || stripHtml(n.html) || '')}</p>
            <div class="as-notify-preview-date">${esc(fmt(n.createdAt))}</div>
          </article>
        `).join('')}
      </div>
    `;
    root.querySelectorAll('[data-open-notification]').forEach(card => {
      card.addEventListener('click', () => showDetail(card.dataset.openNotification));
    });
  }
  function showDetail(openId){
    const n = list.find((x, i) => String(x.id || i) === String(openId)) || list[0];
    root.innerHTML = `
      <button type="button" class="as-notify-back">← Все уведомления</button>
      <h1 class="as-notify-detail-title">${esc(n.title || 'Уведомление')}</h1>
      <div class="as-notify-detail-date">${esc(fmt(n.createdAt))}</div>
      <div class="as-notify-detail-body">${n.html || `<p>${esc(n.text || '')}</p>`}</div>
    `;
    root.querySelector('.as-notify-back').addEventListener('click', showList);
  }
  if (id) showDetail(id); else showList();
}
async function init(){
  bindHeader();
  const list = await loadNotifications();
  updateCount(list);
  renderPage();
}
init();
