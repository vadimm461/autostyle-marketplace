import { db, COLLECTIONS } from './firebase.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const $ = s => document.querySelector(s);
let favs = JSON.parse(localStorage.getItem('favorites') || '[]');
let cart = JSON.parse(localStorage.getItem('cart') || '[]');
const money = v => `${Number(v || 0).toLocaleString('ru-RU')} ₽`;
const stock = p => Number(p.stock ?? p.quantity ?? p.count ?? 0);
const title = p => p.title || p.name || 'Товар';
const image = p => p.image || p.imageUrl || p.photo || '';
const group = p => p.group || p.category || p.categoryName || 'Без группы';
const oldPrice = p => Number(p.oldPrice || p.priceOld || p.compareAtPrice || 0);
function discount(p){ const d=Number(p.discount||p.discountPercent||0); if(d>0)return d; const op=oldPrice(p), pr=Number(p.price||0); return op>pr&&pr>0?Math.round((op-pr)/op*100):0; }
function saveFav(){ localStorage.setItem('favorites', JSON.stringify(favs)); }
function updateCart(){ localStorage.setItem('cart', JSON.stringify(cart)); $('#cartCount') && ($('#cartCount').textContent = cart.length); }
function setupSearch(){
  const input=$('#siteSearch'), btn=$('#siteSearchBtn');
  const go=()=>{const q=encodeURIComponent((input?.value||'').trim()); location.href=q?`catalog.html?search=${q}`:'catalog.html'};
  btn&&(btn.onclick=go); input&&input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();go();}});
}
function card(p){
  const d=discount(p), op=oldPrice(p), s=stock(p);
  return `<article class="catalog-card favorite-card">
    <button class="fav-btn active" data-fav="${p.id}" type="button">♥</button>
    <a class="catalog-card-link" href="product.html?id=${p.id}">
      <div class="catalog-card-photo">${d?`<span class="discount-badge">-${d}%</span>`:''}${image(p)?`<img src="${image(p)}" alt="${title(p)}">`:'<span>Фото</span>'}</div>
      <div class="catalog-card-body"><h3>${title(p)}</h3><div class="catalog-card-category">${group(p)}</div><div class="price-row-card"><div class="catalog-card-price">${money(p.price)}</div>${op?`<div class="old-price">${money(op)}</div>`:''}</div><div class="catalog-card-stock">${s>0?'В наличии: '+s:'Нет в наличии'}</div></div>
    </a>
    <button class="catalog-cart-btn" data-cart="${p.id}" type="button" ${s<=0?'disabled':''}>В корзину</button>
  </article>`;
}
function bind(){
  document.querySelectorAll('[data-cart]').forEach(b=>b.onclick=e=>{e.preventDefault(); cart.push(b.dataset.cart); updateCart(); b.textContent='Добавлено'; setTimeout(()=>b.textContent='В корзину',900);});
  document.querySelectorAll('[data-fav]').forEach(b=>b.onclick=e=>{e.preventDefault(); e.stopPropagation(); const id=b.dataset.fav; favs=favs.filter(x=>x!==id); saveFav(); loadFavorites();});
}
async function loadFavorites(){
  const grid=$('#favoritesGrid'), titleEl=$('#favoritesCount'); if(!grid) return;
  favs = JSON.parse(localStorage.getItem('favorites') || '[]');
  titleEl && (titleEl.textContent = favs.length ? `Избранное: ${favs.length}` : 'Избранное');
  if(!favs.length){ grid.innerHTML='<div class="notice">В избранном пока пусто.</div>'; return; }
  grid.innerHTML='<div class="app-loader">Загрузка избранного...</div>';
  const products=[];
  for(const id of favs){
    try{ const snap=await getDoc(doc(db, COLLECTIONS.products, id)); if(snap.exists()) products.push({id:snap.id,...snap.data()}); }
    catch(e){}
  }
  if(!products.length){ grid.innerHTML='<div class="notice">Товары из избранного не найдены.</div>'; return; }
  grid.innerHTML=products.map(card).join(''); bind();
}
updateCart(); setupSearch(); loadFavorites();
