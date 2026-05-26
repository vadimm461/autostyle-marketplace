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
  updateDoc
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

import {
  ref,
  uploadBytes,
  getDownloadURL
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

let editing = {
  product: null,
  cat: null,
  banner: null
};

function val(id) {
  const el = $(id);
  return el ? el.value.trim() : '';
}

function setVal(id, value) {
  const el = $(id);
  if (el) el.value = value ?? '';
}

async function getCollection(name) {
  const snap = await getDocs(collection(db, name));
  return snap.docs.map(d => ({
    id: d.id,
    ...d.data()
  }));
}

async function uploadImage(inputId, folder) {
  const input = $(inputId);
  if (!input || !input.files || !input.files[0]) return '';

  const file = input.files[0];
  const fileName = `${folder}/${Date.now()}-${file.name}`;
  const fileRef = ref(storage, fileName);

  await uploadBytes(fileRef, file);
  return await getDownloadURL(fileRef);
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

  renderProducts();
  renderCats();
  renderBanners();
});

/* CATEGORY OPTIONS */

async function renderCategoryOptions() {
  const select = $('#pCategory');
  if (!select) return;

  const cats = await getCollection(COLLECTIONS.categories);
  const parents = cats.filter(c => !c.parentId);
  const children = cats.filter(c => c.parentId);

  select.innerHTML = '<option value="">Выберите категорию</option>';

  parents.forEach(parent => {
    select.innerHTML += `
      <option value="${parent.title || parent.name}">
        ${parent.title || parent.name}
      </option>
    `;

    children
      .filter(child => child.parentId === parent.id)
      .forEach(child => {
        select.innerHTML += `
          <option value="${child.title || child.name}">
            — ${child.title || child.name}
          </option>
        `;
      });
  });
}

/* PRODUCTS */

async function renderProducts() {
  const list = $('#productList');
  if (!list) return;

  await renderCategoryOptions();

  try {
    const arr = await getCollection(COLLECTIONS.products);

    list.innerHTML = arr.length
      ? arr.map(x => `
        <div class="row admin-product-row">
          <div class="admin-product-img">
            ${x.image ? `<img src="${x.image}" alt="${x.title || 'Товар'}">` : `<span>Фото</span>`}
          </div>

          <div class="admin-product-info">
            <b class="admin-product-title">${x.title || 'Без названия'}</b>

            <div class="admin-product-meta">
              <span class="admin-badge">${x.category || 'Без категории'}</span>
              <span class="admin-badge">${x.tag || 'hot'}</span>
              <span class="admin-price">${Number(x.price || 0).toLocaleString('ru-RU')} ₽</span>
            </div>

            <p class="muted">${x.description || 'Описание не добавлено'}</p>
          </div>

          <button class="edit" data-editp="${x.id}">Редактировать</button>
          <button class="danger" data-delp="${x.id}">Удалить</button>
        </div>
      `).join('')
      : '<p class="muted">Пока пусто</p>';

    $$('[data-delp]').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('Удалить товар?')) return;
        await deleteDoc(doc(db, COLLECTIONS.products, btn.dataset.delp));
        await renderProducts();
      };
    });

    $$('[data-editp]').forEach(btn => {
      btn.onclick = () => {
        const item = arr.find(x => x.id === btn.dataset.editp);
        if (!item) return;

        editing.product = item.id;

        setVal('#pTitle', item.title);
        setVal('#pPrice', item.price);
        setVal('#pCategory', item.category);
        setVal('#pImage', item.image);
        setVal('#pDesc', item.description);

        if ($('#pTag')) $('#pTag').value = item.tag || 'hot';
      };
    });
  } catch (err) {
    alert('Ошибка загрузки товаров: ' + err.message);
  }
}

if ($('#productForm')) {
  $('#productForm').onsubmit = async e => {
    e.preventDefault();

    try {
      let imageUrl = val('#pImage');
      const uploaded = await uploadImage('#pFile', 'products');
      if (uploaded) imageUrl = uploaded;

      const data = {
        title: val('#pTitle'),
        price: Number(val('#pPrice') || 0),
        category: val('#pCategory'),
        image: imageUrl,
        description: val('#pDesc'),
        tag: $('#pTag') ? $('#pTag').value : 'hot',
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
      await renderProducts();
      alert('Товар сохранён');
    } catch (err) {
      alert('Ошибка сохранения товара: ' + err.message);
    }
  };
}

/* CATEGORIES */

async function renderCats() {
  const list = $('#catList');
  if (!list) return;

  try {
    const arr = await getCollection(COLLECTIONS.categories);
    const parentSelect = $('#cParent');

    if (parentSelect) {
      parentSelect.innerHTML = `
        <option value="">Нет — основная категория</option>
        ${arr
          .filter(c => !c.parentId)
          .map(c => `<option value="${c.id}">${c.title || 'Без названия'}</option>`)
          .join('')}
      `;
    }

    const parentName = id => {
      const parent = arr.find(c => c.id === id);
      return parent ? parent.title : '';
    };

    list.innerHTML = arr.length
      ? arr.map(x => `
        <div class="row">
          <b>${x.parentId ? '↳ ' : ''}${x.icon ? x.icon + ' ' : ''}${x.title || 'Без названия'}</b>
          <span class="muted">${x.parentId ? 'Подгруппа: ' + parentName(x.parentId) : 'Основная категория'}</span>
          <button class="edit" data-editc="${x.id}">Редактировать</button>
          <button class="danger" data-delc="${x.id}">Удалить</button>
        </div>
      `).join('')
      : '<p class="muted">Пока пусто</p>';

    $$('[data-delc]').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('Удалить категорию?')) return;
        await deleteDoc(doc(db, COLLECTIONS.categories, btn.dataset.delc));
        await renderCats();
        await renderCategoryOptions();
      };
    });

    $$('[data-editc]').forEach(btn => {
      btn.onclick = () => {
        const item = arr.find(x => x.id === btn.dataset.editc);
        if (!item) return;

        editing.cat = item.id;
        setVal('#cTitle', item.title);
        setVal('#cIcon', item.icon);

        if ($('#cParent')) $('#cParent').value = item.parentId || '';
      };
    });

    await renderCategoryOptions();
  } catch (err) {
    alert('Ошибка загрузки категорий: ' + err.message);
  }
}

if ($('#catForm')) {
  $('#catForm').onsubmit = async e => {
    e.preventDefault();

    try {
      const data = {
        title: val('#cTitle'),
        icon: val('#cIcon'),
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
      await renderCategoryOptions();
      alert('Категория сохранена');
    } catch (err) {
      alert('Ошибка сохранения категории: ' + err.message);
    }
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
    alert('Ошибка загрузки баннеров: ' + err.message);
  }
}

if ($('#bannerForm')) {
  $('#bannerForm').onsubmit = async e => {
    e.preventDefault();

    try {
      let imageUrl = val('#bImage');
      const uploaded = await uploadImage('#bFile', 'banners');
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
      await renderBanners();
      alert('Баннер сохранён');
    } catch (err) {
      alert('Ошибка сохранения баннера: ' + err.message);
    }
  };
}
