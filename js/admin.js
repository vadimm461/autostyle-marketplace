import { auth, db, COLLECTIONS } from './firebase.js';

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
  if (el) el.value = value || '';
}

async function getCollection(name) {
  const snap = await getDocs(collection(db, name));
  return snap.docs.map(d => ({
    id: d.id,
    ...d.data()
  }));
}

function section(id) {
  $$('.admin-section').forEach(s => s.classList.remove('active'));
  $('#' + id)?.classList.add('active');

  $$('.admin-nav button').forEach(b => {
    b.classList.toggle('active', b.dataset.section === id);
  });
}

$$('[data-section]').forEach(b => {
  b.onclick = () => section(b.dataset.section);
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

/* ===== ТОВАРЫ ===== */

async function renderProducts() {
  const list = $('#productList');
  if (!list) return;

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
              <span class="admin-price">${Number(x.price || 0).toLocaleString('ru-RU')} ₽</span>
            </div>

            <p class="muted">${x.description || 'Описание не добавлено'}</p>
          </div>

          <button class="edit" data-editp="${x.id}">Редактировать</button>
          <button class="danger" data-delp="${x.id}">Удалить</button>
        </div>
      `).join('')
      : '<p class="muted">Пока пусто</p>';

    $$('[data-delp]').forEach(b => {
      b.onclick = async () => {
        if (!confirm('Удалить товар?')) return;

        await deleteDoc(doc(db, COLLECTIONS.products, b.dataset.delp));
        renderProducts();
      };
    });

    $$('[data-editp]').forEach(b => {
      b.onclick = () => {
        const item = arr.find(x => x.id === b.dataset.editp);
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
    console.error(err);
    alert('Ошибка загрузки товаров: ' + err.message);
  }
}

if ($('#productForm')) {
  $('#productForm').onsubmit = async e => {
    e.preventDefault();

    try {
      const data = {
        title: val('#pTitle'),
        price: Number(val('#pPrice') || 0),
        category: val('#pCategory'),
        image: val('#pImage'),
        description: val('#pDesc'),
        tag: $('#pTag') ? $('#pTag').value : 'hot',
        updatedAt: new Date().toISOString()
      };

      if (!data.title) {
        alert('Введите название товара');
        return;
      }

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
      console.error(err);
      alert('Ошибка сохранения товара: ' + err.message);
    }
  };
}

/* ===== КАТЕГОРИИ ===== */

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
          <b>
            ${x.parentId ? '↳ ' : ''}
            ${x.icon ? x.icon + ' ' : ''}
            ${x.title || 'Без названия'}
          </b>

          <span class="muted">
            ${x.parentId ? 'Подгруппа: ' + parentName(x.parentId) : 'Основная категория'}
          </span>

          <button class="edit" data-editc="${x.id}">Редактировать</button>
          <button class="danger" data-delc="${x.id}">Удалить</button>
        </div>
      `).join('')
      : '<p class="muted">Пока пусто</p>';

    $$('[data-delc]').forEach(b => {
      b.onclick = async () => {
        if (!confirm('Удалить категорию?')) return;

        await deleteDoc(doc(db, COLLECTIONS.categories, b.dataset.delc));
        renderCats();
      };
    });

    $$('[data-editc]').forEach(b => {
      b.onclick = () => {
        const item = arr.find(x => x.id === b.dataset.editc);
        if (!item) return;

        editing.cat = item.id;

        setVal('#cTitle', item.title);
        setVal('#cIcon', item.icon);

        if ($('#cParent')) {
          $('#cParent').value = item.parentId || '';
        }
      };
    });
  } catch (err) {
    console.error(err);
    alert('Ошибка загрузки категорий: ' + err.message);
  }
}

    $$('[data-editc]').forEach(b => {
      b.onclick = () => {
        const item = arr.find(x => x.id === b.dataset.editc);
        if (!item) return;

        editing.cat = item.id;

        setVal('#cTitle', item.title);
        setVal('#cIcon', item.icon);
      };
    });
  } catch (err) {
    console.error(err);
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
        updatedAt: new Date().toISOString()
      };

      if (!data.title) {
        alert('Введите название категории');
        return;
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
      alert('Категория сохранена');
    } catch (err) {
      console.error(err);
      alert('Ошибка сохранения категории: ' + err.message);
    }
  };
}

/* ===== БАННЕРЫ ===== */

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

    $$('[data-delb]').forEach(b => {
      b.onclick = async () => {
        if (!confirm('Удалить баннер?')) return;

        await deleteDoc(doc(db, COLLECTIONS.banners, b.dataset.delb));
        renderBanners();
      };
    });

    $$('[data-editb]').forEach(b => {
      b.onclick = () => {
        const item = arr.find(x => x.id === b.dataset.editb);
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
      const data = {
        title: val('#bTitle'),
        text: val('#bText'),
        image: val('#bImage'),
        link: val('#bLink'),
        updatedAt: new Date().toISOString()
      };

      if (!data.title) {
        alert('Введите заголовок баннера');
        return;
      }

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
      console.error(err);
      alert('Ошибка сохранения баннера: ' + err.message);
    }
  };
}
