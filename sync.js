/**
 * AutoStyle sync.js — автоматическая товарная аналитика после выгрузки 1С.
 *
 * Назначение:
 * 1) после каждой выгрузки товаров в Firebase делает снимок склада;
 * 2) сравнивает новый остаток/цену/наличие с предыдущим снимком;
 * 3) отдельно пишет изменения 1С в autostyle_product_changes;
 * 4) админка читает эти данные без ручной кнопки “Сделать снимок”.
 *
 * Запуск вручную:
 *   node sync.js
 *
 * Подключение к существующей выгрузке:
 *   const { runProductAnalyticsSnapshot } = require('./sync');
 *   await runProductAnalyticsSnapshot(admin.firestore());
 */

let admin = null;
try { admin = require('firebase-admin'); } catch (_) {}

const PRODUCT_COLLECTION = process.env.AS_PRODUCTS_COLLECTION || 'autostyle_products';
const RUNS_COLLECTION = 'autostyle_product_sync_runs';
const CHANGES_COLLECTION = 'autostyle_product_changes';
const RECOMMENDATIONS_COLLECTION = 'autostyle_purchase_recommendations';
const MAX_BATCH = 450;

function toNumber(v){ const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; }
function titleOf(p){ return String(p.title || p.name || p.productName || p.description || p.id || 'Товар').trim(); }
function codeOf(p){ return String(p.code || p.article || p.sku || p.vendorCode || p.barcode || p.id || '').trim(); }
function brandOf(p){ return String(p.brand || p.brandName || p.manufacturer || p.vendor || '').trim(); }
function groupOf(p){ return String(p.group || p.category || p.categoryName || p.parentName || '').trim(); }
function priceOf(p){ return toNumber(p.price || p.salePrice || p.retailPrice || p.cost); }
function stockOf(p){ return toNumber(p.stock ?? p.qty ?? p.quantity ?? p.count ?? p.balance ?? p.amount ?? p.rest); }
function keyOf(id, p){ return String(p.id || p.productId || codeOf(p) || id || titleOf(p)).trim(); }
function safeDocId(id){ return String(id || Math.random()).replace(/[\/#\[\]?]/g,'_').slice(0,150); }
function norm(id, p){
  return {
    id: keyOf(id, p),
    sourceDocId: id,
    title: titleOf(p),
    code: codeOf(p),
    brand: brandOf(p),
    group: groupOf(p),
    price: priceOf(p),
    stock: stockOf(p),
    image: p.image || p.imageUrl || p.photo || '',
    updatedAtText: new Date().toLocaleString('ru-RU')
  };
}
async function getAllProducts(db){
  const snap = await db.collection(PRODUCT_COLLECTION).get();
  return snap.docs.map(d => norm(d.id, d.data() || {}));
}
async function getLastRun(db){
  const snap = await db.collection(RUNS_COLLECTION).orderBy('createdAtTs','desc').limit(1).get();
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}
async function getRunItems(db, runId){
  if(!runId) return [];
  const snap = await db.collection(RUNS_COLLECTION).doc(runId).collection('items').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
function compareProducts(previous, current){
  const oldMap = new Map(previous.map(p => [p.id, p]));
  const newMap = new Map(current.map(p => [p.id, p]));
  const changes = [];
  newMap.forEach((p, id) => {
    const old = oldMap.get(id);
    if(!old){
      changes.push({ type:'added', productId:id, title:p.title, code:p.code, brand:p.brand, group:p.group, newStock:p.stock, newPrice:p.price, note:`новый товар, остаток ${p.stock}` });
      return;
    }
    if(toNumber(old.price) !== toNumber(p.price)){
      changes.push({ type:'price', productId:id, title:p.title, code:p.code, brand:p.brand, group:p.group, oldPrice:old.price, newPrice:p.price, oldStock:old.stock, newStock:p.stock, priceDelta: p.price - old.price, note:`цена ${old.price} → ${p.price}` });
    }
    if(toNumber(old.stock) !== toNumber(p.stock)){
      const oldStock = toNumber(old.stock), newStock = toNumber(p.stock);
      const diff = newStock - oldStock;
      changes.push({ type: diff < 0 ? 'stock_down' : 'stock_up', productId:id, title:p.title, code:p.code, brand:p.brand, group:p.group, oldStock, newStock, stockDelta:diff, sold1c: diff < 0 ? Math.abs(diff) : 0, oldPrice:old.price, newPrice:p.price, price:p.price, note:`остаток ${oldStock} → ${newStock}` });
    }
    if(String(old.image || '') !== String(p.image || '')){
      changes.push({ type:'image', productId:id, title:p.title, code:p.code, brand:p.brand, group:p.group, oldStock:old.stock, newStock:p.stock, note:'изменилось фото' });
    }
  });
  oldMap.forEach((p, id) => {
    if(!newMap.has(id)) changes.push({ type:'removed', productId:id, title:p.title, code:p.code, brand:p.brand, group:p.group, oldStock:p.stock, oldPrice:p.price, note:`товар пропал, был остаток ${p.stock}` });
  });
  return changes;
}
async function commitChunks(db, writer){
  let batch = db.batch();
  let count = 0;
  async function set(ref, data){
    batch.set(ref, data, { merge:true });
    count++;
    if(count >= MAX_BATCH){ await batch.commit(); batch = db.batch(); count = 0; }
  }
  await writer(set);
  if(count) await batch.commit();
}
async function saveRun(db, products, changes){
  const now = Date.now();
  const ref = db.collection(RUNS_COLLECTION).doc(String(now));
  const down = changes.filter(c=>c.type==='stock_down').reduce((s,c)=>s+toNumber(c.sold1c),0);
  await ref.set({
    createdAtTs: now,
    createdAtText: new Date(now).toLocaleString('ru-RU'),
    source: 'sync-js-auto',
    count: products.length,
    changesCount: changes.length,
    oneCSoldQty: down,
    addedCount: changes.filter(c=>c.type==='added').length,
    removedCount: changes.filter(c=>c.type==='removed').length,
    priceChangedCount: changes.filter(c=>c.type==='price').length,
    stockChangedCount: changes.filter(c=>c.type==='stock_down' || c.type==='stock_up').length
  });
  await commitChunks(db, async set => {
    for(const p of products) await set(ref.collection('items').doc(safeDocId(p.id)), p);
  });
  await commitChunks(db, async set => {
    let i = 0;
    for(const c of changes){
      await set(db.collection(CHANGES_COLLECTION).doc(`${now}_${String(i++).padStart(5,'0')}_${safeDocId(c.productId)}`), { ...c, runId: ref.id, createdAtTs: now, createdAtText: new Date(now).toLocaleString('ru-RU') });
    }
  });
  return ref.id;
}
async function buildRecommendations(db, products, changes){
  const soldMap = new Map();
  changes.filter(c=>c.type==='stock_down' && toNumber(c.sold1c)>0).forEach(c=>{
    const v = soldMap.get(c.productId) || { productId:c.productId, title:c.title, qty:0 };
    v.qty += toNumber(c.sold1c); soldMap.set(c.productId, v);
  });
  const productMap = new Map(products.map(p=>[p.id,p]));
  const rows = [];
  soldMap.forEach(s=>{
    const p = productMap.get(s.productId) || {};
    const stock = toNumber(p.stock);
    const need = Math.max(0, Math.ceil(s.qty * 1.25) - stock);
    if(need > 0 || stock <= 3) rows.push({ productId:s.productId, title:p.title || s.title, code:p.code || '', brand:p.brand || '', group:p.group || '', sold1c:s.qty, stock, price:p.price || 0, need: Math.max(need, stock <= 0 ? s.qty : 0), reason: stock <= 0 ? 'закончился после выгрузки 1С' : 'уходит через 1С, остаток низкий', updatedAtTs:Date.now(), updatedAtText:new Date().toLocaleString('ru-RU') });
  });
  await commitChunks(db, async set => {
    for(const r of rows.slice(0,200)) await set(db.collection(RECOMMENDATIONS_COLLECTION).doc(safeDocId(r.productId)), r);
  });
  return rows.length;
}
async function runProductAnalyticsSnapshot(db){
  const products = await getAllProducts(db);
  const lastRun = await getLastRun(db);
  const previous = lastRun ? await getRunItems(db, lastRun.id) : [];
  const changes = previous.length ? compareProducts(previous, products) : products.map(p => ({ type:'added', productId:p.id, title:p.title, code:p.code, brand:p.brand, group:p.group, newStock:p.stock, newPrice:p.price, note:'первый автоматический снимок' }));
  const runId = await saveRun(db, products, changes);
  const recCount = await buildRecommendations(db, products, changes);
  console.log(`[AutoStyle analytics] run ${runId}: products=${products.length}, changes=${changes.length}, recommendations=${recCount}`);
  return { runId, products: products.length, changes: changes.length, recommendations: recCount };
}
module.exports = { runProductAnalyticsSnapshot };

if (require.main === module) {
  (async () => {
    if(!admin) throw new Error('Установи firebase-admin: npm i firebase-admin');
    if(!admin.apps.length) {
      // Использует GOOGLE_APPLICATION_CREDENTIALS или стандартные права окружения.
      admin.initializeApp({ credential: admin.credential.applicationDefault() });
    }
    await runProductAnalyticsSnapshot(admin.firestore());
    process.exit(0);
  })().catch(err => { console.error(err); process.exit(1); });
}
