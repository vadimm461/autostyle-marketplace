import { auth, db, storage, COLLECTIONS } from './firebase.js';
import { bumpCacheVersion, clearDataCache } from './data-cache.js';

import {
  onAuthStateChanged,
  signOut
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

import {
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
  setDoc,
  query,
  where,
  limit,
  orderBy,
  deleteField
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

import {
  ref,
  uploadBytesResumable,
  getDownloadURL
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

async function markSiteDataChanged(){
  try { await bumpCacheVersion('admin-update'); } catch(e) { console.warn('Не удалось обновить версию кэша', e); }
  try { clearDataCache(); } catch(e) {}
}


let editing = {
  product: null,
  cat: null,
  banner: null,
  homeBlock: null,
  promoCard: null
};

let allCatsCache = [];
let allProductsCache = [];
let allHomeBlocksCache = [];
let allPromoCardsCache = [];
const HOME_BLOCKS_COLLECTION = COLLECTIONS.homeBlocks || 'autostyle_home_blocks';
const PROMO_CARDS_COLLECTION = COLLECTIONS.promoCards || 'autostyle_promo_cards';
const PROMO_CARDS_COLLECTIONS = [...new Set([
  PROMO_CARDS_COLLECTION,
  'autostyle_promo_cards',
  'autostyle_promoCards',
  'autostyle_home_cards',
  'promoCards',
  'homeCards'
].filter(Boolean))];

function val(id) {
  const el = $(id);
  return el ? String(el.value || '').trim() : '';
}

function setVal(id, value) {
  const el = $(id);
  if (el) el.value = value ?? '';
}

function sortByOrder(arr) {
  return [...arr].sort((a, b) => {
    const ao = Number(a.order ?? 999999);
    const bo = Number(b.order ?? 999999);
    if (ao !== bo) return ao - bo;
    return String(a.title || '').localeCompare(String(b.title || b.name || ''), 'ru');
  });
}

function defaultHomeBlocks() {
  return [
    { id: 'new', key: 'new', title: 'Новинки', order: 1, builtin: true, enabled: true },
    { id: 'recentlyViewed', key: 'recentlyViewed', title: 'Недавно просмотренные', order: 2, builtin: true, enabled: true },
    { id: 'bestsellers', key: 'bestsellers', title: 'Лидеры продаж', order: 3, builtin: true, enabled: true },
    { id: 'hot', key: 'hot', title: 'Горячие предложения', order: 4, builtin: true, enabled: true }
  ];
}

function slugifyBlock(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'e')
    .replace(/[^a-zа-я0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '') || `block-${Date.now()}`;
}

function mergedHomeBlocks(includeDisabled = false) {
  const map = new Map();
  defaultHomeBlocks().forEach(b => map.set(b.key, b));
  allHomeBlocksCache.forEach(b => {
    const key = b.key || b.slug || b.id;
    if (!key) return;
    const base = map.get(key) || {};
    map.set(key, {
      ...base,
      ...b,
      id: b.id || base.id || key,
      key,
      title: b.title || b.name || base.title || key,
      order: Number(b.order ?? base.order ?? 999),
      enabled: b.enabled !== false,
      builtin: base.builtin === true || b.builtin === true
    });
  });
  return [...map.values()]
    .filter(b => includeDisabled || b.enabled !== false)
    .sort((a,b) => Number(a.order ?? 999) - Number(b.order ?? 999) || String(a.title || '').localeCompare(String(b.title || ''), 'ru'));
}

async function loadHomeBlocks() {
  try {
    // Только читаем блоки. Не создаём системные документы автоматически,
    // потому что при закрытых правилах Firestore это ломало страницу ошибкой permissions.
    allHomeBlocksCache = sortByOrder(await getCollection(HOME_BLOCKS_COLLECTION));
  }
  catch (e) { console.warn('home blocks load error', e); allHomeBlocksCache = []; }
}

function renderHomeSectionOptions() {
  const selects = [$('#pHomeSection')].filter(Boolean);
  if (!selects.length) return;
  const opts = mergedHomeBlocks().map(b => `<option value="${b.key}">${b.title}</option>`).join('');
  selects.forEach(select => {
    const current = select.value;
    select.innerHTML = opts;
    if (current && [...select.options].some(o => o.value === current)) select.value = current;
  });
}

function defaultPromoCards() {
  // Старые системные промо-карточки убраны.
  // В админке отображаются и редактируются только карточки из Firestore.
  return [];
}

async function loadPromoCards() {
  const result = [];

  for (const colName of PROMO_CARDS_COLLECTIONS) {
    try {
      const rows = await getCollection(colName);
      rows.forEach(row => result.push({ ...row, _collection: colName }));
    } catch (e) {
      console.warn('promo cards load error', colName, e);
    }
  }

  const seen = new Set();
  allPromoCardsCache = sortByOrder(result.filter(card => {
    const key = String(card.key || card.slug || card.id || '').trim();
    const uniq = key || `${card._collection}:${card.id}`;
    if (seen.has(uniq)) return false;
    seen.add(uniq);
    return true;
  }));
}

function mergedPromoCards() {
  const map = new Map();
  defaultPromoCards().forEach(card => map.set(card.key, card));
  allPromoCardsCache.forEach(card => {
    const key = card.key || card.slug || card.id;
    if (!key) return;
    map.set(key, {
      ...card,
      key,
      title: card.title || card.name || key,
      text: card.text || card.description || '',
      amount: card.amount || card.countText || '',
      image: card.image || card.imageUrl || card.photoUrl || '',
      link: card.link || card.url || '#',
      width: Number(card.width || card.cardWidth || 0) || '',
      height: Number(card.height || card.cardHeight || 0) || '',
      order: Number(card.order ?? 999),
      enabled: card.enabled !== false,
      builtin: false
    });
  });
  return [...map.values()].filter(card => card.enabled !== false).sort((a,b) => Number(a.order ?? 999) - Number(b.order ?? 999));
}


async function getCollection(name) {
  const snap = await getDocs(collection(db, name));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function uploadImage(inputId, folder, targetInputId, statusId) {
  return new Promise((resolve, reject) => {
    const input = $(inputId);
    const targetInput = $(targetInputId);
    const statusBox = $(statusId);

    if (!input || !input.files || !input.files[0]) {
      resolve('');
      return;
    }

    const file = input.files[0];
    const safeName = file.name.replace(/[^\w.\-а-яА-ЯёЁ]/g, '_');
    const fileName = `${folder}/${Date.now()}-${safeName}`;
    const fileRef = ref(storage, fileName);

    if (statusBox) {
      statusBox.innerHTML = `
        <div class="upload-status">
          <div class="upload-status-top">
            <b>Загрузка фото...</b>
            <span>0%</span>
          </div>
          <div class="upload-progress"><div style="width:0%"></div></div>
        </div>
      `;
    }

    const task = uploadBytesResumable(fileRef, file);

    task.on(
      'state_changed',
      snapshot => {
        const percent = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        if (statusBox) {
          const bar = statusBox.querySelector('.upload-progress div');
          const text = statusBox.querySelector('.upload-status-top span');
          if (bar) bar.style.width = percent + '%';
          if (text) text.textContent = percent + '%';
        }
      },
      error => {
        if (statusBox) {
          statusBox.innerHTML = `<div class="upload-error">Ошибка загрузки: ${error.message}</div>`;
        }
        reject(error);
      },
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        if (targetInput) targetInput.value = url;
        if (statusBox) statusBox.innerHTML = `<div class="upload-success">Фото загружено. URL вставлен в поле.</div>`;
        resolve(url);
      }
    );
  });
}

function uploadImageFromElements(input, folder, targetInput, statusBox) {
  return new Promise((resolve, reject) => {
    if (!input || !input.files || !input.files[0]) {
      resolve('');
      return;
    }

    const file = input.files[0];
    const safeName = file.name.replace(/[^\w.\-а-яА-ЯёЁ]/g, '_');
    const fileName = `${folder}/${Date.now()}-${safeName}`;
    const fileRef = ref(storage, fileName);

    if (statusBox) {
      statusBox.innerHTML = `
        <div class="upload-status">
          <div class="upload-status-top">
            <b>Загрузка фото...</b>
            <span>0%</span>
          </div>
          <div class="upload-progress"><div style="width:0%"></div></div>
        </div>
      `;
    }

    const task = uploadBytesResumable(fileRef, file);
    task.on(
      'state_changed',
      snapshot => {
        const percent = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        if (statusBox) {
          const bar = statusBox.querySelector('.upload-progress div');
          const text = statusBox.querySelector('.upload-status-top span');
          if (bar) bar.style.width = percent + '%';
          if (text) text.textContent = percent + '%';
        }
      },
      error => {
        if (statusBox) statusBox.innerHTML = `<div class="upload-error">Ошибка загрузки: ${error.message}</div>`;
        reject(error);
      },
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        if (targetInput) targetInput.value = url;
        if (statusBox) statusBox.innerHTML = `<div class="upload-success">Фото загружено. URL вставлен в поле.</div>`;
        resolve(url);
      }
    );
  });
}

/* MENU */

function openSection(id) {
  $$('.admin-section').forEach(sec => sec.classList.remove('active'));
  const target = document.getElementById(id);
  if (target) target.classList.add('active');

  $$('.admin-nav button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.section === id);
  });
}

$$('[data-section]').forEach(btn => {
  btn.addEventListener('click', e => {
    e.preventDefault();
    openSection(btn.dataset.section);
  });
});

if ($('#logout')) {
  $('#logout').onclick = () => {
    signOut(auth).then(() => location.href = 'index.html');
  };
}

onAuthStateChanged(auth, user => {
  if (!user) {
    location.href = 'index.html';
    return;
  }

  renderCats();
  renderProducts();
  renderBanners();
  renderOrdersAdmin();
});


/* ORDERS */

const ORDER_STATUS = {
  new: 'Новый',
  processing: 'В обработке',
  ready: 'Готов к выдаче',
  done: 'Выдан',
  canceled: 'Отменён'
};

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
}

