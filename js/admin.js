import { auth, db, storage, COLLECTIONS } from './firebase.js';

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
  limit
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

import {
  ref,
  uploadBytesResumable,
  getDownloadURL
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

let editing = {
  product: null,
  cat: null,
  banner: null
};

let allCatsCache = [];
let allProductsCache = [];

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
    return String(a.title || '').localeCompare(String(b.title || ''), 'ru');
  });
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
});

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

  // 2) Категории из самих товаров.
  // Именно отсюда берутся "Автохимия LAVR", "Автохимия MANNOL" и т.д.
  (allProductsCache || []).forEach(product => {
    const title = normalizeCatTitle(product.category);
    if (!title || title === 'Без категории') return;

    if (!map.has(title.toLowerCase())) {
      map.set(title.toLowerCase(), {
        value: title,
        label: title,
        order: 999999
      });
    }
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
    if (category && p.category !== category) return false;
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
            ${x.showOnHome ? `<span class="admin-badge admin-badge-home">На главной</span>` : ''}
            <span class="admin-price">${Number(x.price || 0).toLocaleString('ru-RU')} ₽</span>
          </div>

          <p class="muted">${x.description || 'Описание не добавлено'}</p>
        </div>

        <button class="edit" data-editp="${x.id}">Редактировать</button>
        <button class="danger" data-delp="${x.id}">Удалить</button>
      </div>
    `).join('')
    : '<p class="muted">Товары не найдены</p>';

  $$('[data-delp]').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('Удалить товар?')) return;
      await deleteDoc(doc(db, COLLECTIONS.products, btn.dataset.delp));
      await renderProducts();
    };
  });

  $$('[data-editp]').forEach(btn => {
    btn.onclick = () => {
      const item = allProductsCache.find(x => x.id === btn.dataset.editp);
      if (!item) return;

      editing.product = item.id;

      setVal('#pTitle', item.title);
      setVal('#pGroup', item.group || item.category || '');
      setVal('#pPrice', item.price);
      setVal('#pOldPrice', item.oldPrice || item.priceOld || '');
      setVal('#pDiscount', item.discount || item.discountPercent || '');
      setVal('#pCategory', item.category);
      setVal('#pImage', item.image);
      setVal('#pDesc', item.description);

      if ($('#pTag')) $('#pTag').value = item.tag || 'hot';
      if ($('#pHomeSection')) $('#pHomeSection').value = item.homeSection || item.tag || 'hot';
      if ($('#pShowHome')) $('#pShowHome').checked = item.showOnHome === true;
    };
  });
}

if ($('#productForm')) {
  $('#productForm').onsubmit = async e => {
    e.preventDefault();

    try {
      let imageUrl = val('#pImage');
      const uploaded = await uploadImage('#pFile', 'products', '#pImage', '#pUploadStatus');
      if (uploaded) imageUrl = uploaded;

      const data = {
        title: val('#pTitle'),
        group: val('#pGroup'),
        price: Number(val('#pPrice') || 0),
        oldPrice: Number(val('#pOldPrice') || 0),
        discount: Number(val('#pDiscount') || 0),
        category: val('#pCategory'),
        image: imageUrl,
        description: val('#pDesc'),
        tag: $('#pTag') ? $('#pTag').value : 'hot',
        homeSection: $('#pHomeSection') ? $('#pHomeSection').value : ($('#pTag') ? $('#pTag').value : 'hot'),
        showOnHome: $('#pShowHome') ? $('#pShowHome').checked : false,
        updatedAt: new Date().toISOString()
      };

      if (!data.title) return alert('Введите название товара');
      if (!data.category) return alert('Выберите категорию');

      if (editing.product) {
        await updateDoc(doc(db, COLLECTIONS.products, editing.product), data);
        editing.product = null;
      } else {
        data.createdAt = new Date().toISOString();
        await addDoc(collection(db, COLLECTIONS.products), data);
      }

      e.target.reset();
      setVal('#pImage', '');
      if ($('#pUploadStatus')) $('#pUploadStatus').innerHTML = '';
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

/* CATEGORIES */

async function renderCats() {
  const list = $('#catList');
  if (!list) return;

  try {
    allCatsCache = sortByOrder(await getCollection(COLLECTIONS.categories));
    // Важно: часть групп у тебя живет не в коллекции категорий,
    // а прямо в товарах Firestore. Подтягиваем товары, чтобы админка
    // показывала ВСЕ группы, которые реально есть на сайте.
    allProductsCache = await getCollection(COLLECTIONS.products);

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

  const parents = allCatsCache.filter(c => !c.parentId);
  const children = allCatsCache.filter(c => c.parentId);

  const knownTitles = new Set(
    allCatsCache
      .map(c => normalizeCatTitle(c.title || c.name).toLowerCase())
      .filter(Boolean)
  );

  // Группы, которые уже есть в товарах, но еще не заведены отдельной категорией.
  // Именно из-за этого в каталоге они видны, а в админке раньше не отображались.
  const productGroupsMap = new Map();
  (allProductsCache || []).forEach(product => {
    const title = normalizeCatTitle(product.category || product.group);
    if (!title || title === 'Без категории') return;
    const key = title.toLowerCase();
    if (knownTitles.has(key)) return;

    const current = productGroupsMap.get(key) || { title, count: 0 };
    current.count += 1;
    productGroupsMap.set(key, current);
  });

  const productGroups = [...productGroupsMap.values()]
    .sort((a, b) => a.title.localeCompare(b.title, 'ru'));

  function matches(cat) {
    return String(cat.title || '').toLowerCase().includes(queryText)
      || String(cat.icon || '').toLowerCase().includes(queryText)
      || String(cat.order || '').includes(queryText);
  }

  let html = '';

  parents.forEach(parent => {
    const childList = children.filter(c => c.parentId === parent.id);

    const visibleChildren = childList.filter(child => {
      if (queryText && !matches(child)) return false;
      if (parentFilter && parentFilter !== 'root' && child.parentId !== parentFilter) return false;
      return true;
    });

    const showParent =
      (!queryText && !parentFilter) ||
      (parentFilter === 'root') ||
      (parentFilter === parent.id) ||
      matches(parent) ||
      visibleChildren.length;

    if (!showParent) return;
    if (parentFilter === 'root' && queryText && !matches(parent)) return;

    html += `
      <div class="tree-parent">
        <div class="tree-row">
          <div>
            <b>${parent.title || 'Без названия'}</b>
            <small>Основная категория · порядок: ${Number(parent.order ?? 0)}</small>
          </div>

          <div class="tree-actions">
            <button class="edit" data-editc="${parent.id}">Редактировать</button>
            <button class="danger" data-delc="${parent.id}">Удалить</button>
          </div>
        </div>

        <div class="tree-children">
          ${
            visibleChildren.length
              ? visibleChildren.map(child => `
                <div class="tree-row child">
                  <div>
                    <b>${child.title || 'Без названия'}</b>
                    <small>Подкатегория · порядок: ${Number(child.order ?? 0)}</small>
                  </div>

                  <div class="tree-actions">
                    <button class="edit" data-editc="${child.id}">Редактировать</button>
                    <button class="danger" data-delc="${child.id}">Удалить</button>
                  </div>
                </div>
              `).join('')
              : '<div class="tree-empty">Подкатегорий нет</div>'
          }
        </div>
      </div>
    `;
  });

  const visibleProductGroups = productGroups.filter(group => {
    if (parentFilter) return false;
    if (queryText && !group.title.toLowerCase().includes(queryText)) return false;
    return true;
  });

  if (visibleProductGroups.length) {
    html += `
      <div class="tree-parent product-groups-block">
        <div class="tree-row product-groups-head">
          <div>
            <b>Группы из товаров</b>
            <small>Эти группы уже есть в твоих товарах Firestore, но не были заведены как категории.</small>
          </div>
        </div>
        <div class="tree-children">
          ${visibleProductGroups.map(group => `
            <div class="tree-row child product-group-row">
              <div>
                <b>${group.title}</b>
                <small>Найдено товаров: ${group.count}</small>
              </div>
              <div class="tree-actions">
                <button class="edit" data-create-cat-from-product="${encodeURIComponent(group.title)}">Добавить в категории</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  list.innerHTML = html || '<p class="muted">Ничего не найдено</p>';

  $$('[data-create-cat-from-product]').forEach(btn => {
    btn.onclick = async () => {
      const title = decodeURIComponent(btn.dataset.createCatFromProduct || '');
      if (!title) return;
      if (!confirm(`Добавить группу «${title}» в категории?`)) return;

      await addDoc(collection(db, COLLECTIONS.categories), {
        title,
        icon: '',
        order: 999,
        parentId: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      await renderCats();
      await renderCategoryOptions();
      alert('Группа добавлена в категории');
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
  };
}

/* BANNERS */

async function renderBanners() {
  const list = $('#bannerList');
  if (!list) return;

  try {
    const arr = await getCollection(COLLECTIONS.banners);

    list.innerHTML = arr.length
      ? arr.map(x => `
        <div class="row">
          <b>${x.title || 'Без названия'}</b>
          <button class="edit" data-editb="${x.id}">Редактировать</button>
          <button class="danger" data-delb="${x.id}">Удалить</button>
        </div>
      `).join('')
      : '<p class="muted">Пока пусто</p>';

    $$('[data-delb]').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('Удалить баннер?')) return;
        await deleteDoc(doc(db, COLLECTIONS.banners, btn.dataset.delb));
        await renderBanners();
      };
    });

    $$('[data-editb]').forEach(btn => {
      btn.onclick = () => {
        const item = arr.find(x => x.id === btn.dataset.editb);
        if (!item) return;

        editing.banner = item.id;
        setVal('#bTitle', item.title);
        setVal('#bText', item.text);
        setVal('#bImage', item.image);
        setVal('#bLink', item.link);
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
        title: val('#bTitle'),
        text: val('#bText'),
        image: imageUrl,
        link: val('#bLink'),
        updatedAt: new Date().toISOString()
      };

      if (!data.title) return alert('Введите заголовок баннера');

      if (editing.banner) {
        await updateDoc(doc(db, COLLECTIONS.banners, editing.banner), data);
        editing.banner = null;
      } else {
        data.createdAt = new Date().toISOString();
        await addDoc(collection(db, COLLECTIONS.banners), data);
      }

      e.target.reset();
      if ($('#bUploadStatus')) $('#bUploadStatus').innerHTML = '';
      await renderBanners();
      alert('Баннер сохранён');
    } catch (err) {
      console.error(err);
      alert('Ошибка сохранения баннера: ' + err.message);
    }
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