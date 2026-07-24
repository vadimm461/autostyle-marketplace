import { db, COLLECTIONS } from './firebase.js';
import {
  collection, getDocs, query, orderBy, limit
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const $ = (s, r=document) => r.querySelector(s);
const fmt = n => new Intl.NumberFormat('ru-RU').format(Number(n || 0));
const money = n => `${fmt(Math.round(Number(n || 0)))} ₽`;
const dayMs = 86400000;
function toNum(v){
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const cleaned = String(v)
    .replace(/\s+/g, '')
    .replace(',', '.')
    .replace(/[^0-9.-]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}
const state = { products: [], orders: [], changes: [], runs: [], selectedDays: 30 };

function nowFrom(){ return Date.now() - state.selectedDays * dayMs; }
function timeValue(v){
  if (!v) return 0;

  if (typeof v.toDate === 'function') {
    const d = v.toDate();
    return d && typeof d.getTime === 'function' ? d.getTime() : 0;
  }

  if (typeof v === 'object') {
    const seconds = toNum(v.seconds != null ? v.seconds : v._seconds);
    const nanos = toNum(v.nanoseconds != null ? v.nanoseconds : v._nanoseconds);
    if (seconds > 0) return seconds * 1000 + Math.floor(nanos / 1000000);
  }

  if (typeof v === 'number') {
    return v > 0 && v < 100000000000 ? v * 1000 : v;
  }

  const parsed = Date.parse(String(v));
  return Number.isFinite(parsed) ? parsed : 0;
}

function getTime(row){
  const candidates = [
    row.createdAt,
    row.createdAtText,
    row.createdAtTs,
    row.createdAtMs,
    row.orderDate,
    row.orderedAt,
    row.date,
    row.timestamp,
    row.updatedAt,
    row.updatedAtTs,
    row.time
  ];

  for (let i = 0; i < candidates.length; i++) {
    const value = timeValue(candidates[i]);
    if (value > 0) return value;
  }

  return 0;
}
function productTitle(p){ return String(p.title || p.name || p.productName || p.description || p.id || 'Товар').trim(); }
function productCode(p){ return String(p.code || p.article || p.sku || p.vendorCode || p.barcode || p.id || '').trim(); }
function productBrand(p){ return String(p.brand || p.brandName || p.manufacturer || p.vendor || '').trim() || 'Без бренда'; }
function productGroup(p){ return String(p.group || p.category || p.categoryName || p.parentName || '').trim() || 'Без группы'; }
function productPrice(p){ return toNum(p.price ?? p.salePrice ?? p.retailPrice ?? p.retail ?? p.cost ?? 0); }
function productStock(p){
  // В 1С/Firestore остаток в разных версиях мог лежать в stock или quantity.
  // Для склада берём только фактический положительный остаток, нулевые товары не считают стоимость.
  const values = [p.stock, p.quantity, p.qty, p.count, p.balance, p.amount, p.rest, p.remainder, p.quantityInStock]
    .map(toNum)
    .filter(n => n > 0);
  return values.length ? Math.max(...values) : 0;
}
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
function orderItems(order){
  return Array.isArray(order.items) ? order.items :
    Array.isArray(order.products) ? order.products :
    Array.isArray(order.cart) ? order.cart :
    Array.isArray(order.cartItems) ? order.cartItems :
    Array.isArray(order.orderItems) ? order.orderItems :
    Array.isArray(order.goods) ? order.goods : [];
}
function itemId(i){ return String(i.productId || i.productID || i.product_id || i.externalId || i.id || i.code || i.article || i.sku || i.title || i.name || '').trim(); }
function itemTitle(i){ return String(i.title || i.name || i.productName || i.productTitle || itemId(i) || 'Товар').trim(); }
function itemQty(i){ return toNum(i.qty ?? i.quantity ?? i.count ?? i.amount ?? i.stock ?? 1) || 1; }
function itemPrice(i){ return toNum(i.price ?? i.salePrice ?? i.linePrice ?? i.unitPrice ?? i.sum ?? i.lineTotal ?? i.total ?? 0); }
function orderStatus(o){ return String(o.status || o.orderStatus || o.state || o.orderState || o.deliveryStatus || '').toLowerCase().trim(); }
function isDoneOrder(o){
  const s = orderStatus(o);
  // Считаем только реально выполненные / выданные. Новые, отменённые, отклонённые не попадут.
  return [
    'done','complete','completed','fulfilled','issued','delivered','closed','success',
    'picked_up','picked-up',
    'выдан','выдано','выполнен','выполнено','завершен','завершён','доставлен','доставлено'
  ].some(x => s.includes(x));
}
function isIgnoredOrder(o){ return !isDoneOrder(o); }
function filteredOrders(){
  const from = nowFrom();

  return state.orders.filter(o => {
    const time = getTime(o);

    // Старые заказы без даты не выбрасываем полностью:
    // они остаются видны аналитике и не исчезают из-за различий формата Firestore Timestamp.
    if (!time) return true;

    return time >= from;
  });
}
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
    const type = String(c.type || '').toLowerCase();
    const oldStock = toNum(c.oldStock ?? c.beforeStock ?? c.prevStock ?? c.stockBefore ?? 0);
    const newStock = toNum(c.newStock ?? c.afterStock ?? c.stockAfter ?? c.stock ?? 0);
    let qty = toNum(c.quantity ?? c.sold1c ?? c.soldQty ?? c.decreasedBy ?? 0);
    if (!qty && oldStock > newStock) qty = oldStock - newStock;
    const isSale = type === 'sale' || type === 'stock_down' || oldStock > newStock;
    if (!isSale || qty <= 0) return;
    const id = String(c.productId || c.externalId || c.id || c.code || c.sku || c.title || '').trim();
    if(!id) return;
    const price = toNum(c.price ?? c.newPrice ?? c.oldPrice ?? 0);
    const prev = map.get(id) || { id, title: c.title || c.name || id, qty:0, revenue:0, changes:0 };
    prev.qty += qty;
    prev.revenue += toNum(c.amount) || qty * price;
    prev.changes += 1;
    map.set(id, prev);
  });
  return map;
}
function renderKpis(){
  const products = state.products.map(normProduct);
  const site = salesMapFromSite();
  const onec = oneCSalesMap();
  const latestRun = state.runs[0] || {};
  const siteSoldQty = [...site.values()].reduce((sum,x)=>sum+x.qty,0);
  const siteRevenue = [...site.values()].reduce((sum,x)=>sum+x.revenue,0);
  const oneCSoldQty = [...onec.values()].reduce((sum,x)=>sum+x.qty,0);
  const oneCRevenue = [...onec.values()].reduce((sum,x)=>sum+x.revenue,0);
  const totalUnits = products.reduce((sum,p)=>sum + Math.max(0, p.stock), 0);
  const inStockPositions = products.filter(p=>p.stock > 0).length;
  const newPositions = toNum(latestRun.newPositions);
  const low = products.filter(p=>p.stock > 0 && p.stock <= 3).length;
  const zero = products.filter(p=>p.stock <= 0).length;
  const stockValue = products.filter(p=>p.stock > 0).reduce((sum,p)=>sum + p.price * p.stock, 0);
  const data = {
    products: fmt(products.length), inStockPositions: fmt(inStockPositions), totalUnits: fmt(totalUnits), newPositions: fmt(newPositions),
    stockValue: money(stockValue), siteSoldQty: fmt(siteSoldQty), siteRevenue: money(siteRevenue),
    oneCSoldQty: fmt(oneCSoldQty), oneCRevenue: money(oneCRevenue), completedOrders: fmt(completedOrders().length),
    ignoredOrders: fmt(filteredOrders().filter(isIgnoredOrder).length), low: fmt(low), zero: fmt(zero), needOrder: fmt(recommendations().length)
  };
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
function renderOneCSales(){ renderSalesBox('#paOneCSales', oneCSalesMap(), 'За выбранный период уменьшений остатков после выгрузки 1С пока нет.'); }
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
  // Заказ рассчитывается только по фактическому снижению остатков 1С.
  // Продажи сайта не прибавляем повторно: после проведения заказа в 1С они уже попадут сюда как уменьшение остатка.
  oneCSalesMap().forEach(s => {
    const p = products.get(s.id) || { id:s.id, title:s.title, stock:0, price:0 };
    const avgDay = s.qty / Math.max(1, state.selectedDays);
    const projected30 = avgDay * 30;
    const safetyStock = Math.ceil(avgDay * 7);
    const target = Math.ceil(projected30) + safetyStock;
    const need = Math.max(0, target - Number(p.stock || 0));
    const daysLeft = avgDay > 0 ? Math.floor(Number(p.stock || 0) / avgDay) : 999;
    if (need > 0 || (p.stock <= 3 && s.qty > 0)) rows.push({ ...p, sold:s.qty, revenue:s.revenue, avgDay, daysLeft, need, reason: p.stock <= 0 ? 'товар закончился' : daysLeft <= 7 ? 'остатка меньше чем на неделю' : 'прогноз продаж по 1С' });
  });
  return rows.sort((a,b)=>b.need-a.need).slice(0,50);
}
function renderRecommendations(){
  const box = $('#paRecommendations'); if(!box) return;
  const rows = recommendations();
  if(!rows.length){ box.innerHTML = '<div class="pa-empty">Рекомендаций пока нет. Продаж мало или остатков достаточно.</div>'; return; }
  box.innerHTML = rows.map(r=>`<article class="pa-rec"><div><b>${escapeHtml(r.title)}</b><small>${escapeHtml(r.brand)} • ${escapeHtml(r.group)} • ${escapeHtml(r.code)}</small><p>Продано по 1С: <b>${fmt(r.sold)}</b> шт · Остаток: <b>${fmt(r.stock)}</b> · В среднем: <b>${r.avgDay.toFixed(1)}</b> шт/день</p></div><strong>Заказать ${fmt(r.need)} шт</strong><em>${escapeHtml(r.reason)}</em></article>`).join('');
}
function renderChanges(){
  const box = $('#paChanges'); if(!box) return;
  const latest = state.runs[0];
  $('#paLastSnapshot').textContent = latest ? `Последняя выгрузка: ${latest.createdAtText || new Date(latest.createdAtTs || Date.now()).toLocaleString('ru-RU')} · позиций: ${fmt(latest.totalPositions ?? latest.count ?? 0)} · единиц: ${fmt(latest.totalUnits ?? 0)} · новых: ${fmt(latest.newPositions ?? 0)} · продано: ${fmt(latest.soldUnits ?? 0)} · поступило: ${fmt(latest.receivedUnits ?? 0)}` : 'Автоматических снимков пока нет. Они создаются sync.js после выгрузки 1С.';
  const rows = state.changes.slice(0,160);
  if(!rows.length){ box.innerHTML = '<div class="pa-empty">Изменений после выгрузок пока нет.</div>'; return; }
  box.innerHTML = rows.map(c=>{
    const type = c.type === 'removed' ? '❌ Пропал' : c.type === 'added' ? '➕ Новый' : (c.type === 'stock_down' || c.type === 'sale') ? '🛒 Продажа 1С' : (c.type === 'stock_up' || c.type === 'receipt') ? '📥 Поступление'  : c.type === 'price' ? '💰 Цена' : '🔄 Изменён';
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
function mergeUniqueRows(){
  const result = [];
  const seen = new Set();

  Array.from(arguments).forEach(list => {
    (list || []).forEach(row => {
      const key = String(
        row.id ||
        row.orderNumber ||
        row.number ||
        [row.userId || row.uid || '', row.createdAtText || getTime(row), row.total || ''].join('|')
      );

      if (seen.has(key)) return;
      seen.add(key);
      result.push(row);
    });
  });

  return result;
}

export async function loadProductAnalytics(force=false){
  const sec = $('#productAnalytics'); if(!sec) return;
  if(!force && sec.dataset.loaded === '1') return;
  sec.dataset.loaded = '1';
  setStatus('Загружаю товарную аналитику...');
  const primaryOrdersCollection = COLLECTIONS.orders || 'autostyle_orders';

  const [products, primaryOrders, legacyOrders, changes, runs] = await Promise.all([
    getCol(COLLECTIONS.products || 'autostyle_products', 10000),
    getCol(primaryOrdersCollection, 8000),
    primaryOrdersCollection === 'orders' ? Promise.resolve([]) : getCol('orders', 8000),
    getCol('autostyle_product_changes', 10000),
    getCol('autostyle_product_sync_runs', 100)
  ]);

  const orders = mergeUniqueRows(primaryOrders, legacyOrders);

  changes.sort((a,b)=>getTime(b)-getTime(a));
  runs.sort((a,b)=>getTime(b)-getTime(a));
  orders.sort((a,b)=>getTime(b)-getTime(a));

  Object.assign(state, { products, orders, changes, runs });
  renderAll();
  const doneCount = completedOrders().length;
  const changesCount = state.changes.length;
  setStatus(
    `Обновлено: ${new Date().toLocaleString('ru-RU')} · заказов загружено: ${state.orders.length} · выполненных: ${doneCount} · изменений 1С: ${changesCount}`
  );
}
function init(){
  const period = $('#paPeriod'); if(period) period.addEventListener('change', e=>{ state.selectedDays=Number(e.target.value||30); renderAll(); });
  const refresh = $('#paRefresh'); if(refresh) refresh.addEventListener('click', ()=>loadProductAnalytics(true));
  document.addEventListener('click', e=>{ const a=e.target.closest('[data-section="productAnalytics"],a[href="#productAnalytics"]'); if(a) setTimeout(()=>loadProductAnalytics(),80); });
  window.addEventListener('hashchange', ()=>{ if(location.hash==='#productAnalytics') setTimeout(()=>loadProductAnalytics(),80); });
  if(location.hash==='#productAnalytics' || $('#productAnalytics.active')) loadProductAnalytics();
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init, { once:true }); else init();