function formatMoney(value) {
  return `${Math.round(Number(value || 0)).toLocaleString('ru-RU')} ₽`;
}

function formatDate(value) {
  try {
    const date = value?.toDate ? value.toDate() : new Date(value || Date.now());
    return date.toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
  } catch {
    return '';
  }
}

async function renderOrdersAdmin() {
  const list = $('#orderList');
  if (!list) return;
  list.innerHTML = '<div class="muted">Загружаю заказы...</div>';

  try {
    let orders = [];
    try {
      const snap = await getDocs(query(collection(db, COLLECTIONS.orders || 'autostyle_orders'), orderBy('createdAt', 'desc')));
      orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err) {
      console.warn('orders ordered query failed, fallback', err);
      orders = await getCollection(COLLECTIONS.orders || 'autostyle_orders');
      orders.sort((a, b) => String(b.createdAtText || '').localeCompare(String(a.createdAtText || '')));
    }

    if (!orders.length) {
      list.innerHTML = '<div class="orders-empty">Заказов пока нет.</div>';
      return;
    }

    list.innerHTML = orders.map(order => {
      const items = Array.isArray(order.items) ? order.items : [];
      const status = order.status || 'new';
      const inst = order.installment?.bank ? ` · Рассрочка: ${esc(order.installment.bank)}` : '';
      return `
        <article class="admin-order-card ${status === 'new' ? 'is-new' : ''}">
          <div class="admin-order-head">
            <div>
              <h3>${esc(order.orderNumber || order.id)}</h3>
              <p>${formatDate(order.createdAt || order.createdAtText)} · ${esc(order.userName || order.userEmail || 'Покупатель')}${inst}</p>
            </div>
            <div class="admin-order-total">${formatMoney(order.total)}</div>
          </div>
          <div class="admin-order-user">
            <span>Email: <b>${esc(order.userEmail || '—')}</b></span>
            <span>Телефон: <b>${esc(order.userPhone || '—')}</b></span>
            <span>Товаров: <b>${Number(order.totalQty || items.reduce((s, x) => s + Number(x.qty || 0), 0))}</b></span>
          </div>
          <div class="admin-order-items">
            ${items.map(item => `
              <div class="admin-order-item">
                <div class="admin-order-item-img">${item.image ? `<img src="${esc(item.image)}" alt="">` : 'Фото'}</div>
                <div>
                  <b>${esc(item.title)}</b>
                  <p>${esc(item.group || '')}${item.code ? ` · код: ${esc(item.code)}` : ''}</p>
                </div>
                <strong>${Number(item.qty || 1)} × ${formatMoney(item.price)} = ${formatMoney(item.lineTotal)}</strong>
              </div>`).join('')}
          </div>
          <div class="admin-order-actions">
            <label>Статус
              <select data-order-status="${esc(order.id)}">
                ${Object.entries(ORDER_STATUS).map(([key, title]) => `<option value="${key}" ${key === status ? 'selected' : ''}>${title}</option>`).join('')}
              </select>
            </label>
            <button class="danger" type="button" data-order-delete="${esc(order.id)}">Удалить</button>
          </div>
        </article>`;
    }).join('');

    list.querySelectorAll('[data-order-status]').forEach(select => {
      select.onchange = async () => {
        const id = select.dataset.orderStatus;
        await updateDoc(doc(db, COLLECTIONS.orders || 'autostyle_orders', id), {
          status: select.value,
          statusTitle: ORDER_STATUS[select.value] || select.value,
          updatedAt: new Date().toISOString()
        });
        renderOrdersAdmin();
      };
    });

    list.querySelectorAll('[data-order-delete]').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('Удалить заказ?')) return;
        await deleteDoc(doc(db, COLLECTIONS.orders || 'autostyle_orders', btn.dataset.orderDelete));
        renderOrdersAdmin();
      };
    });
  } catch (err) {
    console.error('orders render error', err);
    list.innerHTML = `<div class="upload-error">Ошибка загрузки заказов: ${esc(err.message || err)}</div>`;
  }
}

/* CATEGORY OPTIONS */

function normalizeCatTitle(value) {
  return String(value || '').trim();
}

