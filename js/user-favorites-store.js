import { auth, db, COLLECTIONS } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  arrayRemove,
  arrayUnion,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const USERS_COLLECTION = COLLECTIONS.users || 'autostyle_users';
const PROFILE_FIELD = 'favorites';
const GUEST_KEY = 'autostyle_guest_favorites';
const ACTIVE_CACHE_KEY = 'favorites';
const ALT_ACTIVE_CACHE_KEY = 'autostyle_favorites';
const ACTIVE_OWNER_KEY = 'autostyle_favorites_owner';

const listeners = new Set();
let favoriteIds = [];
let activeUserId = null;
let stopProfileWatch = null;
let authRevision = 0;
let activationPromise = Promise.resolve();
let resolveInitialReady;
let initialReadyResolved = false;

const initialReady = new Promise(resolve => {
  resolveInitialReady = resolve;
});

function normalizeIds(...lists) {
  const seen = new Set();
  const result = [];
  lists.flat().forEach(value => {
    if (value == null || typeof value === 'object') return;
    const id = String(value).trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    result.push(id);
  });
  return result;
}

function readJsonArray(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? normalizeIds(parsed) : [];
  } catch (_) {
    return [];
  }
}

function setStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_) {}
}

function removeStorage(key) {
  try {
    localStorage.removeItem(key);
  } catch (_) {}
}

function readStorage(key) {
  try {
    return localStorage.getItem(key) || '';
  } catch (_) {
    return '';
  }
}

function readGuestFavorites() {
  const savedGuest = readJsonArray(GUEST_KEY);
  const cachedOwner = readStorage(ACTIVE_OWNER_KEY);

  // До появления общего хранилища гостевое избранное лежало в этих двух ключах.
  // Если у кеша уже есть владелец, его содержимое нельзя показывать следующему гостю.
  if (cachedOwner) return savedGuest;
  return normalizeIds(savedGuest, readJsonArray(ACTIVE_CACHE_KEY), readJsonArray(ALT_ACTIVE_CACHE_KEY));
}

function readProfileFavorites(data = {}) {
  if (Array.isArray(data[PROFILE_FIELD])) return normalizeIds(data[PROFILE_FIELD]);
  // Однократная совместимость, если поле раньше называлось иначе.
  return normalizeIds(data.favoriteIds || data.wishlist || []);
}

function writeActiveCache(ids, userId) {
  setStorage(ACTIVE_CACHE_KEY, ids);
  setStorage(ALT_ACTIVE_CACHE_KEY, ids);

  if (userId) {
    try {
      localStorage.setItem(ACTIVE_OWNER_KEY, userId);
    } catch (_) {}
    return;
  }

  setStorage(GUEST_KEY, ids);
  removeStorage(ACTIVE_OWNER_KEY);
}

function updateVisibleCounters(ids) {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('#mFavCount, #asFinalFavBadge, [data-favorites-count]').forEach(node => {
    node.textContent = String(ids.length);
    node.dataset.count = String(ids.length);
  });
}

function publish(ids, userId = activeUserId) {
  favoriteIds = normalizeIds(ids);
  activeUserId = userId || null;
  writeActiveCache(favoriteIds, activeUserId);
  updateVisibleCounters(favoriteIds);

  const detail = {
    ids: [...favoriteIds],
    count: favoriteIds.length,
    userId: activeUserId,
    authenticated: Boolean(activeUserId)
  };

  listeners.forEach(listener => {
    try {
      listener([...favoriteIds], detail);
    } catch (error) {
      console.warn('favorites listener error', error);
    }
  });

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('autostyle-favorites-changed', { detail }));
  }
}

function finishInitialReady() {
  if (initialReadyResolved) return;
  initialReadyResolved = true;
  resolveInitialReady();
}

function stopWatchingProfile() {
  if (!stopProfileWatch) return;
  try {
    stopProfileWatch();
  } catch (_) {}
  stopProfileWatch = null;
}

