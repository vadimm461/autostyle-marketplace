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

function salesForDays(days){
  const from = Date.now() - days * dayMs;
  const map = new Map();

  state.changes.forEach(c => {
    const when = getTime(c);
    if (!when || when < from) return;

    const type = String(c.type || '').toLowerCase();
    const oldStock = toNum(c.oldStock != null ? c.oldStock : c.beforeStock);
    const newStock = toNum(c.newStock != null ? c.newStock : c.afterStock);
    let qty = toNum(c.qty != null ? c.qty : (c.quantity != null ? c.quantity : c.soldQty));

    if (!qty && oldStock > newStock) qty = oldStock - newStock;

    const isSale = type === 'sale' || type === 'stock_down' || oldStock > newStock;
    if (!isSale || qty <= 0) return;

    const id = String(c.productId || c.externalId || c.code || c.sku || c.id || '').trim();
    if (!id) return;

    map.set(id, (map.get(id) || 0) + qty);
  });

  return map;
}

function stockHistoryForProduct(productId, currentStock, days=30){
  const points = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const byDay = new Map();

  state.changes.forEach(c => {
    const id = String(c.productId || c.externalId || c.code || c.sku || c.id || '').trim();
    if (id !== productId) return;

    const when = getTime(c);
    if (!when) return;

    const day = new Date(when);
    day.setHours(0, 0, 0, 0);
    const key = day.getTime();

    const oldStock = toNum(c.oldStock != null ? c.oldStock : c.beforeStock);
    const newStock = toNum(c.newStock != null ? c.newStock : c.afterStock);

    if (!byDay.has(key) || getTime(byDay.get(key)) < when) {
      byDay.set(key, { ...c, oldStock, newStock });
    }
  });

  let stock = Math.max(0, toNum(currentStock));

  for (let i = 0; i < days; i++) {
    const d = new Date(now.getTime() - i * dayMs);
    const key = d.getTime();
    points.push({ time:key, stock });

    const change = byDay.get(key);
    if (change) stock = Math.max(0, toNum(change.oldStock));
  }

  return points.reverse();
}

function miniStockChart(productId, stock){
  const points = stockHistoryForProduct(productId, stock, 30);
  const max = Math.max(1, ...points.map(p => p.stock));
  return `<div class="pa-mini-chart" title="Остаток за последние 30 дней">${
    points.map(p => `<i style="height:${Math.max(6, Math.round(p.stock / max * 100))}%"></i>`).join('')
  }</div>`;
}

function priorityInfo(daysLeft, stock, sold30, need){
  if (stock <= 0 && sold30 > 0) return { key:'critical', label:'Срочно', rank:4 };
  if (need > 0 && daysLeft <= 7) return { key:'critical', label:'Срочно', rank:4 };
  if (need > 0 && daysLeft <= 14) return { key:'high', label:'Высокий', rank:3 };
  if (need > 0 || daysLeft <= 30) return { key:'medium', label:'Средний', rank:2 };
  return { key:'normal', label:'Запас есть', rank:1 };
}

function smartRows(){
  const sold7 = salesForDays(7);
  const sold30 = salesForDays(30);
  const sold90 = salesForDays(90);

  return state.products.map(normProduct).map(p => {
    const s7 = sold7.get(p.id) || toNum(p.sales7d);
    const s30 = sold30.get(p.id) || toNum(p.sales30d);
    const s90 = sold90.get(p.id) || 0;

    const avgDaily = s30 > 0 ? s30 / 30 : (s90 > 0 ? s90 / 90 : 0);
    const daysLeft = avgDaily > 0 ? Math.floor(p.stock / avgDaily) : null;
    const safety = Math.ceil(avgDaily * 7);
    const target = Math.ceil(avgDaily * 30) + safety;
    const calculatedNeed = Math.max(0, target - p.stock);
    const need = Math.max(calculatedNeed, toNum(p.recommendedOrderQty));
    const priority = priorityInfo(daysLeft == null ? 9999 : daysLeft, p.stock, s30, need);

    return {
      ...p,
      sold7:s7,
      sold30:s30,
      sold90:s90,
      avgDaily,
      daysLeft,
      safety,
      target,
      need,
      priority
    };
  });
}