function buildCategoryOptions(cats) {
  const map = new Map();

  // 1) Категории из раздела "Категории"
  sortByOrder(cats || []).forEach(cat => {
    const title = normalizeCatTitle(cat.title || cat.name);
    if (!title || title === 'Без названия') return;

    const parent = (cats || []).find(p => p.id === cat.parentId || p.externalId === cat.parentId);
    const parentTitle = parent ? normalizeCatTitle(parent.title || parent.name) : '';

    const label = parentTitle
      ? `${Number(cat.order ?? 0)} — ${parentTitle} / ${title}`
      : `${Number(cat.order ?? 0)} — ${title}`;

    map.set(title.toLowerCase(), {
      value: title,
      label,
      order: Number(cat.order ?? 999999)
    });
  });

  // 2) Все группы/категории из самих товаров.
  // Отсюда берутся не только основные категории, но и подгруппы:
  // "Автохимия 3TON", "Автохимия ATAS", "Автохимия LAVR" и т.д.
  (allProductsCache || []).forEach(product => {
    [product.category, product.group, product.categoryName].forEach(rawTitle => {
      const title = normalizeCatTitle(rawTitle);
      if (!title || title === 'Без категории' || title === 'Без группы') return;

      if (!map.has(title.toLowerCase())) {
        map.set(title.toLowerCase(), {
          value: title,
          label: title,
          order: 999999
        });
      }
    });
  });

  return [...map.values()]
    .sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.value.localeCompare(b.value, 'ru');
    })
    .map(cat => `<option value="${cat.value}">${cat.label}</option>`)
    .join('');
}

async function renderCategoryOptions() {
  await loadHomeBlocks();
  renderHomeSectionOptions();
  const select = $('#pCategory');
  const filter = $('#productCategoryFilter');
  const importCategory = $('#importCategory');

  if (!select && !filter && !importCategory) return;

  if (!allCatsCache.length) {
    allCatsCache = sortByOrder(await getCollection(COLLECTIONS.categories));
  }

  const options = buildCategoryOptions(allCatsCache);

  if (select) {
    const current = select.value;
    select.innerHTML = `<option value="">Выберите категорию</option>${options}`;
    select.value = current;
  }

  if (filter) {
    const current = filter.value;
    filter.innerHTML = `<option value="">Все категории</option>${options}`;
    filter.value = current;
  }

  if (importCategory) {
    const current = importCategory.value;
    importCategory.innerHTML = `<option value="">Без категории</option>${options}`;
    importCategory.value = current;
  }
}

/* PRODUCTS */

async function renderProducts() {
  const list = $('#productList');
  if (!list) return;

  try {
    if (!allCatsCache.length) {
      allCatsCache = sortByOrder(await getCollection(COLLECTIONS.categories));
    }

    allProductsCache = await getCollection(COLLECTIONS.products);
    await renderCategoryOptions();
    renderProductList();
  } catch (err) {
    console.error(err);
    alert('Ошибка загрузки товаров: ' + err.message);
  }
}

function renderProductList() {
  const list = $('#productList');
  if (!list) return;

  const queryText = val('#productSearch').toLowerCase();
  const category = val('#productCategoryFilter');
  const tag = val('#productTagFilter');

  const arr = allProductsCache.filter(p => {
    const text = `${p.code || ''} ${p.title || ''} ${p.category || ''} ${p.description || ''}`.toLowerCase();
    if (queryText && !text.includes(queryText)) return false;
    if (category && p.category !== category && p.group !== category && p.categoryName !== category) return false;
    if (tag && p.tag !== tag) return false;
    return true;
  });

  list.innerHTML = arr.length
    ? arr.map(x => `
      <div class="row admin-product-row">
        <div class="admin-product-img">
          ${x.image ? `<img src="${x.image}" alt="${x.title || 'Товар'}">` : `<span>Фото</span>`}
        </div>

        <div class="admin-product-info">
          <b class="admin-product-title">${x.title || 'Без названия'}</b>

          <div class="admin-product-meta">
            <span class="admin-badge">Группа: ${x.group || x.category || 'Без группы'}</span>
            <span class="admin-badge">${x.category || 'Без категории'}</span>
            <span class="admin-badge">${x.tag || 'hot'}</span>
            <span class="admin-badge">Наличие: ${Number(x.stock ?? x.quantity ?? x.count ?? 0)} шт.</span>
            ${x.showOnHome ? `<span class="admin-badge admin-badge-home">На главной</span>` : ''}
            ${(x.installment || x.installmentAvailable) ? `<span class="admin-badge">Рассрочка</span>` : ''}
            <span class="admin-price">${Number(x.price || 0).toLocaleString('ru-RU')} ₽</span>
          </div>

          <p class="muted">${x.description || 'Описание не добавлено'}</p>
        </div>

        <button class="edit" data-editp="${x.id}">Редактировать</button>
        <button class="danger" data-delp="${x.id}">Удалить</button>
        <div class="inline-product-editor-slot" data-editor-slot="${x.id}"></div>
      </div>
    `).join('')
    : '<p class="muted">Товары не найдены</p>';

  $$('[data-delp]').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('Удалить товар?')) return;
      await deleteDoc(doc(db, COLLECTIONS.products, btn.dataset.delp));
      await markSiteDataChanged();
      try { Object.keys(localStorage).forEach(k => { if (k.startsWith('as_cache_')) localStorage.removeItem(k); }); } catch(e) {}
      await renderProducts();
    };
  });

  $$('[data-editp]').forEach(btn => {
    btn.onclick = () => {
      const item = allProductsCache.find(x => x.id === btn.dataset.editp);
      if (!item) return;
      openInlineProductEditor(item, btn.closest('.admin-product-row'));
    };
  });
}

function inlineProductField(form, name) {
  const el = form.querySelector(`[name="${name}"]`);
  return el ? String(el.value || '').trim() : '';
}

function inlineProductChecked(form, name) {
  const el = form.querySelector(`[name="${name}"]`);
  return el ? el.checked : false;
}

