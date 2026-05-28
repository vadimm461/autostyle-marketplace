import { auth, db, COLLECTIONS } from './firebase.js';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, sendEmailVerification } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { collection, getDocs, setDoc, doc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
const $=s=>document.querySelector(s); const $$=s=>document.querySelectorAll(s);
let cart=JSON.parse(localStorage.getItem('cart')||'[]');
let favorites=JSON.parse(localStorage.getItem('favorites')||'[]');
let allProducts=[];
const expandedHomeSections = new Set();
const money=v=>`${Number(v||0).toLocaleString('ru-RU')} ₽`;
const title=p=>p.title||p.name||'Без названия';
const image=p=>p.image||p.imageUrl||p.photo||'';
const stock=p=>Number(p.stock??p.quantity??p.count??0);
const group=p=>p.group||p.category||p.categoryName||p.tag||'Без группы';
function oldPrice(p){return Number(p.oldPrice||p.old_price||p.priceOld||p.compareAtPrice||p.priceBefore||0)}
function discount(p){let d=Number(p.discount||p.discountPercent||p.sale||0); if(!d && oldPrice(p)>Number(p.price||0)) d=Math.round((oldPrice(p)-Number(p.price||0))/oldPrice(p)*100); return d>0?d:0}
function saveFav(){localStorage.setItem('favorites',JSON.stringify(favorites)); document.querySelectorAll('[data-fav-count]').forEach(x=>x.textContent=favorites.length)}
function toggleFavorite(id){ if(!id)return; favorites=favorites.includes(id)?favorites.filter(x=>x!==id):[...favorites,id]; saveFav(); document.querySelectorAll(`[data-fav="${id}"]`).forEach(btn=>btn.classList.toggle('active',favorites.includes(id))); }
function updateCart(){localStorage.setItem('cart',JSON.stringify(cart)); const c=$('#cartCount'); if(c)c.textContent=cart.length}
async function getCol(name){const snap=await getDocs(collection(db,name)); return snap.docs.map(d=>({id:d.id,...d.data()}))}
function card(p, withCart=false){const d=discount(p), op=oldPrice(p), fav=favorites.includes(p.id); return `<a class="modern-card" href="product.html?id=${p.id}">${d?`<span class="discount-badge">-${d}%</span>`:''}<button class="fav-heart ${fav?'active':''}" data-fav="${p.id}" type="button" aria-label="В избранное">♡</button><div class="modern-card-image">${image(p)?`<img src="${image(p)}" alt="${title(p)}">`:'Фото'}</div><h3 class="modern-card-title">${title(p)}</h3><div class="modern-code">Группа: ${group(p)}</div><div class="modern-price"><b>${money(p.price)}</b>${op?`<span class="old-price">${money(op)}</span>`:''}</div>${withCart?`<button class="black-cart" data-id="${p.id}" type="button">🛒 В корзину</button>`:''}</a>`}
function assignedTo(section){
  return allProducts.filter(p => stock(p) > 0 && p.showOnHome === true && (
    p.homeSection === section ||
    p.homeBlock === section ||
    (Array.isArray(p.homeSections) && p.homeSections.includes(section))
  ));
}
function pick(section){
  const arr = assignedTo(section);
  return expandedHomeSections.has(section) ? arr : arr.slice(0, 5);
}
function renderOne(sel, section){
  const box=$(sel); if(!box)return;
  const arr = pick(section);
  box.innerHTML=arr.length?arr.map(p=>card(p)).join(''):`<div class="notice">Добавьте товары в блок «${homeSectionTitle(section)}» в админке.</div>`;
  const btn = document.querySelector(`[data-show-section="${section}"]`);
  if(btn){
    const total = assignedTo(section).length;
    btn.style.display = total > 5 ? 'inline-flex' : 'none';
    btn.textContent = expandedHomeSections.has(section) ? 'Свернуть' : 'Смотреть все';
  }
}
function homeSectionTitle(section){
  return ({popular:'Популярные товары', new:'Новинки', recent:'Недавно просмотренные', leaders:'Лидеры продаж'}[section] || 'Главная');
}
function renderProducts(){
  renderOne('#productsGrid', 'popular');
  renderOne('#newProductsGrid', 'new');
  renderOne('#recentProductsGrid', 'recent');
  renderOne('#leadersProductsGrid', 'leaders');
  bindProductButtons();
  bindSeeAllButtons();
}
function bindSeeAllButtons(){
  $$('[data-show-section]').forEach(btn=>btn.onclick=()=>{
    const section = btn.dataset.showSection;
    if(expandedHomeSections.has(section)) expandedHomeSections.delete(section); else expandedHomeSections.add(section);
    renderProducts();
    const block = document.querySelector(`[data-home-section="${section}"]`);
    if(block) block.scrollIntoView({behavior:'smooth', block:'start'});
  });
}
function bindProductButtons(){
  $$('.fav-heart').forEach(btn=>btn.onclick=e=>{e.preventDefault();e.stopPropagation();toggleFavorite(btn.dataset.fav)});
  $$('.black-cart').forEach(btn=>btn.onclick=e=>{e.preventDefault();e.stopPropagation(); const p=allProducts.find(x=>x.id===btn.dataset.id); if(p){cart.push({id:p.id,title:title(p),price:Number(p.price||0),image:image(p),qty:1}); updateCart();}});
}
async function renderCatalogMenu(){let categories=[]; try{categories=await getCol(COLLECTIONS.categories)}catch(e){} const parentsBox=$('#catalogParents'), childrenBox=$('#catalogChildren'), titleBox=$('#megaTitle'); if(!parentsBox||!childrenBox||!titleBox)return; const parents=categories.filter(c=>!c.parentId), children=categories.filter(c=>c.parentId); const name=c=>c.title||c.name||'Без названия'; function renderChildren(parent){const list=children.filter(c=>c.parentId===parent.id||c.parentId===parent.externalId); titleBox.textContent=name(parent); childrenBox.innerHTML=(list.length?list:[parent]).map(ch=>`<a href="catalog.html?category=${encodeURIComponent(name(ch))}" class="mega-child"><span>${ch.icon||'AS'}</span><div><b>${name(ch)}</b><small>Смотреть товары</small></div></a>`).join('')} parentsBox.innerHTML=parents.length?parents.map((p,i)=>`<button class="mega-parent ${i?'':'active'}" data-parent="${p.id}" type="button"><span>${p.icon||'AS'}</span>${name(p)}</button>`).join(''):'<p class="muted">Категорий пока нет</p>'; if(parents[0])renderChildren(parents[0]); $$('.mega-parent').forEach(btn=>btn.onmouseenter=()=>{ $$('.mega-parent').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); const p=parents.find(x=>x.id===btn.dataset.parent); if(p)renderChildren(p)})}
function setupSearch(){const input=$('#homeSearch'),btn=$('#homeSearchBtn'); const go=()=>{const q=encodeURIComponent((input?.value||'').trim()); location.href=q?`catalog.html?search=${q}`:'catalog.html'}; if(btn)btn.onclick=go; if(input)input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();go()}}}
function authModal(){const modal=$('#authModal'); if(!modal)return; $('#openAuth')&&($('#openAuth').onclick=()=>modal.classList.add('open')); $('#closeAuth')&&($('#closeAuth').onclick=()=>modal.classList.remove('open')); $$('.tab').forEach(t=>t.onclick=()=>{$$('.tab').forEach(x=>x.classList.remove('active'));t.classList.add('active');$('#loginForm').style.display=t.dataset.tab==='login'?'block':'none';$('#registerForm').style.display=t.dataset.tab==='register'?'block':'none'}); $('#loginForm')&&($('#loginForm').onsubmit=async e=>{e.preventDefault();await signInWithEmailAndPassword(auth,$('#loginEmail').value.trim(),$('#loginPass').value);modal.classList.remove('open')}); $('#registerForm')&&($('#registerForm').onsubmit=async e=>{e.preventDefault();const res=await createUserWithEmailAndPassword(auth,$('#regEmail').value.trim(),$('#regPass').value);await setDoc(doc(db,COLLECTIONS.users,res.user.uid),{name:$('#regName').value.trim(),email:$('#regEmail').value.trim(),role:'user',createdAt:new Date().toISOString()});await sendEmailVerification(res.user);alert('Аккаунт создан. Проверьте почту.');modal.classList.remove('open')}); onAuthStateChanged(auth,u=>{const open=$('#openAuth'),dd=$('#accountDrop'); if(u){if(open)open.style.display='none'; if(dd){dd.style.display='block'; $('#userEmail')&&($('#userEmail').textContent=u.email||'Аккаунт'); $('#logout')&&($('#logout').onclick=()=>signOut(auth))}}else{if(open)open.style.display='inline-flex'; if(dd)dd.style.display='none'}}); $('#accountBtn')&&($('#accountBtn').onclick=e=>{e.preventDefault();$('#accountDrop').classList.toggle('open')})}
async function init(){authModal(); setupSearch(); updateCart(); saveFav(); try{allProducts=await getCol(COLLECTIONS.products)}catch(e){allProducts=[]} renderProducts(); renderCatalogMenu()} init();