function ensureSmartAnalyticsUi(){
  if ($('#paSmartProcurement')) return;

  const section = $('#productAnalytics');
  if (!section) return;

  const anchor = $('#paRecommendations')?.closest('section, .admin-card, .pa-card, div') || $('#paRecommendations');
  const wrap = document.createElement('section');
  wrap.id = 'paSmartProcurement';
  wrap.className = 'pa-smart-panel';
  wrap.innerHTML = `
    <div class="pa-smart-head">
      <div>
        <h2>Умная закупка по товарам</h2>
        <p>Продажи 1С, запас в днях, приоритет и рекомендуемый заказ.</p>
      </div>
      <div class="pa-smart-tools">
        <input id="paSmartSearch" type="search" placeholder="Название или код товара">
        <select id="paSmartPriority">
          <option value="all">Все приоритеты</option>
          <option value="critical">Только срочные</option>
          <option value="high">Высокий приоритет</option>
          <option value="medium">Средний приоритет</option>
          <option value="normal">Запас есть</option>
        </select>
        <select id="paSmartSort">
          <option value="priority">Сначала срочные</option>
          <option value="need">Больше к заказу</option>
          <option value="days">Меньше дней запаса</option>
          <option value="sold30">Больше продаж за 30 дней</option>
          <option value="stock">Меньше остаток</option>
        </select>
      </div>
    </div>
    <div class="pa-smart-summary" id="paSmartSummary"></div>
    <div class="pa-smart-table-wrap">
      <table class="pa-smart-table">
        <thead>
          <tr>
            <th>Товар</th>
            <th>Остаток</th>
            <th>7 дней</th>
            <th>30 дней</th>
            <th>90 дней</th>
            <th>В день</th>
            <th>Хватит</th>
            <th>Движение остатка</th>
            <th>Приоритет</th>
            <th>К заказу</th>
          </tr>
        </thead>
        <tbody id="paSmartRows"></tbody>
      </table>
    </div>`;

  if (anchor && anchor.parentNode) {
    anchor.parentNode.insertBefore(wrap, anchor.nextSibling);
  } else {
    section.appendChild(wrap);
  }

  const style = document.createElement('style');
  style.id = 'paSmartStyles';
  style.textContent = `
    .pa-smart-panel{margin:22px 0;padding:22px;border:1px solid #dfe7f1;border-radius:22px;background:#fff;box-shadow:0 14px 40px rgba(20,35,55,.07)}
    .pa-smart-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-end;margin-bottom:16px}
    .pa-smart-head h2{margin:0 0 5px;font-size:24px;color:#10233f}
    .pa-smart-head p{margin:0;color:#65748a}
    .pa-smart-tools{display:flex;gap:9px;flex-wrap:wrap;justify-content:flex-end}
    .pa-smart-tools input,.pa-smart-tools select{height:42px;border:1px solid #dbe4ef;border-radius:12px;padding:0 13px;background:#f9fbfd;color:#17243a;font:inherit}
    .pa-smart-tools input{min-width:220px}
    .pa-smart-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:0 0 15px}
    .pa-smart-summary div{padding:13px 15px;border-radius:15px;background:#f5f8fc;border:1px solid #e5ebf3}
    .pa-smart-summary b{display:block;font-size:22px;color:#11243e}
    .pa-smart-summary small{color:#68778c}
    .pa-smart-table-wrap{overflow:auto;border:1px solid #e5ebf3;border-radius:16px}
    .pa-smart-table{width:100%;border-collapse:collapse;min-width:1120px}
    .pa-smart-table th{position:sticky;top:0;z-index:1;background:#f6f9fc;text-align:left;padding:12px 10px;font-size:12px;color:#627086;border-bottom:1px solid #e5ebf3}
    .pa-smart-table td{padding:12px 10px;border-bottom:1px solid #edf1f6;vertical-align:middle;color:#23324a}
    .pa-smart-table tr:last-child td{border-bottom:0}
    .pa-smart-title{max-width:300px}
    .pa-smart-title b{display:block;line-height:1.25}
    .pa-smart-title small{display:block;margin-top:4px;color:#758297}
    .pa-priority{display:inline-flex;align-items:center;justify-content:center;min-width:84px;padding:7px 9px;border-radius:999px;font-size:12px;font-weight:800}
    .pa-priority-critical{background:#ffe8ea;color:#c3152d}
    .pa-priority-high{background:#fff0dc;color:#a75d00}
    .pa-priority-medium{background:#fff8d7;color:#796500}
    .pa-priority-normal{background:#e8f7ed;color:#14763a}
    .pa-need{font-size:18px;color:#0d2545;white-space:nowrap}
    .pa-days-critical{color:#c3152d;font-weight:800}
    .pa-mini-chart{height:42px;width:145px;display:flex;align-items:flex-end;gap:2px}
    .pa-mini-chart i{display:block;flex:1;min-width:2px;border-radius:2px 2px 0 0;background:linear-gradient(180deg,#10b981,#73d6b2)}
    .pa-smart-empty{text-align:center;padding:30px;color:#718096}
    @media(max-width:900px){
      .pa-smart-head{align-items:stretch;flex-direction:column}
      .pa-smart-tools{justify-content:flex-start}
      .pa-smart-tools input,.pa-smart-tools select{width:100%}
      .pa-smart-summary{grid-template-columns:repeat(2,minmax(0,1fr))}
    }`;
  document.head.appendChild(style);

  ['paSmartSearch','paSmartPriority','paSmartSort'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(id === 'paSmartSearch' ? 'input' : 'change', renderSmartProcurement);
  });
}