function openInlineProductEditor(item, row) {
  if (!row) return;

  document.querySelectorAll('.inline-product-editor-slot').forEach(slot => {
    slot.innerHTML = '';
  });

  row.classList.add('admin-product-row-editing');
  const slot = row.querySelector('[data-editor-slot]');
  if (!slot) return;

  const categoryOptions = buildCategoryOptions(allCatsCache);
  const currentCategory = item.category || item.group || '';
  const currentTag = item.tag || 'hot';
  const currentHomeSection = item.homeSection || item.tag || 'hot';
  const oldPrice = item.oldPrice || item.priceOld || item.compareAtPrice || item.priceBefore || '';
  const discount = item.discount || item.discountPercent || item.discount_percent || item.salePercent || '';

  slot.innerHTML = `
    <form class="inline-product-editor">
      <div class="inline-editor-head">
        <div>
          <b>Редактирование товара</b>
          <span>${item.title || 'Без названия'}</span>
        </div>
        <button type="button" class="inline-editor-close">Закрыть</button>
      </div>

      <div class="inline-editor-grid">
        <label class="field field-wide">Название<input name="title" required value="${String(item.title || '').replace(/"/g, '&quot;')}"></label>
        <label class="field field-wide">Группа<input name="group" value="${String(item.group || item.category || '').replace(/"/g, '&quot;')}"></label>

        <label class="field field-four">Цена<input name="price" type="number" required value="${Number(item.price || 0)}"></label>
        <label class="field field-four">Скидка, %<input name="discount" type="number" value="${discount}"></label>
        <label class="field field-four">Старая цена<input name="oldPrice" type="number" value="${oldPrice}"></label>
        <label class="field field-four">Наличие, шт.<input name="stock" type="number" value="${item.stock ?? item.quantity ?? item.count ?? ''}"></label>

        <label class="field">Категория<select name="category"><option value="">Выберите категорию</option>${categoryOptions}</select></label>
        <label class="field">Блок на главной<select name="homeSection"><option value="hot">Горячие предложения</option><option value="new">Новинки</option><option value="bestsellers">Лидеры продаж</option></select></label>
        <label class="field">Метка товара<select name="tag"><option value="hot">Горячие предложения</option><option value="new">Новинки</option><option value="best">Лидеры продаж</option></select></label>

        <div class="checks-row inline-checks">
          <label class="field check-field"><span>Показывать на главной</span><input name="showOnHome" type="checkbox" ${item.showOnHome === true ? 'checked' : ''}></label>
          <label class="field check-field"><span>Доступно в рассрочку</span><input name="installment" type="checkbox" ${(item.installment || item.installmentAvailable) ? 'checked' : ''}></label>
        </div>

        <label class="field field-full">Фото URL<input name="image" value="${String(item.image || '').replace(/"/g, '&quot;')}"></label>
        <label class="field field-full">Загрузить фото<input name="file" type="file" accept="image/*"></label>
        <div class="upload-box inline-upload-status field-full"></div>
        <label class="field field-full">Описание<textarea name="description">${String(item.description || '').replace(/</g, '&lt;')}</textarea></label>
      </div>

      <div class="inline-editor-actions">
        <button class="primary" type="submit">Сохранить изменения</button>
        <button class="edit" type="button" data-cancel-inline>Отмена</button>
      </div>
    </form>
  `;

  const form = slot.querySelector('form');
  const catSelect = form.querySelector('[name="category"]');
  const tagSelect = form.querySelector('[name="tag"]');
  const homeSelect = form.querySelector('[name="homeSection"]');
  if (catSelect) catSelect.value = currentCategory;
  if (tagSelect) tagSelect.value = currentTag;
  if (homeSelect) homeSelect.value = currentHomeSection;

  slot.querySelector('.inline-editor-close').onclick = () => closeInlineProductEditor(row);
  slot.querySelector('[data-cancel-inline]').onclick = () => closeInlineProductEditor(row);

  form.onsubmit = async e => {
    e.preventDefault();
    await saveInlineProductEditor(item.id, form);
  };
}

function closeInlineProductEditor(row) {
  if (row) row.classList.remove('admin-product-row-editing');
  document.querySelectorAll('.inline-product-editor-slot').forEach(slot => { slot.innerHTML = ''; });
}

async function saveInlineProductEditor(productId, form) {
  try {
    let imageUrl = inlineProductField(form, 'image');
    const uploaded = await uploadImageFromElements(
      form.querySelector('[name="file"]'),
      'products',
      form.querySelector('[name="image"]'),
      form.querySelector('.inline-upload-status')
    );
    if (uploaded) imageUrl = uploaded;

    const oldPriceRaw = inlineProductField(form, 'oldPrice');
    const discountRaw = inlineProductField(form, 'discount');
    const oldPriceValue = oldPriceRaw === '' ? 0 : Number(oldPriceRaw || 0);
    const discountValue = discountRaw === '' ? 0 : Number(discountRaw || 0);

    const data = {
      title: inlineProductField(form, 'title'),
      group: inlineProductField(form, 'group'),
      price: Number(inlineProductField(form, 'price') || 0),
      stock: Number(inlineProductField(form, 'stock') || 0),
      oldPrice: oldPriceValue ? oldPriceValue : deleteField(),
      priceOld: oldPriceValue ? oldPriceValue : deleteField(),
      compareAtPrice: oldPriceValue ? oldPriceValue : deleteField(),
      priceBefore: oldPriceValue ? oldPriceValue : deleteField(),
      discount: discountValue ? discountValue : deleteField(),
      discountPercent: discountValue ? discountValue : deleteField(),
      discount_percent: discountValue ? discountValue : deleteField(),
      salePercent: discountValue ? discountValue : deleteField(),
      category: inlineProductField(form, 'category'),
      image: imageUrl,
      description: inlineProductField(form, 'description'),
      tag: inlineProductField(form, 'tag') || 'hot',
      homeSection: inlineProductField(form, 'homeSection') || inlineProductField(form, 'tag') || 'hot',
      showOnHome: inlineProductChecked(form, 'showOnHome'),
      installment: inlineProductChecked(form, 'installment'),
      installmentAvailable: inlineProductChecked(form, 'installment'),
      updatedAt: new Date().toISOString()
    };

    if (!data.title) return alert('Введите название товара');
    if (!data.category) return alert('Выберите категорию');

    await updateDoc(doc(db, COLLECTIONS.products, productId), data);
    await markSiteDataChanged();
    try { Object.keys(localStorage).forEach(k => { if (k.startsWith('as_cache_')) localStorage.removeItem(k); }); } catch(e) {}
    await renderProducts();
  } catch (err) {
    console.error(err);
    alert('Ошибка сохранения товара: ' + err.message);
  }
}

if ($('#productForm')) {
  $('#productForm').onsubmit = async e => {
    e.preventDefault();

    try {
      let imageUrl = val('#pImage');
      const uploaded = await uploadImage('#pFile', 'products', '#pImage', '#pUploadStatus');
      if (uploaded) imageUrl = uploaded;

      const oldPriceRaw = val('#pOldPrice').trim();
      const discountRaw = val('#pDiscount').trim();
      const oldPriceValue = oldPriceRaw === '' ? 0 : Number(oldPriceRaw || 0);
      const discountValue = discountRaw === '' ? 0 : Number(discountRaw || 0);

      const data = {
        title: val('#pTitle'),
        group: val('#pGroup'),
        price: Number(val('#pPrice') || 0),
        stock: Number(val('#pStock') || 0),
        oldPrice: oldPriceValue ? oldPriceValue : deleteField(),
        priceOld: oldPriceValue ? oldPriceValue : deleteField(),
        compareAtPrice: oldPriceValue ? oldPriceValue : deleteField(),
        priceBefore: oldPriceValue ? oldPriceValue : deleteField(),
        discount: discountValue ? discountValue : deleteField(),
        discountPercent: discountValue ? discountValue : deleteField(),
        discount_percent: discountValue ? discountValue : deleteField(),
        salePercent: discountValue ? discountValue : deleteField(),
        category: val('#pCategory'),
        image: imageUrl,
        description: val('#pDesc'),
        tag: $('#pTag') ? $('#pTag').value : 'hot',
        homeSection: $('#pHomeSection') ? $('#pHomeSection').value : ($('#pTag') ? $('#pTag').value : 'hot'),
        showOnHome: $('#pShowHome') ? $('#pShowHome').checked : false,
        installment: $('#pInstallment') ? $('#pInstallment').checked : false,
        installmentAvailable: $('#pInstallment') ? $('#pInstallment').checked : false,
        updatedAt: new Date().toISOString()
      };

      if (!data.title) return alert('Введите название товара');
      if (!data.category) return alert('Выберите категорию');

      if (editing.product) {
        await updateDoc(doc(db, COLLECTIONS.products, editing.product), data);
        editing.product = null;
      } else {
        const createData = { ...data, createdAt: new Date().toISOString() };
        if (!oldPriceValue) {
          delete createData.priceOld;
          delete createData.compareAtPrice;
        }
        if (!discountValue) delete createData.discountPercent;
        await addDoc(collection(db, COLLECTIONS.products), createData);
      }

      e.target.reset();
      setVal('#pImage', '');
      if ($('#pUploadStatus')) $('#pUploadStatus').innerHTML = '';
      await markSiteDataChanged();
      try { Object.keys(localStorage).forEach(k => { if (k.startsWith('as_cache_')) localStorage.removeItem(k); }); } catch(e) {}
      await renderProducts();
      alert('Товар сохранён');
    } catch (err) {
      console.error(err);
      alert('Ошибка сохранения товара: ' + err.message);
    }
  };
}

