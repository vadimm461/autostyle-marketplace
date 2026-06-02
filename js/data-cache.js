import { db, COLLECTIONS } from './firebase.js';
import { collection, getDocs, doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const CACHE_PREFIX = 'as_cache_v2:';
const VERSION_KEY = CACHE_PREFIX + 'version';
const SETTINGS_COLLECTION = COLLECTIONS.settings || 'autostyle_settings';
const VERSION_DOC = 'cacheVersion';
const MAX_CACHE_AGE = 24 * 60 * 60 * 1000;
const REFRESH_INTERVAL = 2 * 60 * 1000;

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
async function fetchCollection(name){
  const snap = await getDocs(collection(db, name));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
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
  const currentVersion = readJson(VERSION_KEY, '0');
  const age = cached ? now() - Number(cached.savedAt || 0) : Infinity;

  let remoteVersion = null;
  if (!force) remoteVersion = await getRemoteVersion();

  const versionOk = remoteVersion === null || String(remoteVersion) === String(currentVersion);
  const cacheOk = cached && Array.isArray(cached.rows) && age < MAX_CACHE_AGE && versionOk;
  if (!force && cacheOk) {
    if (age > REFRESH_INTERVAL && remoteVersion !== null) {
      fetchCollection(name).then(rows => {
        writeJson(cacheKey, { rows, savedAt: now() });
      }).catch(()=>{});
    }
    return cached.rows;
  }

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
