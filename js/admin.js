import { auth, db } from './firebase.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  query,
  orderBy
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const $ = s => document.querySelector(s);
let active = 'products';
let editId = null;

const schemas = {
  products: [
    ['title','Название товара'],
    ['price','Цена'],
    ['oldPrice','Старая цена'],
    ['category','Категория'],
    ['image','Ссылка на фото'],
    ['rating','Рейтинг']
  ],
  categories: [
    ['title','Название категории']
  ],
  banners: [
    ['title','Заголовок'],
    ['subtitle','Подзаголовок'],
    ['text','Текст'],
    ['image','Ссылка на картинку']
  ]
};

function title(type){
  return type === 'products' ? 'Товары' : type === 'categories' ? 'Категории' : 'Баннеры';
}

function formHtml(type, data={}){
  return `<h2>${title(type)}</h2>
  <p class="muted">Здесь можно добавлять, редактировать и удалять всё, что отображается на главной странице.</p>
  <form id="adminForm" class="admin-grid">
    ${schemas[type].map(([field,label])=>`<label class="field">${label}<input id="${field}" value="${data[field]||''}" ${field==='price'||field==='oldPrice'?'type="number"':''}></label>`).join('')}
    <button class="primary">${editId ? 'Сохранить изменения' : 'Добавить'}</button>
    ${editId ? '<button type="button" class="danger" onclick="cancelEdit()">Отмена</button>' : ''}
  </form>
  <div id="list"></div>`;
}

async function getItems(type){
  const snap = await getDocs(query(collection(db,type), orderBy('createdAt','desc'))).catch(async()=>{
    return await getDocs(collection(db,type)).catch(()=>null);
  });
  return snap ? snap.docs.map(d=>({id:d.id,...d.data()})) : [];
}

async function load(type=active){
  active = type;
  editId = null;
  document.querySelectorAll('.admin-side button[data-type]').forEach(b=>b.classList.toggle('active',b.dataset.type===type));
  $('#panel').innerHTML = formHtml(type);
  $('#adminForm').onsubmit = save;
  await renderList();
}

async function renderList(){
  const items = await getItems(active);
  $('#list').innerHTML = items.length ? items.map(x=>`
    <div class="list-item">
      <div>
        <b>${x.title || x.name || 'Без названия'}</b>
        <p class="muted">${x.category || x.subtitle || x.text || x.price || ''}</p>
      </div>
      <div class="list-actions">
        <button onclick="editItem('${active}','${x.id}')">Редактировать</button>
        <button class="danger" onclick="removeItem('${active}','${x.id}')">Удалить</button>
      </div>
    </div>`).join('') : '<p class="muted">Пока пусто. Добавьте первый элемент.</p>';
}

async function save(e){
  e.preventDefault();
  const data = { updatedAt: serverTimestamp() };
  schemas[active].forEach(([field])=>{
    const el = $('#'+field);
    data[field] = el ? el.value.trim() : '';
  });
  if (!data.createdAt) data.createdAt = serverTimestamp();

  if (editId) {
    await updateDoc(doc(db, active, editId), data);
  } else {
    await addDoc(collection(db, active), { ...data, createdAt: serverTimestamp() });
  }
  editId = null;
  await load(active);
}

window.editItem = async (type,id) => {
  active = type;
  editId = id;
  const snap = await getDoc(doc(db,type,id));
  if (!snap.exists()) return;
  $('#panel').innerHTML = formHtml(type, snap.data());
  $('#adminForm').onsubmit = save;
  await renderList();
};

window.cancelEdit = () => load(active);

window.removeItem = async (type,id) => {
  if (!confirm('Удалить элемент?')) return;
  await deleteDoc(doc(db,type,id));
  await load(type);
};

window.load = load;
window.logout = () => signOut(auth).then(()=>location.href='index.html');

onAuthStateChanged(auth, async user=>{
  if(!user){ location.href='login.html'; return; }
  const snap = await getDoc(doc(db,'users',user.uid)).catch(()=>null);
  if(!snap || !snap.exists() || snap.data().role !== 'admin'){
    $('#panel').innerHTML='<h2>Нет доступа</h2><p>Для админки нужен role: admin в Firestore → users → ваш UID.</p>';
    return;
  }
  $('#adminEmail').textContent = user.email;
  load('products');
});