/* EXCEL IMPORT */

function normalizeCode(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  return raw.replace(/\.0$/, '').padStart(raw.length <= 5 ? 5 : raw.length, '0');
}

function isProductCode(value) {
  const code = normalizeCode(value);
  return /^\d{4,}$/.test(code);
}

if ($('#importExcelBtn')) {
  $('#importExcelBtn').onclick = async () => {
    const fileInput = $('#excelFile');
    const status = $('#importStatus');

    if (!fileInput || !fileInput.files[0]) {
      alert('Выберите Excel файл');
      return;
    }

    if (typeof XLSX === 'undefined') {
      alert('Библиотека XLSX не загрузилась. Проверьте подключение интернета.');
      return;
    }

    try {
      const file = fileInput.files[0];
      const buffer = await file.arrayBuffer();

      if (status) status.innerHTML = '<b>Читаю файл...</b>';

      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

      const category = val('#importCategory');
      const tag = $('#importTag') ? $('#importTag').value : 'hot';
      const price = Number(val('#importPrice') || 0);

      let imported = 0;
      let skipped = 0;
      let processed = 0;

      for (const row of rows) {
        const code = normalizeCode(row[0]);
        const title = String(row[1] || '').trim();

        if (!isProductCode(code) || !title) continue;

        processed++;

        const existingSnap = await getDocs(query(
          collection(db, COLLECTIONS.products),
          where('code', '==', code),
          limit(1)
        ));

        if (!existingSnap.empty) {
          skipped++;
          if (status) status.textContent = `Обработано: ${processed}. Импортировано: ${imported}. Пропущено дублей: ${skipped}`;
          continue;
        }

        await addDoc(collection(db, COLLECTIONS.products), {
          code,
          title,
          price,
          category,
          image: '',
          description: '',
          tag,
          showOnHome: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

        imported++;

        if (status) {
          status.textContent = `Обработано: ${processed}. Импортировано: ${imported}. Пропущено дублей: ${skipped}`;
        }
      }

      if (imported > 0) await markSiteDataChanged();
      try { Object.keys(localStorage).forEach(k => { if (k.startsWith('as_cache_')) localStorage.removeItem(k); }); } catch(e) {}
      await renderProducts();

      if (status) {
        status.innerHTML = `
          <div class="upload-success">
            Готово. Импортировано: ${imported}. Пропущено дублей: ${skipped}.
          </div>
        `;
      }

      alert(`Импорт завершён. Импортировано: ${imported}. Пропущено дублей: ${skipped}.`);
    } catch (err) {
      console.error(err);
      if (status) status.innerHTML = `<div class="upload-error">Ошибка импорта: ${err.message}</div>`;
      alert('Ошибка импорта: ' + err.message);
    }
  };
}

function normalizeCategoryText(text) {
  return String(text || '').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/[\s_-]+/g, ' ');
}

function isBlockedCatalogCategory(title) {
  const n = normalizeCategoryText(title);
  return n === 'тмц' || n === 'я мусорка' || n === 'ямусорка' || n.includes('мусорка');
}

/* CATEGORIES */

async function renderCats() {
  const list = $('#catList');
  if (!list) return;

  try {
    allCatsCache = sortByOrder(await getCollection(COLLECTIONS.categories));
    try {
      allProductsCache = await getCollection(COLLECTIONS.products);
    } catch (e) {
      allProductsCache = allProductsCache || [];
    }

    const parents = allCatsCache.filter(c => !c.parentId);

    const parentSelect = $('#cParent');
    if (parentSelect) {
      const current = parentSelect.value;
      parentSelect.innerHTML = `
        <option value="">Нет — основная категория</option>
        ${parents.map(c => `<option value="${c.id}">${Number(c.order ?? 0)} — ${c.title || 'Без названия'}</option>`).join('')}
      `;
      parentSelect.value = current;
    }

    const parentFilter = $('#catParentFilter');
    if (parentFilter) {
      const current = parentFilter.value;
      parentFilter.innerHTML = `
        <option value="">Все категории</option>
        <option value="root">Только основные</option>
        ${parents.map(c => `<option value="${c.id}">${c.title || 'Без названия'}</option>`).join('')}
      `;
      parentFilter.value = current;
    }

    await renderCategoryOptions();
    renderCategoryTree();
  } catch (err) {
    console.error(err);
    alert('Ошибка загрузки категорий: ' + err.message);
  }
}

function renderCategoryTree() {
  const list = $('#catList');
  if (!list) return;

  const queryText = val('#catSearch').toLowerCase();
  const parentFilter = val('#catParentFilter');

  const cats = sortByOrder(allCatsCache || []);
  const parentById = new Map(cats.filter(c => !c.parentId).map(c => [c.id, c]));
  const realTitles = new Set(cats.map(c => normalizeCatTitle(c.title || c.name).toLowerCase()).filter(Boolean));

  const rows = [];

  cats.forEach(cat => {
    const title = normalizeCatTitle(cat.title || cat.name) || 'Без названия';
    const parent = cat.parentId ? parentById.get(cat.parentId) : null;
    const parentTitle = parent ? normalizeCatTitle(parent.title || parent.name) : '';

    rows.push({
      id: cat.id,
      real: true,
      title,
      icon: cat.icon || '',
      order: Number(cat.order ?? 999999),
      parentId: cat.parentId || '',
      parentTitle,
      type: cat.parentId ? 'Подкатегория' : 'Основная категория',
      showInTopCatalog: cat.showInTopCatalog !== false,
      blocked: isBlockedCatalogCategory(title)
    });
  });

  // В каталоге выпадающий список собирается не только из коллекции категорий,
  // но и из групп товаров. Поэтому здесь показываем такие же названия,
  // чтобы админка совпадала с сайтом.
  (allProductsCache || []).forEach(product => {
    [product.group, product.category, product.categoryName].forEach(raw => {
      const title = normalizeCatTitle(raw);
      if (!title || title === 'Без группы' || title === 'Без категории') return;
      if (realTitles.has(title.toLowerCase())) return;
      if (rows.some(r => r.title.toLowerCase() === title.toLowerCase())) return;

      rows.push({
        id: '',
        real: false,
        title,
        icon: '',
        order: 999999,
        parentId: '',
        parentTitle: '',
        type: 'Из товаров'
      });
    });
  });

  const filtered = rows
    .filter(row => {
      const text = `${row.title} ${row.parentTitle} ${row.type} ${row.order}`.toLowerCase();
      if (queryText && !text.includes(queryText)) return false;
      if (parentFilter === 'root' && row.parentId) return false;
      if (parentFilter && parentFilter !== 'root' && row.parentId !== parentFilter) return false;
      return true;
    })
    .sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      if (a.parentTitle !== b.parentTitle) return a.parentTitle.localeCompare(b.parentTitle, 'ru');
      return a.title.localeCompare(b.title, 'ru');
    });

  list.innerHTML = filtered.length
    ? filtered.map(row => `
      <div class="cat-flat-row ${row.parentId ? 'is-child' : ''} ${row.real ? '' : 'is-derived'}">
        <div class="cat-flat-main">
          <div class="cat-flat-title">
            ${row.icon ? `<span class="cat-flat-icon">${row.icon}</span>` : ''}
            <b>${row.title}</b>
          </div>
          <div class="cat-flat-meta">
            <span>${row.type}</span>
            ${row.parentTitle ? `<span>Родитель: ${row.parentTitle}</span>` : ''}
            ${row.order !== 999999 ? `<span>Порядок: ${row.order}</span>` : '<span>Порядок: как в товарах</span>'}
            ${row.real ? `<span>${row.showInTopCatalog ? 'В верхнем каталоге' : 'Скрыта в верхнем каталоге'}</span>` : ''}
            ${row.blocked ? '<span>Не попадает в каталоги</span>' : ''}
          </div>
        </div>

        <div class="tree-actions">
          ${row.real
            ? `<button class="edit" data-editc="${row.id}">Редактировать</button>
               <button class="danger" data-delc="${row.id}">Удалить</button>`
            : `<button class="edit" type="button" data-create-derived="${row.title}">Создать категорию</button>`
          }
        </div>
      </div>
    `).join('')
    : '<p class="muted">Ничего не найдено</p>';

  $$('[data-create-derived]').forEach(btn => {
    btn.onclick = () => {
      editing.cat = null;
      setVal('#cTitle', btn.dataset.createDerived || '');
      setVal('#cIcon', '');
      setVal('#cOrder', '');
      if ($('#cParent')) $('#cParent').value = '';
      $('#cTitle')?.focus();
    };
  });

  $$('[data-delc]').forEach(btn => {
    btn.onclick = async () => {
      const catId = btn.dataset.delc;
      const hasChildren = allCatsCache.some(c => c.parentId === catId);

      if (hasChildren) {
        alert('Сначала удалите или перенесите подкатегории этой категории');
        return;
      }

      if (!confirm('Удалить категорию?')) return;

      await deleteDoc(doc(db, COLLECTIONS.categories, catId));
      await markSiteDataChanged();
      await renderCats();
      await renderProducts();
    };
  });

  $$('[data-editc]').forEach(btn => {
    btn.onclick = () => {
      const item = allCatsCache.find(x => x.id === btn.dataset.editc);
      if (!item) return;

      editing.cat = item.id;

      setVal('#cTitle', item.title);
      setVal('#cIcon', item.icon);
      setVal('#cOrder', item.order ?? '');

      if ($('#cParent')) $('#cParent').value = item.parentId || '';
      if ($('#cShowTop')) $('#cShowTop').checked = item.showInTopCatalog !== false;
      $('#cTitle')?.focus();
    };
  });
}

