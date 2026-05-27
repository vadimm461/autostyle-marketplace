import { db, COLLECTIONS } from './firebase.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { initMobileUi, setupSearch, productTitle, productImage, priceHtml, stockText, addToCart, updateCartCount } from './common.js';

const root=document.querySelector('#productRoot');
initMobileUi(); setupSearch();

async function load(){
  const id=new URLSearchParams(location.search).get('id');
  if(!id){root.innerHTML='<div class="notice">Товар не найден.</div>';return;}
  const s=await getDoc(doc(db,COLLECTIONS.products,id));
  if(!s.exists()){root.innerHTML='<div class="notice">Товар не найден.</div>';return;}
  const p={id:s.id,...s.data()};
  const img=productImage(p);
  root.innerHTML=`<section class="product-layout">
    <div class="product-gallery"><div class="main-photo">${img?`<img src="${img}" alt="${productTitle(p)}">`:'Фото'}</div></div>
    <div class="product-info">
      <h1>${productTitle(p)}</h1>
      <div class="product-meta">${p.category||''}</div>
      <div class="product-meta">Код: ${p.code||p.article||p.id.slice(0,8).toUpperCase()}</div>
      ${priceHtml(p,'product-')}
      <div class="stock">${stockText(p)}</div>
      <p>${p.description||'Описание не добавлено'}</p>
      <div class="product-actions"><button id="addToCart" class="primary">В корзину</button><a class="icon-btn" href="catalog.html">Назад</a></div>
    </div>
  </section>`;
  document.querySelector('#addToCart').onclick=()=>{addToCart(p.id);updateCartCount();document.querySelector('#addToCart').textContent='Добавлено';};
}
load();
