import { db, COLLECTIONS } from './firebase.js';
import {
  collection, doc, getDoc, getDocs, addDoc, setDoc,
  query, orderBy, limit, serverTimestamp, writeBatch
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const fmt = n => new Intl.NumberFormat('ru-RU').format(Number(n || 0));
const money = n => `${fmt(Math.round(Number(n || 0)))} ₽`;
const dayMs = 86400000;
const state = { products: [], orders: [], snapshots: [], selectedDays: 30 };

function getTime(row){
  const v = row.createdAt || row.date || row.timestamp || row.createdAtText;
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
async function getCol(name, max=5000){
  try { const snap = await getDocs(query(collection(db, name), limit(max))); return snap.docs.map(d=>({id:d.id, ...d.data()})); }
  catch(e){ console.warn('read failed', name, e); return []; }
}
async function getLastSnapshots(){
  try { const snap = await getDocs(query(collection(db, 'autostyle_product_snapshots'), orderBy('createdAtTs','desc'), limit(6))); return snap.docs.map(d=>({id:d.id, ...d.data()})); }
  catch(e){ console.warn('snapshots failed', e); return []; }
}
async function getSnapshotItems(snapshotId){
  if(!snapshotId) return [];
  try { const snap = await getDocs(collection(db, 'autostyle_product_snapshots', snapshotId, 'items')); return snap.docs.map(d=>({id:d.id, ...d.data()})); }
  catch(e){ console.warn('snapshot items failed', e); return []; }
}
function orderItems(order){ return Array.isArray(order.items) ? order.items : Array.isArray(order.products) ? order.products : []; }
function itemId(i){ return String(i.productId || i.id || i.product_id || i.code || i.sku || i.title || i.name || '').trim(); }
function itemTitle(i){ return String(i.title || i.name || i.productName || itemId(i) || 'Товар').trim(); }
function itemQty(i){ return Number(i.qty || i.quantity || i.count || 1) || 1; }
function itemPrice(i){ return Number(i.price || i.linePrice || i.sum || i.lineTotal || 0) || 0; }
function filteredOrders(){ const from = Date.now() - state.selectedDays * dayMs; return state.orders.filter(o => (getTime(o) || 0) >= from); }
function salesMap(){
  const map = new Map();
  filteredOrders().forEach(o => orderItems(o).forEach(i => {
    const id = itemId(i); if(!id) return;
    const qty = itemQty(i); const revenue = Number(i.lineTotal || i.total || 0) || itemPrice(i) * qty;
    const prev = map.get(id) || { id, title:itemTitle(i), qty:0, revenue:0, orders:0 };
    prev.qty += qty; prev.revenue += revenue; prev.orders += 1; if(!prev.title || prev.title === id) prev.title = itemTitle(i);
    map.set(id, prev);
  }));
  return map;
}
function renderKpis(){
  const products = state.products.map(normProduct);
  const sm = salesMap();
  const soldQty = [...sm.values()].reduce((s,x)=>s+x.qty,0);
  const revenue = [...sm.values()].reduce((s,x)=>s+x.revenue,0);
  const low = products.filter(p=>p.stock > 0 && p.stock <= 3).length;
  const zero = products.filter(p=>p.stock <= 0).length;
  const stockValue = products.reduce((s,p)=>s + p.price * Math.max(0,p.stock), 0);
  const data = { products: products.length, stockValue: money(stockValue), soldQty: fmt(soldQty), revenue: money(revenue), low: fmt(low), zero: fmt(zero), orders: fmt(filteredOrders().length), needOrder: fmt(recommendations().length) };
  Object.entries(data).forEach(([k,v]) => { const el = $(`[data-pa-kpi="${k}"]`); if(el) el.textContent = v; });
}
function rowProgress(value, max){ return `<i style="width:${Math.max(3, Math.round(Number(value||0)/Math.max(1,max)*100))}%"></i>`; }
function renderTopSales(){
  const box = $('#paTopSales'); if(!box) return;
  const rows = [...salesMap().values()].sort((a,b)=>b.qty-a.qty).slice(0,20);
  if(!rows.length){ box.innerHTML = '<div class="pa-empty">За выбранный период продаж по товарам пока нет.</div>'; return; }
  const products = new Map(state.products.map(p=>[productKey(p), normProduct(p)]));
  const max = Math.max(...rows.map(r=>r.qty), 1);
  box.innerHTML = rows.map((r,i)=>{ const p=products.get(r.id)||{}; return `<div class="pa-table-row"><b>${i+1}. ${escapeHtml(r.title)}</b><span>${fmt(r.qty)} шт</span><span>${money(r.revenue)}</span><span>${fmt(p.stock || 0)} ост.</span><em>${rowProgress(r.qty,max)}</em></div>`; }).join('');
}
function recommendations(){
  const products = new Map(state.products.map(p=>[productKey(p), normProduct(p)]));
  const rows = [];
  salesMap().forEach(s => {
    const p = products.get(s.id) || { id:s.id, title:s.title, stock:0, price:0 };
    const avgDay = s.qty / Math.max(1, state.selectedDays);
    const reserveDays = 30;
    const target = Math.ceil(avgDay * reserveDays * 1.25);
    const need = Math.max(0, target - Number(p.stock || 0));
    const daysLeft = avgDay > 0 ? Math.floor(Number(p.stock || 0) / avgDay) : 999;
    if (need > 0 || p.stock <= 3) rows.push({ ...p, sold:s.qty, revenue:s.revenue, avgDay, daysLeft, need: Math.max(need, p.stock <= 0 ? Math.ceil(s.qty || 1) : 0), reason: p.stock <= 0 ? 'товар закончился' : daysLeft <= 7 ? 'хватит меньше недели' : 'быстро продаётся' });
  });
  return rows.sort((a,b)=>b.need-a.need).slice(0,50);
}
function renderRecommendations(){
  const box = $('#paRecommendations'); if(!box) return;
  const rows = recommendations();
  if(!rows.length){ box.innerHTML = '<div class="pa-empty">Рекомендаций пока нет. Продаж мало или остатков достаточно.</div>'; return; }
  box.innerHTML = rows.map(r=>`<article class="pa-rec"><div><b>${escapeHtml(r.title)}</b><small>${escapeHtml(r.brand)} • ${escapeHtml(r.group)} • ${escapeHtml(r.code)}</small><p>Продано: <b>${fmt(r.sold)}</b> шт · Остаток: <b>${fmt(r.stock)}</b> · В среднем: <b>${r.avgDay.toFixed(1)}</b> шт/день</p></div><strong>Заказать ${fmt(r.need)} шт</strong><em>${escapeHtml(r.reason)}</em></article>`).join('');
}
async function renderChanges(){
  const box = $('#paChanges'); if(!box) return;
  const prev = state.snapshots[0];
  if(!prev){ box.innerHTML = '<div class="pa-empty">Снимков ещё нет. Нажми “Сделать снимок” перед или после выгрузки из 1С.</div>'; return; }
  const oldItems = (await getSnapshotItems(prev.id)).map(normProduct);
  const oldMap = new Map(oldItems.map(p=>[p.id,p]));
  const newItems = state.products.map(normProduct);
  const newMap = new Map(newItems.map(p=>[p.id,p]));
  const added=[], removed=[], changed=[];
  newMap.forEach((p,id)=>{ const old=oldMap.get(id); if(!old) added.push(p); else { const dif=[]; if(Number(old.price)!==Number(p.price)) dif.push(`цена ${money(old.price)} → ${money(p.price)}`); if(Number(old.stock)!==Number(p.stock)) dif.push(`остаток ${fmt(old.stock)} → ${fmt(p.stock)}`); if(dif.length) changed.push({ ...p, dif }); } });
  oldMap.forEach((p,id)=>{ if(!newMap.has(id)) removed.push(p); });
  const rows = [
    ...removed.map(p=>({type:'❌ Пропал', title:p.title, meta:`был остаток ${fmt(p.stock)} • ${money(p.price)}`})),
    ...added.map(p=>({type:'➕ Новый', title:p.title, meta:`остаток ${fmt(p.stock)} • ${money(p.price)}`})),
    ...changed.map(p=>({type:'🔄 Изменён', title:p.title, meta:p.dif.join(' • ')}))
  ];
  $('#paLastSnapshot').textContent = prev.createdAtText ? `Сравнение с: ${prev.createdAtText}` : `Сравнение со снимком: ${prev.id}`;
  if(!rows.length){ box.innerHTML = '<div class="pa-empty">По сравнению с последним снимком изменений нет.</div>'; return; }
  box.innerHTML = rows.slice(0,120).map(r=>`<div class="pa-change"><span>${r.type}</span><b>${escapeHtml(r.title)}</b><small>${escapeHtml(r.meta)}</small></div>`).join('');
}
function renderSlowProducts(){
  const box = $('#paSlowProducts'); if(!box) return;
  const sold = salesMap();
  const rows = state.products.map(normProduct).filter(p=>p.stock>0 && !sold.has(p.id)).slice(0,50);
  if(!rows.length){ box.innerHTML = '<div class="pa-empty">Нет зависших товаров за выбранный период.</div>'; return; }
  box.innerHTML = rows.map(p=>`<div class="pa-slow"><b>${escapeHtml(p.title)}</b><span>${fmt(p.stock)} шт</span><small>${escapeHtml(p.brand)} • ${money(p.price)}</small></div>`).join('');
}
function renderBrands(){
  const box = $('#paBrands'); if(!box) return;
  const sm = salesMap(); const products = new Map(state.products.map(p=>[productKey(p), normProduct(p)])); const m = new Map();
  sm.forEach(s=>{ const p=products.get(s.id)||{}; const key=p.brand||'Без бренда'; const v=m.get(key)||{name:key, qty:0, revenue:0}; v.qty+=s.qty; v.revenue+=s.revenue; m.set(key,v); });
  const rows=[...m.values()].sort((a,b)=>b.qty-a.qty).slice(0,12); const max=Math.max(...rows.map(r=>r.qty),1);
  box.innerHTML = rows.length ? rows.map(r=>`<div><div class="pa-line"><b>${escapeHtml(r.name)}</b><span>${fmt(r.qty)} шт · ${money(r.revenue)}</span></div><div class="pa-progress">${rowProgress(r.qty,max)}</div></div>`).join('') : '<div class="pa-empty">Данных по брендам пока нет.</div>';
}
function renderAll(){ renderKpis(); renderTopSales(); renderRecommendations(); renderSlowProducts(); renderBrands(); renderChanges(); }
async function createSnapshot(){
  const btn = $('#paCreateSnapshot'); if(btn) btn.disabled = true;
  try {
    setStatus('Создаю снимок товаров...');
    const products = state.products.map(normProduct);
    const ref = await addDoc(collection(db, 'autostyle_product_snapshots'), { createdAt: serverTimestamp(), createdAtTs: Date.now(), createdAtText: new Date().toLocaleString('ru-RU'), count: products.length, source: 'admin-manual' });
    let batch = writeBatch(db); let n = 0;
    for (const p of products) {
      batch.set(doc(db, 'autostyle_product_snapshots', ref.id, 'items', safeDocId(p.id)), p);
      n++;
      if (n % 450 === 0) { await batch.commit(); batch = writeBatch(db); }
    }
    await batch.commit();
    await loadProductAnalytics(true);
    setStatus(`Снимок создан: ${products.length} товаров`);
  } catch(e){ console.error(e); setStatus(`Ошибка снимка: ${e.message}`, true); }
  finally { if(btn) btn.disabled = false; }
}
function safeDocId(id){ return String(id || Math.random()).replace(/[\/#[\]?]/g,'_').slice(0,120); }
function escapeHtml(s){ return String(s||'').replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch])); }
export async function loadProductAnalytics(force=false){
  const sec = $('#productAnalytics'); if(!sec) return;
  if(!force && sec.dataset.loaded === '1') return;
  sec.dataset.loaded = '1';
  setStatus('Загружаю товарную аналитику...');
  const [products, orders, snapshots] = await Promise.all([
    getCol(COLLECTIONS.products || 'autostyle_products', 8000),
    getCol(COLLECTIONS.orders || 'autostyle_orders', 5000),
    getLastSnapshots()
  ]);
  Object.assign(state, { products, orders, snapshots });
  renderAll();
  setStatus(`Обновлено: ${new Date().toLocaleString('ru-RU')}`);
}
function init(){
  const period = $('#paPeriod'); if(period) period.addEventListener('change', e=>{ state.selectedDays=Number(e.target.value||30); renderAll(); });
  const refresh = $('#paRefresh'); if(refresh) refresh.addEventListener('click', ()=>loadProductAnalytics(true));
  const snap = $('#paCreateSnapshot'); if(snap) snap.addEventListener('click', createSnapshot);
  document.addEventListener('click', e=>{ const a=e.target.closest('[data-section="productAnalytics"],a[href="#productAnalytics"]'); if(a) setTimeout(()=>loadProductAnalytics(),80); });
  window.addEventListener('hashchange', ()=>{ if(location.hash==='#productAnalytics') setTimeout(()=>loadProductAnalytics(),80); });
  if(location.hash==='#productAnalytics' || $('#productAnalytics.active')) loadProductAnalytics();
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init, { once:true }); else init();