if ($('#catForm')) {
  $('#catForm').onsubmit = async e => {
    e.preventDefault();

    try {
      const data = {
        title: val('#cTitle'),
        icon: val('#cIcon'),
        order: Number(val('#cOrder') || 0),
        parentId: val('#cParent'),
        showInTopCatalog: $('#cShowTop') ? $('#cShowTop').checked : true,
        updatedAt: new Date().toISOString()
      };

      if (!data.title) return alert('Введите название категории');

      if (editing.cat && editing.cat === data.parentId) {
        return alert('Категория не может быть родителем самой себя');
      }

      if (editing.cat) {
        await updateDoc(doc(db, COLLECTIONS.categories, editing.cat), data);
        editing.cat = null;
      } else {
        data.createdAt = new Date().toISOString();
        await addDoc(collection(db, COLLECTIONS.categories), data);
      }

      e.target.reset();
      await markSiteDataChanged();
      await renderCats();
      await renderProducts();
      alert('Категория сохранена');
    } catch (err) {
      console.error(err);
      alert('Ошибка сохранения категории: ' + err.message);
    }
  };
}

if ($('#catReset')) {
  $('#catReset').onclick = () => {
    editing.cat = null;
    $('#catForm')?.reset();
    if ($('#cShowTop')) $('#cShowTop').checked = true;
  };
}


function bindBannerDimensionPreview(fileSelector, statusSelector, recommendedText) {
  const input = $(fileSelector);
  const statusBox = $(statusSelector);
  if (!input || !statusBox) return;
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (!file) return;
    if (!file.type || !file.type.startsWith('image/')) {
      statusBox.innerHTML = '<div class="upload-error">Выберите файл изображения.</div>';
      return;
    }
    const img = new Image();
    img.onload = () => {
      statusBox.innerHTML = `<div class="upload-info">Загружено: <b>${img.naturalWidth}×${img.naturalHeight} px</b><br>${recommendedText}</div>`;
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => {
      statusBox.innerHTML = '<div class="upload-error">Не удалось прочитать размер изображения.</div>';
    };
    img.src = URL.createObjectURL(file);
  });
}

bindBannerDimensionPreview('#bFile', '#bUploadStatus', 'Рекомендуется: <b>1600×700 px</b> для главного баннера.');
bindBannerDimensionPreview('#pcFile', '#pcUploadStatus', 'Рекомендуется: <b>600×700 px</b> для промо-баннера.');

/* BANNERS */

async function renderBanners() {
  const list = $('#bannerList');
  if (!list) return;

  try {
    const arr = sortByOrder(await getCollection(COLLECTIONS.banners));

    list.innerHTML = arr.length
      ? arr.map(x => `
        <div class="row banner-row-admin">
          <div class="admin-banner-thumb">${(x.image || x.imageUrl || x.photoUrl) ? `<img src="${x.image || x.imageUrl || x.photoUrl}" alt="${x.title || 'Баннер'}">` : '<span>Фото</span>'}</div>
          <div>
            <b>${x.title || 'Баннер'}</b>
            <p class="muted">Порядок: ${Number(x.order ?? 999)} · ${x.enabled === false ? 'выключен' : 'включен'}${x.link ? ` · ссылка: ${x.link}` : ''}</p>
          </div>
          <button class="edit" data-editb="${x.id}">Редактировать</button>
          <button class="danger" data-delb="${x.id}">Удалить</button>
        </div>
      `).join('')
      : '<p class="muted">Пока нет главных баннеров</p>';

    $$('[data-delb]').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('Удалить баннер?')) return;
        await deleteDoc(doc(db, COLLECTIONS.banners, btn.dataset.delb));
        await markSiteDataChanged();
        await renderBanners();
      };
    });

    $$('[data-editb]').forEach(btn => {
      btn.onclick = () => {
        const item = arr.find(x => x.id === btn.dataset.editb);
        if (!item) return;

        editing.banner = item.id;
        setVal('#bTitle', item.title || '');
        setVal('#bImage', item.image || item.imageUrl || item.photoUrl || '');
        setVal('#bLink', item.link || item.url || '');
        setVal('#bOrder', item.order ?? '');
        if ($('#bEnabled')) $('#bEnabled').checked = item.enabled !== false;
        $('#bTitle')?.scrollIntoView({behavior:'smooth', block:'center'});
      };
    });
  } catch (err) {
    console.error(err);
    alert('Ошибка загрузки баннеров: ' + err.message);
  }
}

