/**
 * AutoStyle товарная аналитика после успешной выгрузки 1С.
 * Этот файл НЕ импортирует товары. Его вызывает основной синхронизатор после записи товаров:
 *   const { runProductAnalyticsSnapshot } = require('./sync');
 *   await runProductAnalyticsSnapshot(db);
 */

let admin = null;
try { admin = require('firebase-admin'); } catch (_) {}

const PRODUCT_COLLECTION = process.env.AS_PRODUCTS_COLLECTION || 'autostyle_products';
const RUNS_COLLECTION = 'autostyle_product_sync_runs';
const CHANGES_COLLECTION = 'autostyle_product_changes';
const RECOMMENDATIONS_COLLECTION = 'autostyle_purchase_recommendations';
const MAX_BATCH = 400;

function toNumber(v) {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(String(v).replace(',', '.').replace(/\s+/g, ''));
  return Number.isFinite(n) ? n : 0;
}
function titleOf(p){ return String(p.title || p.name || p.productName || p.description || p.id || 'Товар').trim(); }
function codeOf(p){ return String(p.code || p.article || p.sku || p.vendorCode || p.barcode || p.id || '').trim(); }
function brandOf(p){ return String(p.brand || p.brandName || p.manufacturer || p.vendor || '').trim(); }
function groupOf(p){ return String(p.group || p.category || p.categoryName || p.parentName || '').trim(); }
function priceOf(p){ return toNumber(p.price ?? p.salePrice ?? p.retailPrice ?? p.cost ?? 0); }
function stockOf(p){
  const candidates = [p.stock, p.quantity, p.qty, p.count, p.balance, p.rest, p.remainder];
  for (const value of candidates) {
    if (value !== undefined && value !== null && value !== '') return Math.max(0, toNumber(value));
  }
  return 0;
}
function keyOf(id, p){ return String(p.externalId || p.productId || p.id || id || codeOf(p) || titleOf(p)).trim(); }
function safeDocId(id){ return String(id || Math.random()).replace(/[\/#\[\]?]/g, '_').slice(0, 150); }
function norm(id, p){
  return {
    id: keyOf(id, p),
    sourceDocId: id,
    externalId: String(p.externalId || ''),
    title: titleOf(p),
    code: codeOf(p),
    article: String(p.article || ''),
    brand: brandOf(p),
    group: groupOf(p),
    categoryId: String(p.categoryId || ''),
    price: priceOf(p),
    stock: stockOf(p),
    image: p.image || p.imageUrl || p.photo || ''
  };
}
async function getAllProducts(db){
  const snap = await db.collection(PRODUCT_COLLECTION).get();
  return snap.docs.map(d => norm(d.id, d.data() || {}));
}
async function getLastRun(db){
  const snap = await db.collection(RUNS_COLLECTION).orderBy('createdAtTs', 'desc').limit(1).get();
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}
async function getRunItems(db, runId){
  if (!runId) return [];
  const snap = await db.collection(RUNS_COLLECTION).doc(runId).collection('items').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
function compareProducts(previous, current){
  const oldMap = new Map(previous.map(p => [String(p.id), p]));
  const newMap = new Map(current.map(p => [String(p.id), p]));
  const changes = [];

  for (const p of current) {
    const old = oldMap.get(String(p.id));
    if (!old) {
      changes.push({
        type: 'added', productId: p.id, title: p.title, code: p.code, brand: p.brand, group: p.group,
        oldStock: 0, newStock: p.stock, quantity: p.stock, newPrice: p.price,
        note: `новая позиция, остаток ${p.stock} шт.`
      });
      continue;
    }
    const oldStock = toNumber(old.stock);
    const newStock = toNumber(p.stock);
    const oldPrice = toNumber(old.price);
    const newPrice = toNumber(p.price);

    if (newStock < oldStock) {
      const quantity = oldStock - newStock;
      changes.push({
        type: 'sale', productId: p.id, title: p.title, code: p.code, brand: p.brand, group: p.group,
        oldStock, newStock, stockBefore: oldStock, stockAfter: newStock,
        quantity, soldQty: quantity, price: newPrice, amount: quantity * newPrice,
        note: `продано ${quantity} шт.: ${oldStock} → ${newStock}`
      });
    } else if (newStock > oldStock) {
      const quantity = newStock - oldStock;
      changes.push({
        type: 'receipt', productId: p.id, title: p.title, code: p.code, brand: p.brand, group: p.group,
        oldStock, newStock, stockBefore: oldStock, stockAfter: newStock,
        quantity, receivedQty: quantity, price: newPrice, amount: quantity * newPrice,
        note: `поступило ${quantity} шт.: ${oldStock} → ${newStock}`
      });
    }
    if (oldPrice !== newPrice) {
      changes.push({
        type: 'price', productId: p.id, title: p.title, code: p.code, brand: p.brand, group: p.group,
        oldPrice, newPrice, oldStock, newStock,
        note: `цена ${oldPrice} → ${newPrice}`
      });
    }
  }

  for (const p of previous) {
    if (!newMap.has(String(p.id))) {
      changes.push({
        type: 'removed', productId: p.id, title: p.title, code: p.code, brand: p.brand, group: p.group,
        oldStock: toNumber(p.stock), newStock: 0, oldPrice: toNumber(p.price),
        note: 'позиция отсутствует в текущей выгрузке'
      });
    }
  }
  return changes;
}
async function commitOps(db, ops){
  for (let i = 0; i < ops.length; i += MAX_BATCH) {
    const batch = db.batch();
    for (const op of ops.slice(i, i + MAX_BATCH)) batch.set(op.ref, op.data, op.options || {});
    await batch.commit();
  }
}
async function saveRun(db, products, changes){
  const now = admin ? admin.firestore.Timestamp.now() : new Date();
  const createdAtTs = Date.now();
  const runRef = db.collection(RUNS_COLLECTION).doc();
  const totalUnits = products.reduce((s,p) => s + Math.max(0, toNumber(p.stock)), 0);
  const inStockPositions = products.filter(p => toNumber(p.stock) > 0).length;
  const stockValue = products.reduce((s,p) => s + Math.max(0, toNumber(p.stock)) * toNumber(p.price), 0);
  const newPositions = changes.filter(c => c.type === 'added').length;
  const soldUnits = changes.filter(c => c.type === 'sale').reduce((s,c) => s + toNumber(c.quantity), 0);
  const receivedUnits = changes.filter(c => c.type === 'receipt').reduce((s,c) => s + toNumber(c.quantity), 0);

  await runRef.set({
    createdAt: now,
    createdAtTs,
    createdAtText: new Date(createdAtTs).toLocaleString('ru-RU'),
    count: products.length,
    totalPositions: products.length,
    inStockPositions,
    totalUnits,
    stockValue,
    newPositions,
    soldUnits,
    receivedUnits,
    changesCount: changes.length,
    source: '1c',
    status: 'success'
  });

  const itemOps = products.map(p => ({
    ref: runRef.collection('items').doc(safeDocId(p.id)),
    data: { ...p, runId: runRef.id }
  }));
  await commitOps(db, itemOps);

  const changeOps = changes.map(c => ({
    ref: db.collection(CHANGES_COLLECTION).doc(),
    data: { ...c, runId: runRef.id, source: '1c', createdAt: now, createdAtTs, detectedAt: now }
  }));
  await commitOps(db, changeOps);
  return runRef.id;
}
async function buildRecommendations(db, products){
  const since = Date.now() - 30 * 86400000;
  const snap = await db.collection(CHANGES_COLLECTION).where('createdAtTs', '>=', since).get();
  const sales = new Map();
  snap.forEach(doc => {
    const c = doc.data() || {};
    if (c.type !== 'sale') return;
    const id = String(c.productId || '');
    if (!id) return;
    sales.set(id, (sales.get(id) || 0) + toNumber(c.quantity || c.soldQty));
  });

  const ops = [];
  const activeIds = new Set();
  for (const p of products) {
    const sold30 = sales.get(String(p.id)) || 0;
    const avgDay = sold30 / 30;
    const targetDays = 30;
    const safetyStock = Math.ceil(avgDay * 7);
    const targetStock = Math.ceil(avgDay * targetDays) + safetyStock;
    const recommendedQty = Math.max(0, targetStock - toNumber(p.stock));
    if (recommendedQty <= 0 && p.stock > 3) continue;
    const id = safeDocId(p.id);
    activeIds.add(id);
    ops.push({
      ref: db.collection(RECOMMENDATIONS_COLLECTION).doc(id),
      data: {
        productId: p.id, title: p.title, code: p.code, brand: p.brand, group: p.group,
        currentStock: p.stock, sold30, avgDay, targetDays, safetyStock,
        recommendedQty: Math.max(recommendedQty, p.stock <= 0 && sold30 > 0 ? Math.ceil(sold30) : 0),
        reason: p.stock <= 0 ? 'товар закончился' : p.stock <= 3 ? 'низкий остаток' : 'прогноз продаж',
        updatedAtTs: Date.now(), active: true
      },
      options: { merge: true }
    });
  }
  await commitOps(db, ops);
  return ops.length;
}
async function runProductAnalyticsSnapshot(db){
  if (!db) throw new Error('Firestore db не передан');
  if (!admin) throw new Error('firebase-admin не установлен');
  const products = await getAllProducts(db);
  const lastRun = await getLastRun(db);
  const previous = lastRun ? await getRunItems(db, lastRun.id) : [];
  const changes = previous.length ? compareProducts(previous, products) : products.map(p => ({
    type: 'added', productId: p.id, title: p.title, code: p.code, brand: p.brand, group: p.group,
    oldStock: 0, newStock: p.stock, quantity: p.stock, newPrice: p.price,
    note: `первая база: ${p.stock} шт.`
  }));
  const runId = await saveRun(db, products, changes);
  const recommendations = await buildRecommendations(db, products);
  const totalUnits = products.reduce((s,p) => s + Math.max(0, toNumber(p.stock)), 0);
  console.log(`[AutoStyle analytics] run=${runId}; позиций=${products.length}; единиц=${totalUnits}; изменений=${changes.length}; рекомендаций=${recommendations}`);
  return { runId, positions: products.length, totalUnits, changes: changes.length, recommendations };
}
module.exports = { runProductAnalyticsSnapshot };

if (require.main === module) {
  (async () => {
    if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.applicationDefault() });
    await runProductAnalyticsSnapshot(admin.firestore());
    process.exit(0);
  })().catch(err => { console.error(err); process.exit(1); });
}
