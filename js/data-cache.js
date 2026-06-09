import { db, COLLECTIONS } from './firebase.js';
import { collection, getDocs, doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// v5: принудительно сбрасывает старый localStorage-кэш товаров, где могли сохраниться карточки без фото.
const CACHE_PREFIX = 'as_cache_v5:';
const VERSION_KEY = CACHE_PREFIX + 'version';
const SETTINGS_COLLECTION = COLLECTIONS.settings || 'autostyle_settings';
const VERSION_DOC = 'cacheVersion';
const MAX_CACHE_AGE = 7 * 24 * 60 * 60 * 1000;
const REFRESH_INTERVAL = 5 * 60 * 1000;

let versionMemo = { value:null, checkedAt:0 };
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
        value.url, value.src, value.href, value.downloadURL, value.image, value.imageUrl,
        value.photo, value.photoUrl, value.path, value.fullPath
      );
      if (found) return found;
    }
  }
  return '';
}

function resolveProductImage(row){
  return firstString(
    row?.image, row?.imageUrl, row?.photo, row?.photoUrl, row?.img, row?.picture, row?.pictureUrl,
    row?.mainImage, row?.mainImageUrl, row?.thumbnail, row?.thumb, row?.url, row?.downloadURL,
    row?.images, row?.photos, row?.pictures, row?.gallery, row?.files, row?.attachments
  );
}

function normalizeProductRow(row){
  const price = Number(row?.price || 0);
  const old = Number(row?.oldPrice || row?.priceOld || row?.priceBefore || row?.compareAtPrice || 0);
  const image = resolveProductImage(row);
  const normalized = image ? { ...row, image, imageUrl: row?.imageUrl || image, photoUrl: row?.photoUrl || image } : { ...row };
  if (old && old <= price) {
    return { ...normalized, oldPrice: 0, priceOld: 0, priceBefore: 0, compareAtPrice: 0 };
  }
  return normalized;
}

async function fetchCollection(name){
  const snap = await getDocs(collection(db, name));
  const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return name === (COLLECTIONS.products || 'autostyle_products') ? rows.map(normalizeProductRow) : rows;
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

export async function getCollectionCached(name, options={}){
  const force = options.force === true;
  const cacheKey = key(name);
  const cached = readJson(cacheKey, null);
  const age = cached ? now() - Number(cached.savedAt || 0) : Infinity;

  // Mobile-first speed: if local data exists and is not too old, return it immediately.
  // Freshness/version checks happen quietly in the background instead of blocking first paint.
  if (!force && cached && Array.isArray(cached.rows) && age < MAX_CACHE_AGE) {
    if (age > REFRESH_INTERVAL) {
      getRemoteVersion().then(remoteVersion => {
        const currentVersion = readJson(VERSION_KEY, '0');
        if (remoteVersion !== null && String(remoteVersion) !== String(currentVersion)) {
          return fetchCollection(name).then(rows => {
            writeJson(cacheKey, { rows, savedAt: now() });
            writeJson(VERSION_KEY, remoteVersion);
          });
        }
      }).catch(()=>{});
    }
    return cached.rows;
  }

  let remoteVersion = null;
  if (!force) remoteVersion = await getRemoteVersion();
  try{
    const rows = await fetchCollection(name);
    writeJson(cacheKey, { rows, savedAt: now() });
    if (remoteVersion !== null) writeJson(VERSION_KEY, remoteVersion);
    return rows;
  }catch(e){
    if (cached && Array.isArray(cached.rows)) return cached.rows;
    throw e;
  }
}

export function getProducts(options={}){ return getCollectionCached(COLLECTIONS.products, options); }
export function getCategories(options={}){ return getCollectionCached(COLLECTIONS.categories, options); }
export function getBanners(options={}){ return getCollectionCached(COLLECTIONS.banners, options); }