if ($('#bannerForm')) {
  $('#bannerForm').onsubmit = async e => {
    e.preventDefault();

    try {
      let imageUrl = val('#bImage');
      const uploaded = await uploadImage('#bFile', 'banners', '#bImage', '#bUploadStatus');
      if (uploaded) imageUrl = uploaded;

      const data = {
        title: val('#bTitle') || `Баннер ${Date.now()}`,
        image: imageUrl,
        link: val('#bLink') || '#',
        order: Number(val('#bOrder') || 999),
        enabled: $('#bEnabled') ? $('#bEnabled').checked : true,
        updatedAt: new Date().toISOString()
      };

      if (!data.image) return alert('Загрузите фото или вставьте Фото URL');

      if (editing.banner) {
        await updateDoc(doc(db, COLLECTIONS.banners, editing.banner), data);
        editing.banner = null;
      } else {
        data.createdAt = new Date().toISOString();
        await addDoc(collection(db, COLLECTIONS.banners), data);
      }

      e.target.reset();
      if ($('#bEnabled')) $('#bEnabled').checked = true;
      if ($('#bUploadStatus')) $('#bUploadStatus').innerHTML = '';
      await markSiteDataChanged();
      await renderBanners();
      alert('Баннер сохранён');
    } catch (err) {
      console.error(err);
      alert('Ошибка сохранения баннера: ' + err.message);
    }
  };
}

if ($('#bReset')) {
  $('#bReset').onclick = () => {
    editing.banner = null;
    $('#bannerForm')?.reset();
    if ($('#bEnabled')) $('#bEnabled').checked = true;
    if ($('#bUploadStatus')) $('#bUploadStatus').innerHTML = '';
    $('#bTitle')?.focus();
  };
}

/* MEDIA */

if ($('#mediaForm')) {
  $('#mediaForm').onsubmit = async e => {
    e.preventDefault();

    try {
      const folder = val('#mediaFolder') || 'media';
      const url = await uploadImage('#mediaFile', folder, null, '#mediaResult');

      if (url && $('#mediaResult')) {
        $('#mediaResult').innerHTML += `
          <div class="admin-media-url">
            <b>Ссылка:</b>
            <input value="${url}" onclick="this.select()" readonly>
          </div>
        `;
      }

      e.target.reset();
    } catch (err) {
      console.error(err);
      alert('Ошибка загрузки файла: ' + err.message);
    }
  };
}

/* SIMPLE PAGES / SETTINGS SAVE */

if ($('#pageForm')) {
  $('#pageForm').onsubmit = async e => {
    e.preventDefault();

    try {
      const key = val('#pageKey') || 'page';

      await setDoc(doc(db, COLLECTIONS.pages, key), {
        title: val('#pageTitle'),
        content: val('#pageContent'),
        updatedAt: new Date().toISOString()
      });

      await markSiteDataChanged();
      alert('Страница сохранена');
    } catch (err) {
      alert('Ошибка сохранения страницы: ' + err.message);
    }
  };
}

if ($('#settingsForm')) {
  $('#settingsForm').onsubmit = async e => {
    e.preventDefault();

    try {
      await setDoc(doc(db, COLLECTIONS.settings, 'main'), {
        siteName: val('#siteName'),
        currency: val('#siteCurrency'),
        email: val('#siteEmail'),
        phone: val('#sitePhone'),
        address: val('#siteAddress'),
        updatedAt: new Date().toISOString()
      });

      await markSiteDataChanged();
      alert('Настройки сохранены');
    } catch (err) {
      alert('Ошибка сохранения настроек: ' + err.message);
    }
  };
}

/* FILTER EVENTS */

['#catSearch', '#catParentFilter'].forEach(selector => {
  const el = $(selector);
  if (el) {
    el.addEventListener('input', renderCategoryTree);
    el.addEventListener('change', renderCategoryTree);
  }
});

['#productSearch', '#productCategoryFilter', '#productTagFilter'].forEach(selector => {
  const el = $(selector);
  if (el) {
    el.addEventListener('input', renderProductList);
    el.addEventListener('change', renderProductList);
  }
});

/* HOME BLOCKS */


async function renderPromoCardsAdmin() {
  const list = $('#promoCardList');
  if (!list) return;

  await loadPromoCards();
  const cards = mergedPromoCards();

  list.innerHTML = cards.length ? cards.map(card => `
    <div class="row banner-row-admin">
      <div class="admin-banner-thumb admin-banner-thumb-small">${card.image ? `<img src="${card.image}" alt="${card.title || 'Промо'}">` : '<span>Фото</span>'}</div>
      <div>
        <b>${card.title || 'Промо'}</b>
        <p class="muted">
          Порядок: ${Number(card.order ?? 999)} · ${card.enabled === false ? 'выключена' : 'включена'}
          ${card.link ? ` · ссылка: ${card.link}` : ''}
        </p>
      </div>
      <button class="edit" data-editpc="${card.id}" data-pccol="${card._collection || PROMO_CARDS_COLLECTION}">Редактировать</button>
      <button class="danger" data-delpc="${card.id}" data-pccol="${card._collection || PROMO_CARDS_COLLECTION}">Удалить</button>
    </div>
  `).join('') : '<p class="muted">Пока нет промо-баннеров</p>';

  $$('[data-delpc]').forEach(btn => btn.onclick = async () => {
    if (!confirm('Удалить промо-баннер?')) return;
    await deleteDoc(doc(db, btn.dataset.pccol || PROMO_CARDS_COLLECTION, btn.dataset.delpc));
    await markSiteDataChanged();
    await renderPromoCardsAdmin();
  });

  $$('[data-editpc]').forEach(btn => btn.onclick = () => {
    const item = allPromoCardsCache.find(x => x.id === btn.dataset.editpc && (x._collection || PROMO_CARDS_COLLECTION) === (btn.dataset.pccol || PROMO_CARDS_COLLECTION));
    if (!item) return;
    editing.promoCard = item.id;
    editing.promoCardCollection = item._collection || PROMO_CARDS_COLLECTION;
    setVal('#pcTitle', item.title || item.name || '');
    setVal('#pcImage', item.image || item.imageUrl || item.photoUrl || '');
    setVal('#pcLink', item.link || item.url || '');
    setVal('#pcOrder', item.order ?? '');
    if ($('#pcEnabled')) $('#pcEnabled').checked = item.enabled !== false;
    $('#pcTitle')?.scrollIntoView({behavior:'smooth', block:'center'});
  });
}