async function activateFavorites(user, revision) {
  stopWatchingProfile();

  if (!user) {
    publish(readGuestFavorites(), null);
    finishInitialReady();
    return;
  }

  const userId = user.uid;
  const userRef = doc(db, USERS_COLLECTION, userId);
  const guestIds = readGuestFavorites();
  const cachedOwner = readStorage(ACTIVE_OWNER_KEY);
  let profileIds = cachedOwner === userId
    ? normalizeIds(readJsonArray(ACTIVE_CACHE_KEY), readJsonArray(ALT_ACTIVE_CACHE_KEY))
    : [];
  let legacyProfileIds = [];

  // Показываем последний кеш этого же пользователя сразу, пока Firestore отвечает.
  publish(normalizeIds(profileIds, guestIds), userId);

  try {
    const snapshot = await getDoc(userRef);
    if (snapshot.exists()) {
      const data = snapshot.data() || {};
      profileIds = readProfileFavorites(data);
      if (!Array.isArray(data[PROFILE_FIELD])) legacyProfileIds = profileIds;
    } else {
      profileIds = [];
    }
  } catch (error) {
    console.warn('favorites profile load error', error);
  }

  if (revision !== authRevision) return;

  const mergedIds = normalizeIds(profileIds, guestIds);
  publish(mergedIds, userId);

  const idsToMigrate = normalizeIds(guestIds, legacyProfileIds);
  if (idsToMigrate.length) {
    try {
      await setDoc(userRef, {
        [PROFILE_FIELD]: arrayUnion(...idsToMigrate),
        favoritesUpdatedAt: serverTimestamp()
      }, { merge: true });
      if (revision === authRevision) removeStorage(GUEST_KEY);
    } catch (error) {
      // Гостевой список остаётся локально и будет повторно объединён при следующем входе.
      console.warn('favorites profile migration error', error);
    }
  }

  if (revision !== authRevision) return;

  stopProfileWatch = onSnapshot(userRef, snapshot => {
    if (revision !== authRevision || activeUserId !== userId) return;
    const remoteIds = snapshot.exists() ? readProfileFavorites(snapshot.data() || {}) : [];
    const pendingGuestIds = readGuestFavorites();
    publish(normalizeIds(remoteIds, pendingGuestIds), userId);
  }, error => {
    console.warn('favorites profile watch error', error);
  });

  finishInitialReady();
}

onAuthStateChanged(auth, user => {
  const revision = ++authRevision;
  activationPromise = activateFavorites(user || null, revision).catch(error => {
    console.warn('favorites activation error', error);
    if (revision === authRevision) {
      publish(user ? [] : readGuestFavorites(), user?.uid || null);
      finishInitialReady();
    }
  });
});

async function ensureCurrentOwner() {
  await initialReady;
  await activationPromise;

  const expectedUserId = auth.currentUser?.uid || null;
  if (expectedUserId === activeUserId) return;

  const revision = ++authRevision;
  activationPromise = activateFavorites(auth.currentUser || null, revision);
  await activationPromise;
}

export async function waitFavoritesReady() {
  await ensureCurrentOwner();
  return getFavorites();
}

export function getFavorites() {
  return [...favoriteIds];
}

export function isFavorite(productId) {
  return favoriteIds.includes(String(productId || '').trim());
}

export function subscribeFavorites(listener, immediate = true) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  if (immediate) {
    listener(getFavorites(), {
      ids: getFavorites(),
      count: favoriteIds.length,
      userId: activeUserId,
      authenticated: Boolean(activeUserId)
    });
  }
  return () => listeners.delete(listener);
}

export async function toggleFavorite(productId) {
  const id = String(productId || '').trim();
  if (!id) throw new Error('Не удалось определить товар.');

  await ensureCurrentOwner();

  const previousIds = getFavorites();
  const wasFavorite = previousIds.includes(id);
  const nextIds = wasFavorite
    ? previousIds.filter(value => value !== id)
    : normalizeIds(previousIds, [id]);

  publish(nextIds, activeUserId);

  if (!auth.currentUser || !activeUserId) {
    return !wasFavorite;
  }

  const userRef = doc(db, USERS_COLLECTION, auth.currentUser.uid);
  try {
    await setDoc(userRef, {
      [PROFILE_FIELD]: wasFavorite ? arrayRemove(id) : arrayUnion(id),
      favoritesUpdatedAt: serverTimestamp()
    }, { merge: true });
    return !wasFavorite;
  } catch (error) {
    publish(previousIds, activeUserId);
    throw error;
  }
}