function renderSmartProcurement(){
  ensureSmartAnalyticsUi();

  const tbody = $('#paSmartRows');
  const summary = $('#paSmartSummary');
  if (!tbody || !summary) return;

  const search = String($('#paSmartSearch')?.value || '').toLowerCase().trim();
  const priority = $('#paSmartPriority')?.value || 'all';
  const sort = $('#paSmartSort')?.value || 'priority';

  let rows = smartRows();

  if (search) {
    rows = rows.filter(r =>
      r.title.toLowerCase().includes(search) ||
      r.code.toLowerCase().includes(search) ||
      r.brand.toLowerCase().includes(search)
    );
  }

  if (priority !== 'all') {
    rows = rows.filter(r => r.priority.key === priority);
  }

  const sorters = {
    priority: (a,b) => b.priority.rank - a.priority.rank || b.need - a.need || b.sold30 - a.sold30,
    need: (a,b) => b.need - a.need,
    days: (a,b) => (a.daysLeft == null ? 99999 : a.daysLeft) - (b.daysLeft == null ? 99999 : b.daysLeft),
    sold30: (a,b) => b.sold30 - a.sold30,
    stock: (a,b) => a.stock - b.stock
  };

  rows.sort(sorters[sort] || sorters.priority);

  const critical = rows.filter(r => r.priority.key === 'critical').length;
  const needPositions = rows.filter(r => r.need > 0).length;
  const totalNeed = rows.reduce((s,r) => s + r.need, 0);
  const purchaseValue = rows.reduce((s,r) => s + r.need * r.price, 0);

  summary.innerHTML = `
    <div><b>${fmt(critical)}</b><small>срочных позиций</small></div>
    <div><b>${fmt(needPositions)}</b><small>позиций к заказу</small></div>
    <div><b>${fmt(totalNeed)}</b><small>единиц заказать</small></div>
    <div><b>${money(purchaseValue)}</b><small>сумма по розничной цене</small></div>`;

  const visible = rows.slice(0, 250);

  if (!visible.length) {
    tbody.innerHTML = `<tr><td colspan="10" class="pa-smart-empty">По выбранным условиям товаров нет.</td></tr>`;
    return;
  }

  tbody.innerHTML = visible.map(r => {
    const daysText = r.daysLeft == null
      ? (r.sold30 > 0 ? '—' : 'нет продаж')
      : `${fmt(r.daysLeft)} дн.`;

    const criticalDays = r.daysLeft != null && r.daysLeft <= 7 ? ' pa-days-critical' : '';

    return `<tr>
      <td class="pa-smart-title"><b>${escapeHtml(r.title)}</b><small>${escapeHtml(r.code || 'без кода')} · ${escapeHtml(r.brand)} · ${escapeHtml(r.group)}</small></td>
      <td><b>${fmt(r.stock)}</b> шт</td>
      <td>${fmt(r.sold7)}</td>
      <td><b>${fmt(r.sold30)}</b></td>
      <td>${fmt(r.sold90)}</td>
      <td>${r.avgDaily > 0 ? r.avgDaily.toFixed(2) : '0'}</td>
      <td class="${criticalDays}">${daysText}</td>
      <td>${miniStockChart(r.id, r.stock)}</td>
      <td><span class="pa-priority pa-priority-${r.priority.key}">${r.priority.label}</span></td>
      <td><strong class="pa-need">${r.need > 0 ? fmt(r.need) + ' шт' : '—'}</strong></td>
    </tr>`;
  }).join('');
}

function renderAll(){ renderKpis(); renderTopSales(); renderOneCSales(); renderRecommendations(); renderSlowProducts(); renderBrands(); renderChanges(); renderSmartProcurement(); }
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
