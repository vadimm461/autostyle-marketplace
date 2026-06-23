import { db, storage, COLLECTIONS } from './firebase.js';
import { collection, getDocs, doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { ref, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';

// v6: новый кэш. Старые v5-данные не используются, чтобы каталог сразу видел новые товары и фото.
const CACHE_PREFIX = 'as_cache_v6:';
const VERSION_KEY = CACHE_PREFIX + 'version';
const SETTINGS_COLLECTION = COLLECTIONS.settings || 'autostyle_settings';
const VERSION_DOC = 'cacheVersion';
// Кэш показываем сразу, чтобы сайт открывался быстро.
// Свежие данные подтягиваются в фоне и обновляют экран.
const MAX_CACHE_AGE = 15 * 60 * 1000;
const REFRESH_INTERVAL = 60 * 1000;

let versionMemo = { value:null, checkedAt:0 };
const refreshLocks = new Map();
function now(){ return Date.now(); }
function key(name){ return CACHE_PREFIX + name; }
function readJson(k, fallback=null){
  try { return JSON.parse(localStorage.getItem(k) || 'null') ?? fallback; } catch(e){ return fallback; }
}
function writeJson(k, value){
  try { localStorage.setItem(k, JSON.stringify(value)); } catch(e){}
}
async function getRemoteVersion(){
  if (versionMemo.value !== null && now() - versionMemo.checkedAt < 5000) return versionMemo.value;
  try{
    const snap = await getDoc(doc(db, SETTINGS_COLLECTION, VERSION_DOC));
    const data = snap.exists() ? snap.data() : null;
    const value = String(data?.value || data?.updatedAt || data?.ts || '0');
    versionMemo = { value, checkedAt: now() };
    return value;
  }catch(e){
    console.warn('Cache version check failed', e);
    return null;
  }
}

function firstString(...values){
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (Array.isArray(value)) {
      const found = firstString(...value);
      if (found) return found;
    }
    if (value && typeof value === 'object') {
      const found = firstString(
        value.url, value.src, value.href, value.downloadURL, value.downloadUrl,
        value.image, value.imageUrl, value.photo, value.photoUrl, value.img, value.picture,
        value.pictureUrl, value.thumbnail, value.thumb, value.path, value.fullPath,
        value.storagePath, value.filePath
      );
      if (found) return found;
    }
  }
  return '';
}

function looksLikeStoragePath(value){
  const v = String(value || '').trim();
  if (!v) return false;
  if (/^(https?:|data:|blob:)/i.test(v)) return false;
  return /^gs:\/\//i.test(v) || v.includes('/') || /^products|^images|^uploads|^goods/i.test(v);
}

async function storageUrl(value){
  const v = String(value || '').trim();
  if (!v || !looksLikeStoragePath(v)) return v;
  try { return await getDownloadURL(ref(storage, v)); } catch(e) { return v; }
}

async function resolveProductImage(row){
  const raw = firstString(
    row?.image, row?.imageUrl, row?.photo, row?.photoUrl, row?.img, row?.picture, row?.pictureUrl,
    row?.mainImage, row?.mainImageUrl, row?.thumbnail, row?.thumb, row?.url, row?.downloadURL, row?.downloadUrl,
    row?.images, row?.photos, row?.pictures, row?.gallery, row?.files, row?.attachments
  );
  return await storageUrl(raw);
}

async function normalizeProductRow(row){
  const price = Number(row?.price || 0);
  const old = Number(row?.oldPrice || row?.priceOld || row?.priceBefore || row?.compareAtPrice || 0);
  const image = await resolveProductImage(row);
  const normalized = image ? { ...row, image, imageUrl: row?.imageUrl || image, photoUrl: row?.photoUrl || image } : { ...row };
  if (old && old <= price) {
    return { ...normalized, oldPrice: 0, priceOld: 0, priceBefore: 0, compareAtPrice: 0 };
  }
  return normalized;
}

async function fetchCollection(name){
  const snap = await getDocs(collection(db, name));
  const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return name === (COLLECTIONS.products || 'autostyle_products') ? await Promise.all(rows.map(normalizeProductRow)) : rows;
}

export async function bumpCacheVersion(reason='update'){
  const value = String(Date.now());
  await setDoc(doc(db, SETTINGS_COLLECTION, VERSION_DOC), {
    value,
    reason,
    updatedAt: new Date().toISOString()
  }, { merge:true });
  return value;
}

export function clearDataCache(){
  Object.keys(localStorage).forEach(k => { if (k.startsWith(CACHE_PREFIX)) localStorage.removeItem(k); });
}

function emitCacheUpdate(name, rows){
  try {
    window.dispatchEvent(new CustomEvent('autostyle-cache-updated', { detail: { name, rows } }));
  } catch(e) {}
}

async function refreshCollectionInBackground(name, cacheKey){
  if (refreshLocks.get(name)) return;
  refreshLocks.set(name, true);
  try{
    const rows = await fetchCollection(name);
    writeJson(cacheKey, { rows, savedAt: now() });
    emitCacheUpdate(name, rows);
  }catch(e){
    console.warn('Фоновое обновление кэша не удалось:', name, e);
  }finally{
    refreshLocks.delete(name);
  }
}

export async function getCollectionCached(name, options={}){
  const force = options.force === true;
  const cacheKey = key(name);
  const cached = readJson(cacheKey, null);
  const hasCache = cached && Array.isArray(cached.rows);
  const age = hasCache ? now() - Number(cached.savedAt || 0) : Infinity;

  // force — сразу свежие данные с Firestore.
  if (force) {
    const rows = await fetchCollection(name);
    writeJson(cacheKey, { rows, savedAt: now() });
    return rows;
  }

  // Быстрый старт: сразу отдаём localStorage, а Firestore проверяем в фоне.
  if (hasCache) {
    if (age > REFRESH_INTERVAL) refreshCollectionInBackground(name, cacheKey);
    return cached.rows;
  }

  // Первый заход без кэша — грузим Firestore один раз.
  const rows = await fetchCollection(name);
  writeJson(cacheKey, { rows, savedAt: now() });
  return rows;
}

export function getProducts(options={}){ return getCollectionCached(COLLECTIONS.products, options); }
export function getCategories(options={}){ return getCollectionCached(COLLECTIONS.categories, options); }
export function getBanners(options={}){ return getCollectionCached(COLLECTIONS.banners, options); }
