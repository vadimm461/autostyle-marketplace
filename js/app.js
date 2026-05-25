import { db } from './firebase.js';
import { collection, getDocs, orderBy, query } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
const grid=document.getElementById('productGrid');
async function load(){ if(!grid)return; grid.innerHTML='<p>Загрузка товаров...</p>'; const q=query(collection(db,'products'),orderBy('createdAt','desc')); const snap=await getDocs(q); grid.innerHTML=''; snap.forEach(doc=>{const p=doc.data(); grid.innerHTML+=`<article class="product-card"><img src="${p.imageUrl||''}" alt=""><h3>${p.title}</h3><p>${p.category||'AutoStyle'}</p><div class="price">${p.price} ₽</div><p>${p.description||''}</p></article>`}); if(!snap.size)grid.innerHTML='<p>Пока товаров нет. Добавь первый товар в админке.</p>'}
load();
