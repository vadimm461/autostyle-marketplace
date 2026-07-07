import { db, COLLECTIONS } from './firebase.js';
import { collection, getDocs, query, orderBy, limit, where, Timestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const $ = s => document.querySelector(s);
const state = { views: [], events: [], users: [], orders: [], cards: [], feedback: [], products: [], online: [] };
const dayMs = 86400000;

function text(el, value){ if(el) el.textContent = value; }
function fmt(n){ return new Intl.NumberFormat('ru-RU').format(Number(n || 0)); }
function dateKey(d){ const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`; }
function ts(row){
  const v = row.createdAt || row.lastSeen || row.date || row.timestamp;
  if (v && typeof v.toDate === 'function') return v.toDate().getTime();
  if (typeof v === 'number') return v;
  if (typeof row.ts === 'number') return row.ts;
  return 0;
}
function isProfileActive(u){ return !!(u.profileActivated || u.profileActive || u.profileCompleted || u.isProfileActivated || u.name && (u.phone || u.email)); }
function isCardActive(c){ return c.status === 'active' || c.active === true || c.activated === true || c.isActive === true || !!c.activatedAt; }
function device(row){ return row.deviceType || (/android|iphone|ipad|mobile/i.test(row.userAgent||'') ? 'mobile' : 'desktop'); }
function groupCount(rows, getKey){ const m = new Map(); rows.forEach(r => { const k = getKey(r) || '—'; m.set(k, (m.get(k)||0)+1); }); return [...m.entries()].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count); }
async function safeGet(col, opts={}){
  try {
    let ref = collection(db, col);
    let q = ref;
    if (opts.order) q = query(ref, orderBy(opts.order, 'desc'), limit(opts.limit || 500));
    else if (opts.limit) q = query(ref, limit(opts.limit));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id:d.id, ...d.data() }));
  } catch(e) { console.warn('analytics read failed', col, e); return []; }
}
async function getOnline(){
  try {
    const from = Date.now() - 2 * 60 * 1000;
    const snap = await getDocs(query(collection(db, 'autostyle_online_sessions'), where('lastSeenTs', '>=', from), limit(500)));
    return snap.docs.map(d => ({ id:d.id, ...d.data() }));
  } catch(e) { console.warn('online read failed', e); return []; }
}
function setStatus(msg, err=false){ const el=$('#analyticsStatus'); if(el){ el.textContent=msg||''; el.className=err?'analytics-status analytics-error':'analytics-status'; } }
function renderKpis(){
  const visitors = new Set(state.views.map(v=>v.visitorId).filter(Boolean)).size || state.views.length;
  const regs = state.users.length;
  const profiles = state.users.filter(isProfileActive).length;
  const cards = state.cards.filter(isCardActive).length || state.cards.length;
  const cartAdds = state.events.filter(e=>e.type==='add_to_cart').length;
  const favAdds = state.events.filter(e=>e.type==='favorite_add').length;
  const orders = state.orders.length;
  const avgSec = Math.round((state.events.filter(e=>e.type==='time_on_page').reduce((s,e)=>s+Number(e.value || e.meta?.seconds || 0),0) || 0) / Math.max(1, state.events.filter(e=>e.type==='time_on_page').length));
  const conversion = visitors ? Math.round((orders / visitors) * 1000) / 10 : 0;
  const data = { visits: state.views.length, visitors, users: regs, profiles, cards, cartAdds, favAdds, orders, online: state.online.length, avgTime: avgSec ? `${avgSec} сек` : '0 сек', conversion: `${conversion}%` };
  Object.entries(data).forEach(([k,v])=>text(document.querySelector(`[data-analytics-kpi="${k}"]`), fmt(v).replace(/NaN/g,'0')));
}
function bars(el, rows, labelKey='name', valueKey='count'){
  const box = typeof el==='string'?$(el):el; if(!box) return;
  if(!rows.length){ box.innerHTML='<div class="analytics-empty">Пока нет данных</div>'; return; }
  const max = Math.max(...rows.map(r=>Number(r[valueKey]||0)),1);
  box.innerHTML = rows.map(r=>`<div class="analytics-bar" title="${r[labelKey]}: ${r[valueKey]}"><i style="height:${Math.max(4,Math.round(Number(r[valueKey]||0)/max*200))}px"></i><span>${r[labelKey]}</span></div>`).join('');
}
function list(el, rows, max=8){
  const box=typeof el==='string'?$(el):el; if(!box) return;
  if(!rows.length){ box.innerHTML='<div class="analytics-empty">Пока нет данных</div>'; return; }
  const top=rows.slice(0,max); const m=Math.max(...top.map(r=>r.count),1);
  box.innerHTML=top.map(r=>`<div><div class="analytics-row"><b title="${r.name}">${r.name}</b><span>${fmt(r.count)}</span></div><div class="analytics-progress"><i style="width:${Math.max(4,Math.round(r.count/m*100))}%"></i></div></div>`).join('');
}
function render(){
  renderKpis();
  const last14 = []; for(let i=13;i>=0;i--){ const d=new Date(Date.now()-i*dayMs); const key=dateKey(d); last14.push({name:key.slice(5), count:state.views.filter(v=>(v.day || dateKey(ts(v)||Date.now()))===key).length}); }
  bars('#analyticsVisitsChart', last14);
  const hours = Array.from({length:24},(_,h)=>({name:String(h).padStart(2,'0'), count:state.views.filter(v=>Number(v.hour)===h).length}));
  bars('#analyticsHoursChart', hours);
  list('#analyticsPagesList', groupCount(state.views, r => r.page || r.path || 'Главная'), 10);
  list('#analyticsSourcesList', groupCount(state.views, r => r.referrerHost || 'direct'), 8);
  list('#analyticsSearchesList', groupCount(state.events.filter(e=>e.type==='search'), r => (r.value || r.name || '').toString().trim()).filter(x=>x.name && x.name!=='search'), 10);
  list('#analyticsProductsList', groupCount(state.events.filter(e=>e.type==='product_view'), r => r.productName || r.productId || 'Товар'), 10);
  list('#analyticsDevicesList', groupCount(state.views, device), 4);
  const visitors = new Set(state.views.map(v=>v.visitorId).filter(Boolean)).size || state.views.length;
  const conv = [{name:'Посетители',count:visitors},{name:'Регистрации',count:state.users.length},{name:'Заказы',count:state.orders.length}];
  bars('#analyticsConversionChart', conv);
}
export async function loadAdminAnalytics(){
  setStatus('Загружаю аналитику...');
  const since = Date.now() - 90 * dayMs;
  const [views, events, users, orders, cards, feedback, products, online] = await Promise.all([
    safeGet('autostyle_page_views', { order:'ts', limit:1500 }),
    safeGet('autostyle_events', { order:'ts', limit:2000 }),
    safeGet(COLLECTIONS.users || 'autostyle_users', { limit:2000 }),
    safeGet(COLLECTIONS.orders || 'autostyle_orders', { limit:1500 }),
    safeGet(COLLECTIONS.discountCards || 'autostyle_discount_cards', { limit:1500 }),
    safeGet(COLLECTIONS.feedback || 'autostyle_feedback', { limit:1000 }),
    safeGet(COLLECTIONS.products || 'autostyle_products', { limit:2000 }),
    getOnline()
  ]);
  Object.assign(state, { views, events, users, orders, cards, feedback, products, online });
  render();
  setStatus(`Обновлено: ${new Date().toLocaleString('ru-RU')}`);
}

document.addEventListener('DOMContentLoaded', () => {
  const btn = $('#refreshAnalytics');
  if (btn) btn.addEventListener('click', loadAdminAnalytics);
  if (location.hash === '#analytics' || document.querySelector('#analytics.active')) loadAdminAnalytics();
});
window.addEventListener('hashchange', () => { if(location.hash==='#analytics') loadAdminAnalytics(); });
setInterval(() => { if(location.hash==='#analytics') loadAdminAnalytics(); }, 60000);
