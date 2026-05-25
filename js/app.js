import { db } from './firebase.js';
import { collection, getDocs, query, orderBy } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const grid = document.getElementById('productsGrid');
if (grid) loadProducts();

async function loadProducts(){
  try{
    const q = query(collection(db,'products'), orderBy('createdAt','desc'));
    const snap = await getDocs(q);
    grid.innerHTML = '';
    if(snap.empty){ grid.innerHTML = '<p>Пока товаров нет. Добавь их через админку.</p>'; return; }
    snap.forEach(doc=>{
      const p = doc.data();
      grid.innerHTML += `<article class="product"><div class="product-img">${p.imageUrl ? `<img src="${p.imageUrl}" style="width:100%;height:100%;object-fit:cover">`:'🛞'}</div><div class="product-body"><h3>${p.title||'Товар'}</h3><p>${p.category||'Категория'}</p><div class="price">${p.price||0} ₴</div></div></article>`;
    });
  }catch(e){ grid.innerHTML = '<p>Проверь Firebase config и правила Firestore.</p>'; console.error(e); }
}
