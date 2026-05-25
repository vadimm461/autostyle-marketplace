import { db } from './firebase.js';
import { collection, getDocs, query, orderBy } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const $ = s => document.querySelector(s);
const money = n => (Number(n)||0).toLocaleString('ru-RU') + ' ₽';
let banners = [], current = 0;

async function getList(name){
  const snap = await getDocs(collection(db, name));
  return snap.docs.map(d => ({id:d.id, ...d.data()}));
}

function renderCategories(items){
  const box = $('#categoryList'); if(!box) return;
  if(!items.length){ box.innerHTML = '<div class="catItem">Категории появятся после добавления</div>'; return; }
  box.innerHTML = items.map(c => `<a class="catItem" href="catalog.html?cat=${encodeURIComponent(c.name||'')}"><span>${c.name||'Категория'}</span><b>›</b></a>`).join('');
  const tabs = $('#tabs'); if(tabs) tabs.innerHTML = '<button class="tab active">ТОП товары</button>' + items.map(c=>`<button class="tab">${c.name}</button>`).join('');
}

function renderBanners(items){
  banners = items.length ? items : [{title:'Главный баннер',subtitle:'Добавьте баннеры через админку.',label:'AUTO STYLE',image:''}];
  const slides = $('#slides'); if(!slides) return;
  slides.innerHTML = banners.map((b,i)=>`<article class="slide ${i===0?'active':''}">${b.image?`<img src="${b.image}" alt="">`:''}<small>${b.label||'AUTO STYLE'}</small><h1>${b.title||'Баннер'}</h1><p>${b.subtitle||''}</p></article>`).join('');
  const mini = $('#miniBanners'); if(mini) mini.innerHTML = banners.slice(0,4).map(b=>`<div class="miniBanner">${b.title||'Акция'}</div>`).join('');
}
function showSlide(n){
  const all = document.querySelectorAll('.slide'); if(!all.length) return;
  current = (n + all.length) % all.length;
  all.forEach((s,i)=>s.classList.toggle('active', i===current));
}
$('#prev')?.addEventListener('click',()=>showSlide(current-1));
$('#next')?.addEventListener('click',()=>showSlide(current+1));
setInterval(()=>showSlide(current+1),5000);

function renderProducts(items){
  const box = $('#products'); if(!box) return;
  if(!items.length){ box.innerHTML = '<div class="empty">Товары пока не добавлены. Добавьте товары через админку.</div>'; return; }
  box.innerHTML = items.map(p=>`<article class="product"><span class="badge">${p.category||'AutoStyle'}</span><div class="productImg">${p.image?`<img src="${p.image}" alt="${p.name||''}">`:''}</div><div class="pname">${p.name||'Товар'}</div><div class="price">${money(p.price)}</div><button class="buy">В корзину</button></article>`).join('');
}

async function init(){
  try{
    const [cats,bans,prods] = await Promise.all([getList('categories'), getList('banners'), getList('products')]);
    renderCategories(cats); renderBanners(bans); renderProducts(prods);
  }catch(e){ console.error(e); }
}
init();
