import { db, storage, COLLECTIONS } from './firebase.js';
import { collection, getDocs, doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { ref, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';

// v7: быстрый кэш + глобальная версия из Firestore.
// Админка меняет autostyle_settings/cacheVersion.value — у всех пользователей сайт видит новую версию и обновляет кэш.
const CACHE_PREFIX = 'as_cache_v7:';
const VERSION_KEY = CACHE_PREFIX + 'siteVersion';
const SETTINGS_COLLECTION = COLLECTIONS.settings || 'autostyle_settings';
const VERSION_DOC = 'cacheVersion';
const MAX_CACHE_AGE = 15 * 60 * 1000; // 15 минут — под выгрузку из 1С
const VERSION_CHECK_TTL = 10 * 1000;

let versionMemo = { value: null, checkedAt: 0 };

function now(){ return Date.now(); }
function key(name){ return CACHE_PREFIX + name; }

function readJson(k, fallback=null){
  try { return JSON.parse(localStorage.getItem(k) || 'null') ?? fallback; } catch(e){ return fallback; }
}
function writeJson(k, value){
  try { localStorage.setItem(k, JSON.stringify(value)); } catch(e){}
}
function safeString(value){ return value === undefined || value === null ? '' : String(value); }

async function getRemoteVersion(force=false){
  if (!force && versionMemo.value !== null && now() - versionMemo.checkedAt < VERSION_CHECK_TTL) return versionMemo.value;
  try{
    const snap = await getDoc(doc(db, SETTINGS_COLLECTION, VERSION_DOC));
    const data = snap.exists() ? snap.data() : null;
    const value = safeString(data?.value || data?.version || data?.updatedAt || data?.ts || '0');
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

export async function bumpCacheVersion(reason='admin-force-refresh'){
  const value = String(Date.now());
  await setDoc(doc(db, SETTINGS_COLLECTION, VERSION_DOC), {
    value,
    version: value,
    reason,
    updatedAt: new Date().toISOString()
  }, { merge:true });
  versionMemo = { value, checkedAt: now() };
  try { localStorage.setItem(VERSION_KEY, value); } catch(e) {}
  return value;
}

export function clearDataCache(){
  try {
    Object.keys(localStorage).forEach(k => { if (k.startsWith(CACHE_PREFIX) || k.startsWith('as_cache_v5:') || k.startsWith('as_cache_v6:')) localStorage.removeItem(k); });
  } catch(e) {}
}

export async function getCollectionCached(name, options={}){
  const force = options.force === true;
  const cacheKey = key(name);
  const cached = readJson(cacheKey, null);
  const age = cached ? now() - Number(cached.savedAt || 0) : Infinity;

  let remoteVersion = null;
  if (!force) remoteVersion = await getRemoteVersion();

  // Быстрый старт: если версия сайта не изменилась и кэш свежий — сразу отдаём его.
  if (!force && cached && Array.isArray(cached.rows) && age < MAX_CACHE_AGE) {
    const cachedVersion = safeString(cached.version || localStorage.getItem(VERSION_KEY) || '0');
    if (remoteVersion === null || cachedVersion === safeString(remoteVersion || '0')) {
      return cached.rows;
    }
  }

  // Если админ нажал принудительное обновление — version поменяется, этот блок загрузит свежие данные.
  try{
    const rows = await fetchCollection(name);
    const saveVersion = safeString(remoteVersion || await getRemoteVersion(true) || '0');
    writeJson(cacheKey, { rows, savedAt: now(), version: saveVersion });
    try { localStorage.setItem(VERSION_KEY, saveVersion); } catch(e) {}
    return rows;
  }catch(e){
    if (cached && Array.isArray(cached.rows)) return cached.rows;
    throw e;
  }
}

export function getProducts(options={}){ return getCollectionCached(COLLECTIONS.products, options); }
export function getCategories(options={}){ return getCollectionCached(COLLECTIONS.categories, options); }
export function getBanners(options={}){ return getCollectionCached(COLLECTIONS.banners, options); }
