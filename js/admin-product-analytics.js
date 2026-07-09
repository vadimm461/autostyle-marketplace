import { db, COLLECTIONS } from './firebase.js';
import {
  collection, getDocs, query, orderBy, limit
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const $ = (s, r=document) => r.querySelector(s);
const fmt = n => new Intl.NumberFormat('ru-RU').format(Number(n || 0));
const money = n => `${fmt(Math.round(Number(n || 0)))} ₽`;
const dayMs = 86400000;
const state = { products: [], orders: [], changes: [], runs: [], selectedDays: 30 };

function nowFrom(){ return Date.now() - state.selectedDays * dayMs; }
function getTime(row){
  const v = row.createdAt || row.date || row.timestamp || row.createdAtText || row.createdAtTs || row.time;
  if (v?.toDate) return v.toDate().getTime();
  if (typeof v === 'number') return v;
  const t = Date.parse(v || '');
  return Number.isFinite(t) ? t : 0;
}
function productTitle(p){ return String(p.title || p.name || p.productName || p.description || p.id || 'Товар').trim(); }
function productCode(p){ return String(p.code || p.article || p.sku || p.vendorCode || p.barcode || p.id || '').trim(); }
function productBrand(p){ return String(p.brand || p.brandName || p.manufacturer || p.vendor || '').trim() || 'Без бренда'; }
function productGroup(p){ return String(p.group || p.category || p.categoryName || p.parentName || '').trim() || 'Без группы'; }
function productPrice(p){ return Number(p.price || p.salePrice || p.retailPrice || p.cost || 0); }
function productStock(p){ return Number(p.stock ?? p.qty ?? p.quantity ?? p.count ?? p.balance ?? p.amount ?? p.rest ?? 0); }
function productKey(p){ return String(p.id || p.productId || productCode(p) || productTitle(p)).trim(); }
function normProduct(p){ return { id: productKey(p), title: productTitle(p), code: productCode(p), brand: productBrand(p), group: productGroup(p), price: productPrice(p), stock: productStock(p), image: p.image || p.imageUrl || p.photo || '', rawId: p.id || '' }; }
function setStatus(text, bad=false){ const el=$('#productAnalyticsStatus'); if(el){ el.textContent=text||''; el.className = bad ? 'pa-status pa-status-bad' : 'pa-status'; } }
async function getCol(name, max=8000, sorted=false){
  try {
    const q = sorted ? query(collection(db, name), orderBy('createdAtTs','desc'), limit(max)) : query(collection(db, name), limit(max));
    const snap = await getDocs(q);
    return snap.docs.map(d=>({id:d.id, ...d.data()}));
  } catch(e){ console.warn('product analytics read skipped', name, e); return []; }
}
function orderItems(order){ return Array.isArray(order.items) ? order.items : Array.isArray(order.products) ? order.products : []; }
function itemId(i){ return String(i.productId || i.id || i.product_id || i.code || i.sku || i.title || i.name || '').trim(); }
function itemTitle(i){ return String(i.title || i.name || i.productName || itemId(i) || 'Товар').trim(); }
function itemQty(i){ return Number(i.qty || i.quantity || i.count || 1) || 1; }
function itemPrice(i){ return Number(i.price || i.linePrice || i.sum || i.lineTotal || 0) || 0; }
function orderStatus(o){ return String(o.status || o.orderStatus || o.state || '').toLowerCase().trim(); }
function isDoneOrder(o){
  const s = orderStatus(o);
  return ['done','complete','completed','fulfilled','issued','выдан','выдано','выполнен','выполнено','завершен','завершён','доставлен'].some(x => s.includes(x));
}
function isIgnoredOrder(o){ return !isDoneOrder(o); }
function filteredOrders(){ const from = nowFrom(); return state.orders.filter(o => (getTime(o) || 0) >= from); }
function completedOrders(){ return filteredOrders().filter(isDoneOrder); }
function salesMapFromSite(){
  const map = new Map();
  completedOrders().forEach(o => orderItems(o).forEach(i => {
    const id = itemId(i); if(!id) return;
    const qty = itemQty(i); const revenue = Number(i.lineTotal || i.total || 0) || itemPrice(i) * qty;
    const prev = map.get(id) || { id, title:itemTitle(i), qty:0, revenue:0, orders:0 };
    prev.qty += qty; prev.revenue += revenue; prev.orders += 1; if(!prev.title || prev.title === id) prev.title = itemTitle(i);
    map.set(id, prev);
  }));
  return map;
}
function oneCSalesMap(){
  const from = nowFrom();
  const map = new Map();
  state.changes.filter(c => (getTime(c) || 0) >= from).forEach(c => {
    const oldStock = Number(c.oldStock ?? c.beforeStock ?? c.prevStock ?? 0);
    const newStock = Number(c.newStock ?? c.afterStock ?? c.stock ?? 0);
    let qty = Number(c.sold1c ?? c.soldQty ?? c.decreasedBy ?? 0);
    if(!qty && oldStock > newStock) qty = oldStock - newStock;
    if(qty <= 0) return;
    const id = String(c.productId || c.id || c.code || c.sku || c.title || '').trim(); if(!id) return;
    const price = Number(c.price || c.newPrice || c.oldPrice || 0);
    const prev = map.get(id) || { id, title: c.title || c.name || id, qty:0, revenue:0, changes:0 };
    prev.qty += qty; prev.revenue += qty * price; prev.changes += 1;
    map.set(id, prev);
  });
  return map;
}
function renderKpis(){
  const products = state.products.map(normProduct);
  const site = salesMapFromSite();
  const onec = oneCSalesMap();
  const siteSoldQty = [...site.values()].reduce((s,x)=>s+x.qty,0);
  const siteRevenue = [...site.values()].reduce((s,x)=>s+x.revenue,0);
  const oneCSoldQty = [...onec.values()].reduce((s,x)=>s+x.qty,0);
  const oneCRevenue = [...onec.values()].reduce((s,x)=>s+x.revenue,0);
  const low = products.filter(p=>p.stock > 0 && p.stock <= 3).length;
  const zero = products.filter(p=>p.stock <= 0).length;
  const stockValue = products.reduce((s,p)=>s + p.price * Math.max(0,p.stock), 0);
  const data = { products: products.length, stockValue: money(stockValue), siteSoldQty: fmt(siteSoldQty), siteRevenue: money(siteRevenue), oneCSoldQty: fmt(oneCSoldQty), oneCRevenue: money(oneCRevenue), completedOrders: fmt(completedOrders().length), ignoredOrders: fmt(filteredOrders().filter(isIgnoredOrder).length), low: fmt(low), zero: fmt(zero), needOrder: fmt(recommendations().length) };
  Object.entries(data).forEach(([k,v]) => { const el = $(`[data-pa-kpi="${k}"]`); if(el) el.textContent = v; });
}
function rowProgress(value, max){ return `<i style="width:${Math.max(3, Math.round(Number(value||0)/Math.max(1,max)*100))}%"></i>`; }
function renderSalesBox(boxId, rows, empty){
  const box = $(boxId); if(!box) return;
  rows = [...rows.values()].sort((a,b)=>b.qty-a.qty).slice(0,30);
  if(!rows.length){ box.innerHTML = `<div class="pa-empty">${empty}</div>`; return; }
  const products = new Map(state.products.map(p=>[productKey(p), normProduct(p)]));
  const max = Math.max(...rows.map(r=>r.qty), 1);
  box.innerHTML = rows.map((r,i)=>{ const p=products.get(r.id)||{}; return `<div class="pa-table-row"><b>${i+1}. ${escapeHtml(r.title)}</b><span>${fmt(r.qty)} шт</span><span>${money(r.revenue)}</span><span>${fmt(p.stock || 0)} ост.</span><em>${rowProgress(r.qty,max)}</em></div>`; }).join('');
}
function renderTopSales(){ renderSalesBox('#paTopSales', salesMapFromSite(), 'Выполненных продаж сайта за выбранный период пока нет.'); }
function renderOneCSales(){ renderSalesBox('#paOneCSales', oneCSalesMap(), 'Данных по уходу товара через 1С пока нет. Они появятся после автоматического анализа выгрузки sync.js.'); }
function combinedSales(){
  const m = new Map();
  [salesMapFromSite(), oneCSalesMap()].forEach(src => src.forEach(s => {
    const p = m.get(s.id) || { id:s.id, title:s.title, qty:0, revenue:0 };
    p.qty += s.qty; p.revenue += s.revenue; m.set(s.id,p);
  }));
  return m;
}
function recommendations(){
  const products = new Map(state.products.map(p=>[productKey(p), normProduct(p)]));
  const rows = [];
  combinedSales().forEach(s => {
    const p = products.get(s.id) || { id:s.id, title:s.title, stock:0, price:0 };
    const avgDay = s.qty / Math.max(1, state.selectedDays);
    const target = Math.ceil(avgDay * 30 * 1.25);
    const need = Math.max(0, target - Number(p.stock || 0));
    const daysLeft = avgDay > 0 ? Math.floor(Number(p.stock || 0) / avgDay) : 999;
    if (need > 0 || p.stock <= 3) rows.push({ ...p, sold:s.qty, revenue:s.revenue, avgDay, daysLeft, need: Math.max(need, p.stock <= 0 ? Math.ceil(s.qty || 1) : 0), reason: p.stock <= 0 ? 'товар закончился' : daysLeft <= 7 ? 'хватит меньше недели' : 'продажи сайта + 1С' });
  });
  return rows.sort((a,b)=>b.need-a.need).slice(0,50);
}
function renderRecommendations(){
  const box = $('#paRecommendations'); if(!box) return;
  const rows = recommendations();
  if(!rows.length){ box.innerHTML = '<div class="pa-empty">Рекомендаций пока нет. Продаж мало или остатков достаточно.</div>'; return; }
  box.innerHTML = rows.map(r=>`<article class="pa-rec"><div><b>${escapeHtml(r.title)}</b><small>${escapeHtml(r.brand)} • ${escapeHtml(r.group)} • ${escapeHtml(r.code)}</small><p>Всего ушло: <b>${fmt(r.sold)}</b> шт · Остаток: <b>${fmt(r.stock)}</b> · В среднем: <b>${r.avgDay.toFixed(1)}</b> шт/день</p></div><strong>Заказать ${fmt(r.need)} шт</strong><em>${escapeHtml(r.reason)}</em></article>`).join('');
}
function renderChanges(){
  const box = $('#paChanges'); if(!box) return;
  const latest = state.runs[0];
  $('#paLastSnapshot').textContent = latest ? `Последняя автоматическая выгрузка: ${latest.createdAtText || new Date(latest.createdAtTs || Date.now()).toLocaleString('ru-RU')} · товаров: ${fmt(latest.count || 0)} · изменений: ${fmt(latest.changesCount || 0)}` : 'Автоматических снимков пока нет. Они создаются sync.js после выгрузки 1С.';
  const rows = state.changes.slice(0,160);
  if(!rows.length){ box.innerHTML = '<div class="pa-empty">Изменений после выгрузок пока нет.</div>'; return; }
  box.innerHTML = rows.map(c=>{
    const type = c.type === 'removed' ? '❌ Пропал' : c.type === 'added' ? '➕ Новый' : c.type === 'stock_down' ? '⬇ Остаток уменьшился' : c.type === 'stock_up' ? '⬆ Остаток увеличился' : c.type === 'price' ? '💰 Цена' : '🔄 Изменён';
    const meta = c.note || [c.oldStock != null || c.newStock != null ? `остаток ${fmt(c.oldStock)} → ${fmt(c.newStock)}` : '', c.oldPrice != null || c.newPrice != null ? `цена ${money(c.oldPrice)} → ${money(c.newPrice)}` : ''].filter(Boolean).join(' • ');
    return `<div class="pa-change"><span>${type}</span><b>${escapeHtml(c.title || c.productId || 'Товар')}</b><small>${escapeHtml(meta)}</small></div>`;
  }).join('');
}
function renderSlowProducts(){
  const box = $('#paSlowProducts'); if(!box) return;
  const sold = combinedSales();
  const rows = state.products.map(normProduct).filter(p=>p.stock>0 && !sold.has(p.id)).slice(0,50);
  if(!rows.length){ box.innerHTML = '<div class="pa-empty">Нет зависших товаров за выбранный период.</div>'; return; }
  box.innerHTML = rows.map(p=>`<div class="pa-slow"><b>${escapeHtml(p.title)}</b><span>${fmt(p.stock)} шт</span><small>${escapeHtml(p.brand)} • ${money(p.price)}</small></div>`).join('');
}
function renderBrands(){
  const box = $('#paBrands'); if(!box) return;
  const sm = combinedSales(); const products = new Map(state.products.map(p=>[productKey(p), normProduct(p)])); const m = new Map();
  sm.forEach(s=>{ const p=products.get(s.id)||{}; const key=p.brand||'Без бренда'; const v=m.get(key)||{name:key, qty:0, revenue:0}; v.qty+=s.qty; v.revenue+=s.revenue; m.set(key,v); });
  const rows=[...m.values()].sort((a,b)=>b.qty-a.qty).slice(0,12); const max=Math.max(...rows.map(r=>r.qty),1);
  box.innerHTML = rows.length ? rows.map(r=>`<div><div class="pa-line"><b>${escapeHtml(r.name)}</b><span>${fmt(r.qty)} шт · ${money(r.revenue)}</span></div><div class="pa-progress">${rowProgress(r.qty,max)}</div></div>`).join('') : '<div class="pa-empty">Данных по брендам пока нет.</div>';
}
function renderAll(){ renderKpis(); renderTopSales(); renderOneCSales(); renderRecommendations(); renderSlowProducts(); renderBrands(); renderChanges(); }
function escapeHtml(s){ return String(s||'').replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch])); }
export async function loadProductAnalytics(force=false){
  const sec = $('#productAnalytics'); if(!sec) return;
  if(!force && sec.dataset.loaded === '1') return;
  sec.dataset.loaded = '1';
  setStatus('Загружаю товарную аналитику...');
  const [products, orders, changes, runs] = await Promise.all([
    getCol(COLLECTIONS.products || 'autostyle_products', 10000),
    getCol(COLLECTIONS.orders || 'autostyle_orders', 8000),
    getCol('autostyle_product_changes', 2000, true),
    getCol('autostyle_product_sync_runs', 20, true)
  ]);
  Object.assign(state, { products, orders, changes, runs });
  renderAll();
  setStatus(`Обновлено: ${new Date().toLocaleString('ru-RU')}`);
}
function init(){
  const period = $('#paPeriod'); if(period) period.addEventListener('change', e=>{ state.selectedDays=Number(e.target.value||30); renderAll(); });
  const refresh = $('#paRefresh'); if(refresh) refresh.addEventListener('click', ()=>loadProductAnalytics(true));
  document.addEventListener('click', e=>{ const a=e.target.closest('[data-section="productAnalytics"],a[href="#productAnalytics"]'); if(a) setTimeout(()=>loadProductAnalytics(),80); });
  window.addEventListener('hashchange', ()=>{ if(location.hash==='#productAnalytics') setTimeout(()=>loadProductAnalytics(),80); });
  if(location.hash==='#productAnalytics' || $('#productAnalytics.active')) loadProductAnalytics();
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init, { once:true }); else init();
