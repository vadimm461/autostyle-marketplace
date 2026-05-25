import { db } from './firebase.js';
import { collection, getDocs, orderBy, query } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
const fmt = new Intl.NumberFormat('ru-RU');
const grid = document.querySelector('#catalogGrid');
const search = document.querySelector('#search');
const cat = document.querySelector('#category');
let items=[];
async function load(){
 const snap=await getDocs(query(collection(db,'products'),orderBy('createdAt','desc')));
 items=snap.docs.map(d=>({id:d.id,...d.data()})); render();
}
function render(){
 if(!grid)return; const q=(search?.value||'').toLowerCase(); const c=cat?.value||'';
 const list=items.filter(p=>(!c||p.category===c)&&(`${p.title} ${p.description}`.toLowerCase().includes(q)));
 grid.innerHTML=list.map(p=>`<a class="product" href="product.html?id=${p.id}"><img class="pimg" src="${p.imageUrl||'assets/placeholder.svg'}"><div class="pbody"><span class="chip">${p.category||'AutoStyle'}</span><h3>${p.title||'Товар'}</h3><div class="price">${fmt.format(Number(p.price||0))} ₽</div><p class="muted">${(p.description||'').slice(0,100)}</p></div></a>`).join('') || '<div class="notice">Товары не найдены.</div>';
}
search?.addEventListener('input',render); cat?.addEventListener('change',render); load();
