import { auth, db } from './firebase.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { collection, getDocs, query, orderBy, limit } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const fmt = new Intl.NumberFormat('ru-RU');
const $ = s => document.querySelector(s);
const productsEl = $('#featuredProducts');

onAuthStateChanged(auth, user => {
  document.querySelectorAll('[data-user]').forEach(el => el.classList.toggle('hidden', !user));
  document.querySelectorAll('[data-guest]').forEach(el => el.classList.toggle('hidden', !!user));
});

document.querySelectorAll('[data-logout]').forEach(btn => btn.onclick = async () => { await signOut(auth); location.href='index.html'; });

async function loadFeatured(){
  if(!productsEl) return;
  const snap = await getDocs(query(collection(db,'products'), orderBy('createdAt','desc'), limit(6)));
  productsEl.innerHTML = '';
  if(snap.empty){ productsEl.innerHTML = '<div class="notice">Пока нет товаров. Добавь первый товар в админке.</div>'; return; }
  snap.forEach(d=>{
    const p=d.data();
    productsEl.insertAdjacentHTML('beforeend', `<a class="product" href="product.html?id=${d.id}"><img class="pimg" src="${p.imageUrl||'assets/placeholder.svg'}" alt="${p.title||''}"><div class="pbody"><span class="chip">${p.category||'AutoStyle'}</span><h3>${p.title||'Товар'}</h3><div class="price">${fmt.format(Number(p.price||0))} ₽</div><p class="muted">${(p.description||'').slice(0,90)}</p></div></a>`);
  });
}
loadFeatured();
