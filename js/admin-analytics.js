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
function esc(value){
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
function productKey(value){ return String(value || '').trim(); }
function safeProductDocId(id){ return String(id || '').replace(/[^a-zA-Z0-9_-]/g, '_'); }
function buildProductMap(){
  const map = new Map();
  state.products.forEach(p => {
    [p.id, p.externalId, p.productId, p.uid, p.code, p.article].filter(Boolean).forEach(k => map.set(productKey(k), p));
  });
  return map;
}
function getProductLabel(product, fallback){
  return product?.title || product?.name || product?.productName || fallback || 'Товар';
}
function list(el, rows, max=8){
  const box=typeof el==='string'?$(el):el; if(!box) return;
  if(!rows.length){ box.innerHTML='<div class="analytics-empty">Пока нет данных</div>'; return; }
  const top=rows.slice(0,max); const m=Math.max(...top.map(r=>r.count),1);
  box.innerHTML=top.map(r=>`<div><div class="analytics-row"><b title="${esc(r.name)}">${esc(r.name)}</b><span>${fmt(r.count)}</span></div><div class="analytics-progress"><i style="width:${Math.max(4,Math.round(r.count/m*100))}%"></i></div></div>`).join('');
}
function renderViewedProducts(){
  const box = $('#analyticsProductsList');
  if (!box) return;

  const events = state.events.filter(e => e.type === 'product_view');
  const grouped = groupCount(events, e => e.productId || e.id || e.value || e.name || '');

  if (!grouped.length) {
    box.innerHTML = '<div class="analytics-empty">Пока нет данных</div>';
    return;
  }

  const productMap = buildProductMap();
  const maxCount = Math.max(...grouped.slice(0, 10).map(r => r.count), 1);

  box.innerHTML = grouped.slice(0, 10).map(row => {
    const id = productKey(row.name);
    const product = productMap.get(id) || productMap.get(safeProductDocId(id));
    const title = getProductLabel(product, id);
    const category = product?.category || product?.categoryName || product?.brand || product?.article || (product ? 'Товар на сайте' : 'Товар не найден / удалён');
    const image = product?.imageUrl || product?.image || product?.photo || product?.thumbnail || '';
    const docId = product?.id || safeProductDocId(id);
    const productUrl = `product.html?id=${encodeURIComponent(docId)}`;
    const width = Math.max(4, Math.round(row.count / maxCount * 100));

    return `
      <div style="display:grid;grid-template-columns:52px 1fr auto;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid #edf2f7">
        <div style="width:52px;height:52px;border-radius:14px;background:#f3f6fa;border:1px solid #e1e8f0;display:flex;align-items:center;justify-content:center;overflow:hidden">
          ${image ? `<img src="${esc(image)}" alt="" style="width:100%;height:100%;object-fit:contain;background:#fff">` : '<span style="font-size:11px;color:#8a97a8;font-weight:900">Фото</span>'}
        </div>
        <div style="min-width:0">
          <b title="${esc(title)}" style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#111827">${esc(title)}</b>
          <small style="display:block;color:#667085;font-weight:800;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(category)}</small>
          <a href="${esc(productUrl)}" target="_blank" style="display:inline-block;margin-top:5px;color:#13a70d;font-weight:900;text-decoration:none">Открыть товар</a>
        </div>
        <span style="font-weight:900;color:#07111f;background:#f1f5f9;border-radius:999px;padding:6px 11px">${fmt(row.count)}</span>
        <div style="grid-column:1 / -1;height:10px;background:#eef4f9;border-radius:999px;overflow:hidden"><i style="display:block;height:100%;width:${width}%;background:linear-gradient(90deg,#24e31a,#0d9488);border-radius:999px"></i></div>
      </div>
    `;
  }).join('');
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
  renderViewedProducts();
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
    safeGet(COLLECTIONS.products || 'autostyle_products', { limit:5000 }),
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
