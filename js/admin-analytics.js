import { db, COLLECTIONS } from './firebase.js';
import { collection, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const DAILY = 'autostyle_analytics_daily';
const USERS = COLLECTIONS.users || 'autostyle_users';
const DISCOUNT = COLLECTIONS.discountCards || 'autostyle_discount_cards';
const ORDERS = COLLECTIONS.orders || 'autostyle_orders';
const FEEDBACK = COLLECTIONS.feedback || 'autostyle_feedback';
const $ = s => document.querySelector(s);

function num(v){ return Number(v || 0) || 0; }
function esc(s){ return String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function fmt(n){ return new Intl.NumberFormat('ru-RU').format(num(n)); }
function lastDays(days){
  const out = [];
  const now = new Date();
  for(let i=days-1;i>=0;i--){ const d = new Date(now); d.setDate(now.getDate()-i); out.push(d.toISOString().slice(0,10)); }
  return out;
}
async function countCollection(name){ try { const s = await getDocs(collection(db, name)); return s.size; } catch(e){ console.warn('analytics count error', name, e); return 0; } }
async function loadDaily(){
  const snap = await getDocs(collection(db, DAILY));
  return snap.docs.map(d => ({ id:d.id, ...(d.data() || {}) })).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
}
function drawBars(el, rows, key, label){
  if(!el) return;
  const max = Math.max(1, ...rows.map(r => num(r[key])));
  el.innerHTML = `<div class="as-chart-bars">${rows.map(r => {
    const h = Math.max(5, Math.round(num(r[key]) / max * 100));
    const day = String(r.date || r.id || '').slice(5).replace('-', '.');
    return `<div class="as-chart-bar" title="${esc(day)}: ${fmt(r[key])}"><span style="height:${h}%"></span><small>${esc(day)}</small></div>`;
  }).join('')}</div><div class="as-chart-label">${esc(label)}</div>`;
}
function drawHorizontal(el, map, emptyText){
  if(!el) return;
  const rows = Object.entries(map || {}).map(([name,value]) => ({ name, value:num(value) })).sort((a,b)=>b.value-a.value).slice(0,12);
  if(!rows.length){ el.innerHTML = `<div class="as-analytics-empty">${esc(emptyText || 'Данных пока нет')}</div>`; return; }
  const max = Math.max(1, ...rows.map(r => r.value));
  el.innerHTML = rows.map(r => `<div class="as-hbar"><b>${esc(pageTitle(r.name))}</b><span><i style="width:${Math.max(4, Math.round(r.value/max*100))}%"></i></span><em>${fmt(r.value)}</em></div>`).join('');
}
function pageTitle(key){
  const names = {home:'Главная', 'mobile-home':'Мобильная главная', catalog:'Каталог', product:'Карточка товара', cart:'Корзина', favorites:'Избранное', profile:'Профиль', 'profile-data':'Данные профиля', orders:'Заказы', notifications:'Уведомления', feedback:'Предложения/жалобы', contacts:'Контакты', about:'Про нас', installment:'Рассрочка', certificates:'Сертификаты', 'discount-card':'Скидочная карта'};
  return names[key] || key;
}
function eventTitle(key){
  const names = {page_view:'Просмотры страниц', registration:'Регистрации', login:'Входы', profile_saved:'Сохранения профиля', profile_completed:'Заполненные профили', discount_card_activated:'Активации карты', order_created:'Создание заказов', feedback_sent:'Предложения/жалобы', add_to_cart:'Добавления в корзину', product_view:'Просмотры товара'};
  return names[key] || key;
}
function sum(rows, key){ return rows.reduce((a,r)=>a+num(r[key]),0); }
function sumMap(rows, key){
  const out = {};
  rows.forEach(r => Object.entries(r[key] || {}).forEach(([k,v]) => out[k] = num(out[k]) + num(v)));
  return out;
}
function setMetric(id, value, sub=''){
  const el = $(id); if(!el) return;
  el.innerHTML = `<strong>${fmt(value)}</strong>${sub ? `<span>${esc(sub)}</span>` : ''}`;
}
async function renderAdminAnalytics(){
  const root = $('#analyticsRoot'); if(!root) return;
  root.classList.add('loading');
  root.querySelector('[data-analytics-status]').textContent = 'Загружаю данные...';
  try{
    const [daily, usersTotal, discountTotal, ordersTotal, feedbackTotal] = await Promise.all([
      loadDaily(), countCollection(USERS), countCollection(DISCOUNT), countCollection(ORDERS), countCollection(FEEDBACK)
    ]);
    const days = lastDays(30);
    const byDate = new Map(daily.map(r => [r.id || r.date, r]));
    const rows30 = days.map(d => ({ id:d, date:d, ...(byDate.get(d) || {}) }));
    const rows7 = rows30.slice(-7);
    setMetric('#analyticsVisits', sum(rows30, 'visits'), 'посещений за 30 дней');
    setMetric('#analyticsUsers', usersTotal, 'всего аккаунтов');
    setMetric('#analyticsProfiles', sum(rows30, 'profileActivations'), 'активаций/заполнений профиля');
    setMetric('#analyticsCards', discountTotal || sum(rows30, 'discountCardActivations'), 'активных скидочных карт');
    setMetric('#analyticsOrders', ordersTotal, 'заказов в базе');
    setMetric('#analyticsFeedback', feedbackTotal, 'писем от клиентов');
    drawBars($('#analyticsVisitsChart'), rows30, 'visits', 'Посещения по дням за последние 30 дней');
    drawBars($('#analyticsRegistrationsChart'), rows30, 'registrations', 'Регистрации по дням за последние 30 дней');
    drawBars($('#analyticsCardsChart'), rows30, 'discountCardActivations', 'Активации скидочных карт по дням');
    drawHorizontal($('#analyticsPagesChart'), sumMap(rows30, 'pages'), 'Посещения страниц появятся после открытия сайта клиентами.');
    drawHorizontal($('#analyticsEventsChart'), sumMap(rows30, 'events'), 'События появятся после действий пользователей.');
    const tbody = $('#analyticsTableBody');
    if(tbody) tbody.innerHTML = rows7.reverse().map(r => `<tr><td>${esc(r.date)}</td><td>${fmt(r.visits)}</td><td>${fmt(r.registrations)}</td><td>${fmt(r.profileActivations)}</td><td>${fmt(r.discountCardActivations)}</td><td>${fmt(r.ordersCreated)}</td></tr>`).join('');
    root.querySelector('[data-analytics-status]').textContent = 'Готово. Данные обновляются при действиях пользователей.';
  } catch(err){
    console.error('admin analytics error', err);
    root.querySelector('[data-analytics-status]').textContent = 'Не удалось загрузить аналитику: ' + (err.message || err);
  } finally { root.classList.remove('loading'); }
}

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.querySelector('[data-section="analytics"]');
  btn?.addEventListener('click', () => setTimeout(renderAdminAnalytics, 50));
  document.querySelector('[data-refresh-analytics]')?.addEventListener('click', renderAdminAnalytics);
  if(location.hash.replace('#','') === 'analytics') setTimeout(renderAdminAnalytics, 300);
});

window.renderAdminAnalytics = renderAdminAnalytics;
window.addEventListener('autostyle:admin-section-open', e => { if(e.detail?.section === 'analytics') renderAdminAnalytics(); });