if ($('#promoCardsForm')) {
  $('#promoCardsForm').onsubmit = async e => {
    e.preventDefault();

    let imageUrl = val('#pcImage');
    const uploaded = await uploadImage('#pcFile', 'promo-cards', '#pcImage', '#pcUploadStatus');
    if (uploaded) imageUrl = uploaded;

    const title = val('#pcTitle') || `Промо ${Date.now()}`;
    const key = slugifyBlock(title);
    const data = {
      title,
      key,
      image: imageUrl,
      link: val('#pcLink') || '#',
      order: Number(val('#pcOrder') || 999),
      enabled: $('#pcEnabled') ? $('#pcEnabled').checked : true,
      updatedAt: new Date().toISOString()
    };

    if (!data.image) return alert('Загрузите фото или вставьте Фото URL');

    try {
      if (editing.promoCard) {
        await updateDoc(doc(db, editing.promoCardCollection || PROMO_CARDS_COLLECTION, editing.promoCard), data);
        editing.promoCard = null;
        editing.promoCardCollection = null;
      } else {
        data.createdAt = new Date().toISOString();
        await addDoc(collection(db, PROMO_CARDS_COLLECTION), data);
      }

      e.target.reset();
      if ($('#pcEnabled')) $('#pcEnabled').checked = true;
      if ($('#pcUploadStatus')) $('#pcUploadStatus').innerHTML = '';
      await markSiteDataChanged();
      await renderPromoCardsAdmin();
      alert('Промо-баннер сохранён');
    } catch (err) {
      console.error('promo banner save error', err);
      alert('Ошибка сохранения промо-баннера: ' + (err?.message || err));
    }
  };
}

if ($('#pcReset')) {
  $('#pcReset').onclick = () => {
    editing.promoCard = null;
    editing.promoCardCollection = null;
    $('#promoCardsForm')?.reset();
    if ($('#pcEnabled')) $('#pcEnabled').checked = true;
    if ($('#pcUploadStatus')) $('#pcUploadStatus').innerHTML = '';
    $('#pcTitle')?.focus();
  };
}

async function renderHomeBlocksAdmin() {
  const list = $('#homeBlockList');
  if (!list) return;
  await loadHomeBlocks();
  renderHomeSectionOptions();
  const blocks = mergedHomeBlocks(true);
  list.innerHTML = blocks.map(b => `
    <div class="row">
      <div>
        <b>${b.title}</b>
        <p class="muted">Ключ: ${b.key} · порядок: ${Number(b.order ?? 999)} ${b.builtin ? '· системный' : ''}</p>
      </div>
      <div class="row-actions">
        ${b.builtin ? '<span class="admin-badge">Системный</span>' : ''}
        <button class="edit" data-edithb="${b.id || b.key}" data-hbkey="${b.key}">Редактировать</button>
        ${b.builtin ? '' : `<button class="danger" data-delhb="${b.id}">Удалить</button>`}
      </div>
    </div>
  `).join('');
  $$('[data-delhb]').forEach(btn => btn.onclick = async () => {
    if (!confirm('Удалить блок главной? Товары не удалятся.')) return;
    await deleteDoc(doc(db, HOME_BLOCKS_COLLECTION, btn.dataset.delhb));
    await markSiteDataChanged();
    await renderHomeBlocksAdmin();
    renderPromoCardsAdmin();
  });
  $$('[data-edithb]').forEach(btn => btn.onclick = () => {
    const key = btn.dataset.hbkey || btn.dataset.edithb;
    const item = allHomeBlocksCache.find(x => x.id === btn.dataset.edithb || x.key === key || x.slug === key)
      || defaultHomeBlocks().find(x => x.key === key || x.id === key);
    if (!item) return;
    editing.homeBlock = item.id || item.key;
    editing.homeBlockKey = item.key || item.slug || item.id;
    editing.homeBlockBuiltin = item.builtin === true;
    setVal('#hbTitle', item.title || item.name || '');
    setVal('#hbKey', item.key || item.slug || item.id || '');
    setVal('#hbOrder', item.order ?? '');
    if ($('#hbEnabled')) $('#hbEnabled').checked = item.enabled !== false;
    const keyInput = $('#hbKey');
    if (keyInput) keyInput.readOnly = item.builtin === true;
  });
}

if ($('#homeBlockForm')) {
  $('#homeBlockForm').onsubmit = async e => {
    e.preventDefault();
    const title = val('#hbTitle');
    const key = val('#hbKey') || slugifyBlock(title);
    const data = {
      title,
      key,
      order: Number(val('#hbOrder') || 999),
      enabled: $('#hbEnabled') ? $('#hbEnabled').checked : true,
      updatedAt: new Date().toISOString()
    };
    if (!data.title) return alert('Введите название блока');

    try {
      const oldDocId = editing.homeBlock || null;
      const docId = key;

      if (oldDocId && oldDocId !== docId && !editing.homeBlockBuiltin) {
        await deleteDoc(doc(db, HOME_BLOCKS_COLLECTION, oldDocId));
      }

      await setDoc(doc(db, HOME_BLOCKS_COLLECTION, docId), {
        ...data,
        id: docId,
        builtin: editing.homeBlockBuiltin === true || defaultHomeBlocks().some(b => b.key === docId),
        createdAt: new Date().toISOString()
      }, { merge: true });

      editing.homeBlock = null;
      editing.homeBlockKey = null;
      editing.homeBlockBuiltin = false;
      e.target.reset();
      const keyInput = $('#hbKey');
      if (keyInput) keyInput.readOnly = false;
      if ($('#hbEnabled')) $('#hbEnabled').checked = true;
      await markSiteDataChanged();
      await renderHomeBlocksAdmin();
      renderPromoCardsAdmin();
      alert('Блок сохранён');
    } catch (err) {
      console.error('home block save error', err);
      alert('Ошибка сохранения блока: ' + (err?.message || err));
    }
  };
}


if ($('#hbReset')) {
  $('#hbReset').onclick = () => {
    const form = $('#homeBlockForm');

    // Если редактировали существующий блок — кнопка переводит форму в режим создания нового.
    if (editing.homeBlock) {
      editing.homeBlock = null;
      editing.homeBlockKey = null;
      editing.homeBlockBuiltin = false;
      form?.reset();
      const keyInput = $('#hbKey');
      if (keyInput) keyInput.readOnly = false;
      if ($('#hbEnabled')) $('#hbEnabled').checked = true;
      $('#hbTitle')?.focus();
      return;
    }

    // Если поля заполнены — создаём новый блок этой же кнопкой.
    if (val('#hbTitle')) {
      form?.requestSubmit();
      return;
    }

    form?.reset();
    const keyInput = $('#hbKey');
    if (keyInput) keyInput.readOnly = false;
    if ($('#hbEnabled')) $('#hbEnabled').checked = true;
    $('#hbTitle')?.focus();
  };
}

renderHomeBlocksAdmin();
renderPromoCardsAdmin();
