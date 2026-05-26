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

$('#logout').onclick = () => {
  signOut(auth).then(() => location.href = 'index.html');
};

onAuthStateChanged(auth, user => {
  if (!user) {
    location.href = 'index.html';
  } else {
    renderProducts();
    renderCats();
    renderBanners();
  }
});

async function docs(name) {
  const snap = await getDocs(collection(db, name));
  return snap.docs.map(d => ({
    id: d.id,
    ...d.data()
  }));
}

async function renderProducts() {
  const arr = await docs(COLLECTIONS.products);

  $('#productList').innerHTML = arr.length
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
      await deleteDoc(doc(db, COLLECTIONS.products, b.dataset.delp));
      renderProducts();
    };
  });

  $$('[data-editp]').forEach(b => {
    b.onclick = () => {
      const item = arr.find(x => x.id === b.dataset.editp);
      if (!item) return;

      editing.product = item.id;
      $('#pTitle').value = item.title || '';
      $('#pPrice').value = item.price || '';
      $('#pCategory').value = item.category || '';
      $('#pImage').value = item.image || '';
      $('#pDesc').value = item.description || '';

      if ($('#pTag')) $('#pTag').value = item.tag || 'hot';
    };
  });
}

async function renderCats() {
  const arr = await docs(COLLECTIONS.categories);

  $('#catList').innerHTML = arr.length
    ? arr.map(x => `
      <div class="row">
        <b>${x.title || 'Без названия'}</b>
        <button class="edit" data-editc="${x.id}">Редактировать</button>
        <button class="danger" data-delc="${x.id}">Удалить</button>
      </div>
    `).join('')
    : '<p class="muted">Пока пусто</p>';

  $$('[data-delc]').forEach(b => {
    b.onclick = async () => {
      await deleteDoc(doc(db, COLLECTIONS.categories, b.dataset.delc));
      renderCats();
    };
  });

  $$('[data-editc]').forEach(b => {
    b.onclick = () => {
      const item = arr.find(x => x.id === b.dataset.editc);
      if (!item) return;

      editing.cat = item.id;
      $('#cTitle').value = item.title || '';
      if ($('#cIcon')) $('#cIcon').value = item.icon || '';
    };
  });
}

async function renderBanners() {
  const arr = await docs(COLLECTIONS.banners);

  $('#bannerList').innerHTML = arr.length
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
      await deleteDoc(doc(db, COLLECTIONS.banners, b.dataset.delb));
      renderBanners();
    };
  });

  $$('[data-editb]').forEach(b => {
    b.onclick = () => {
      const item = arr.find(x => x.id === b.dataset.editb);
      if (!item) return;

      editing.banner = item.id;
      $('#bTitle').value = item.title || '';
      $('#bText').value = item.text || '';
      $('#bImage').value = item.image || '';
      if ($('#bLink')) $('#bLink').value = item.link || '';
    };
  });
}

$('#productForm').onsubmit = async e => {
  e.preventDefault();

  const data = {
    title: $('#pTitle').value.trim(),
    price: Number($('#pPrice').value || 0),
    category: $('#pCategory').value.trim(),
    image: $('#pImage').value.trim(),
    description: $('#pDesc').value.trim(),
    tag: $('#pTag') ? $('#pTag').value : 'hot',
    updatedAt: new Date().toISOString()
  };

  if (!data.title) return alert('Введите название товара');

  if (editing.product) {
    await updateDoc(doc(db, COLLECTIONS.products, editing.product), data);
    editing.product = null;
  } else {
    data.createdAt = new Date().toISOString();
    await addDoc(collection(db, COLLECTIONS.products), data);
  }

  e.target.reset();
  renderProducts();
  alert('Товар сохранён');
};

$('#catForm').onsubmit = async e => {
  e.preventDefault();

  const data = {
    title: $('#cTitle').value.trim(),
    icon: $('#cIcon') ? $('#cIcon').value.trim() : '',
    updatedAt: new Date().toISOString()
  };

  if (editing.cat) {
    await updateDoc(doc(db, COLLECTIONS.categories, editing.cat), data);
    editing.cat = null;
  } else {
    data.createdAt = new Date().toISOString();
    await addDoc(collection(db, COLLECTIONS.categories), data);
  }

  e.target.reset();
  renderCats();
};

$('#bannerForm').onsubmit = async e => {
  e.preventDefault();

  const data = {
    title: $('#bTitle').value.trim(),
    text: $('#bText').value.trim(),
    image: $('#bImage').value.trim(),
    link: $('#bLink') ? $('#bLink').value.trim() : '',
    updatedAt: new Date().toISOString()
  };

  if (editing.banner) {
    await updateDoc(doc(db, COLLECTIONS.banners, editing.banner), data);
    editing.banner = null;
  } else {
    data.createdAt = new Date().toISOString();
    await addDoc(collection(db, COLLECTIONS.banners), data);
  }

  e.target.reset();
  renderBanners();
};
