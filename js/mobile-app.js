import { auth, db, COLLECTIONS } from './firebase.js';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, updateProfile, updatePassword } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { doc, setDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getProducts, getCategories, getBanners } from './data-cache.js';

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
let products = [], categories = [], userNow = null;
let cart = JSON.parse(localStorage.getItem('cart') || '[]');
let favs = JSON.parse(localStorage.getItem('favorites') || '[]');
const page = document.body.dataset.page;
const money = v => `${Number(v || 0).toLocaleString('ru-RU')} ₽`;
const title = p => p.title || p.name || 'Без названия';
const img = p => p.image || p.imageUrl || p.photo || p.photoUrl || '';
const group = p => p.group || p.category || p.categoryName || 'Без группы';
const stock = p => Number(p.stock ?? p.quantity ?? p.count ?? p.qty ?? 0);
const price = p => Number(p.price || 0);
const rawOldPrice = p => Number(p.oldPrice || p.priceOld || p.priceBefore || p.compareAtPrice || 0);
const oldPrice = p => rawOldPrice(p) > price(p) ? rawOldPrice(p) : 0;
const discount = p => {
  const op = oldPrice(p), pr = price(p), manual = Number(p.discount || p.discountPercent || p.discount_percent || p.salePercent || 0);
  if (manual > 0) return manual;
  if (op > pr && pr > 0) return Math.round((op - pr) / op * 100);
  return 0;
};
const available = p => stock(p) > 0;
const installment = p => price(p) >= 199 || p.installment === true || p.installmentAvailable === true;
const monthPay = p => Math.ceil(price(p) / 12);
function save(){ localStorage.setItem('cart', JSON.stringify(cart)); localStorage.setItem('favorites', JSON.stringify(favs)); updateCounts(); }
function updateCounts(){ $$('#mCartCount').forEach(x=>x.textContent=cart.length); $$('#mFavCount').forEach(x=>x.textContent=favs.length); }
function addCart(id, btn){ cart.push(id); save(); if(btn){ const t=btn.textContent; btn.textContent='✓ Добавлено'; setTimeout(()=>btn.textContent=t,900); } }
function toggleFav(id, btn){ favs = favs.includes(id) ? favs.filter(x=>x!==id) : [...favs,id]; save(); if(btn) btn.classList.toggle('active', favs.includes(id)); }
function card(p){
  const d=discount(p), op=oldPrice(p), im=img(p);
  return `<article class="m-card">
    <button class="m-fav ${favs.includes(p.id)?'active':''}" data-fav="${p.id}" type="button">♡</button>${d?`<span class="m-discount">-${d}%</span>`:''}
    <a class="m-card-img" href="mobile-product.html?id=${encodeURIComponent(p.id)}">${im?`<img loading="lazy" decoding="async" src="${im}" alt="${title(p)}">`:'<span>Фото</span>'}</a>
    <a class="m-card-title" href="mobile-product.html?id=${encodeURIComponent(p.id)}">${title(p)}</a>
    <div class="m-group">${group(p)}</div>
    ${installment(p)?`<span class="m-installment">от ${money(monthPay(p))}/мес</span>`:''}
    <div class="m-price"><b>${money(price(p))}</b>${op?`<span class="m-old">${money(op)}</span>`:''}</div>
    <button class="m-cart" data-cart="${p.id}" type="button">В корзину</button>
  </article>`;
}
function bind(scope=document){
  scope.querySelectorAll('[data-cart]').forEach(b=>b.onclick=e=>{e.preventDefault(); addCart(b.dataset.cart,b);});
  scope.querySelectorAll('[data-fav]').forEach(b=>b.onclick=e=>{e.preventDefault(); e.stopPropagation(); toggleFav(b.dataset.fav,b);});
}
function clearLoader(){ const l=$('#mLoader'); if(l) setTimeout(()=>l.remove(),150); }
function searchGo(){ const q=($('#mSearch')?.value||'').trim(); location.href = q ? `mobile-catalog.html?search=${encodeURIComponent(q)}` : 'mobile-catalog.html'; }
function setupShell(active='home'){
  $('#mSearchBtn') && ($('#mSearchBtn').onclick=searchGo);
  $('#mSearch') && $('#mSearch').addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); searchGo(); }});
  const nav=$('.m-bottom-inner');
  if(nav) nav.innerHTML = `
    <a class="${active==='home'?'active':''}" href="mobile.html">⌂<span>Главная</span></a>
    <a class="${active==='catalog'?'active':''}" href="mobile-catalog.html">☰<span>Каталог</span></a>
    <a class="${active==='fav'?'active':''}" href="mobile-favorites.html">♡<span>Избранное <b id="mFavCount">0</b></span></a>
    <a class="${active==='cart'?'active':''}" href="mobile-cart.html">🛒<span>Корзина <b id="mCartCount">0</b></span></a>
    <a class="${active==='profile'?'active':''}" href="mobile-profile.html">👤<span>Профиль</span></a>`;
  updateCounts();
}
function norm(s){return String(s||'').trim().toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/[\s_-]+/g,' ')}
function blockedName(n){ const x=norm(n); return x==='тмц'||x==='я мусорка'||x==='ямусорка'||x.includes('мусорка'); }
function catName(c){return c.title||c.name||'Без названия'}
function catId(c){return String(c.id||c.externalId||'')}
function parentKey(c){return String(c.parentId||c.parent||c.parentExternalId||'')}
function isService(c){return /^\s*\d+[.)-]?\s*/.test(catName(c))}
function sortCats(a,b){return Number(a.order??999)-Number(b.order??999)||catName(a).localeCompare(catName(b),'ru')}
function parentsList(){
  const cats=categories.filter(c=>catName(c).trim()&&!blockedName(catName(c))).sort(sortCats);
  const byId=new Map(); cats.forEach(c=>[catId(c),String(c.externalId||'')].filter(Boolean).forEach(id=>byId.set(id,c)));
  const childrenOf=p=>cats.filter(c=>[catId(p),String(p.externalId||'')].filter(Boolean).includes(parentKey(c)) && !blockedName(catName(c))).sort(sortCats);
  let parents=cats.filter(c=>{
    const p=byId.get(parentKey(c));
    if(!p) return !parentKey(c)||childrenOf(c).length>0;
    if(isService(p)) return true;
    return childrenOf(c).length>0;
  }).filter(c=>!isService(c));
  const seen=new Set(); return parents.filter(c=>{const k=catId(c)||norm(catName(c)); if(seen.has(k))return false; seen.add(k); return true;}).sort(sortCats);
}
function childrenOfParent(parent){
  const ids=[catId(parent),String(parent.externalId||'')].filter(Boolean);
  return categories.filter(c=>ids.includes(parentKey(c))&&!blockedName(catName(c))).sort(sortCats);
}
function allLabel(parent){return 'Все '+catName(parent).toLocaleLowerCase('ru-RU')}
function shortChild(child,parent){return catName(child).replace(new RegExp('^'+catName(parent).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s+','i'),'').trim()||catName(child)}
function productInCategory(p, selected){
  if(!selected) return true;
  const g=norm(group(p));
  const c=categories.find(x=>norm(catName(x))===norm(selected));
  if(!c) return g===norm(selected);
  const kids=childrenOfParent(c).map(k=>norm(catName(k)));
  const names=[norm(catName(c)),...kids];
  return names.includes(g);
}
async function initData(){ products=(await getProducts()).filter(available); categories=await getCategories(); }
async function renderHome(){
  setupShell('home'); await initData();
  const banners=await getBanners().catch(()=>[]); const b=banners[0]||{};
  $('#mHero').innerHTML=`<div><span class="m-label">AUTO STYLE MARKET</span><h1>${b.title||'AutoStyle'}</h1><p>${b.text||'Автотовары, аксессуары и автохимия в пару кликов.'}</p></div><div class="m-hero-actions"><a class="m-btn green" href="mobile-catalog.html">Смотреть каталог</a><a class="m-btn" href="#mBest">Лидеры продаж</a></div>`;
  const hot=products.slice(0,10), best=products.filter(p=>['best','bestsellers','leader','leaders'].includes(norm(p.tag))).slice(0,10);
  $('#mNew').innerHTML=hot.slice(0,6).map(card).join('')||'<div class="m-empty">Товары пока загружаются</div>';
  $('#mBest').innerHTML=(best.length?best:hot).slice(0,8).map(card).join('');
  $('#mCats').innerHTML=parentsList().slice(0,12).map(c=>`<a class="m-cat" href="mobile-catalog.html?category=${encodeURIComponent(catName(c))}">${catName(c)}</a>`).join('');
  bind(); clearLoader();
}
async function renderCatalog(){
  setupShell('catalog'); await initData();
  const params=new URLSearchParams(location.search), q=params.get('search')||'', selected=params.get('category')||'';
  const pList=parentsList();
  $('#mCategory').innerHTML='<option value="">Все категории</option>'+pList.map(p=>`<option value="${catName(p)}" ${norm(selected)===norm(catName(p))?'selected':''}>${catName(p)}</option>`).join('');
  $('#mCategory').onchange=e=>{location.href=e.target.value?`mobile-catalog.html?category=${encodeURIComponent(e.target.value)}`:'mobile-catalog.html'};
  $('#mCatChips').innerHTML=pList.slice(0,18).map(p=>`<a class="m-cat" href="mobile-catalog.html?category=${encodeURIComponent(catName(p))}">${catName(p)}</a>`).join('');
  $('#mFilterSearch').value=q;
  $('#mFilterSearch').addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); location.href=`mobile-catalog.html?search=${encodeURIComponent(e.target.value.trim())}`; }});
  let list=products.filter(p=>productInCategory(p,selected));
  if(q) list=list.filter(p=>(title(p)+' '+group(p)).toLowerCase().includes(q.toLowerCase()));
  $('#mCatalogTitle').textContent = selected ? selected : (q ? `Поиск: ${q}` : 'Каталог товаров');
  $('#mCatalogCount').textContent = `${list.length} товаров`;
  $('#mCatalogGrid').innerHTML=list.map(card).join('')||'<div class="m-empty">Товары не найдены</div>';
  bind(); clearLoader();
}
async function renderProduct(){
  setupShell('catalog'); await initData();
  const id=new URLSearchParams(location.search).get('id'); const p=products.find(x=>String(x.id)===String(id));
  if(!p){ $('#mProduct').innerHTML='<div class="m-empty">Товар не найден</div>'; clearLoader(); return; }
  const im=img(p), d=discount(p), op=oldPrice(p);
  let viewed=JSON.parse(localStorage.getItem('viewedProducts')||'[]').filter(x=>x!==p.id); viewed.unshift(p.id); localStorage.setItem('viewedProducts',JSON.stringify(viewed.slice(0,30)));
  $('#mProduct').innerHTML=`<a class="m-btn" href="mobile-catalog.html?category=${encodeURIComponent(group(p))}">← Вернуться в каталог</a>
    <div class="m-product-layout"><div class="m-photo-box"><div class="m-photo">${im?`<img src="${im}" alt="${title(p)}">`:'<span>Фото</span>'}</div></div>
    <div class="m-info"><div class="m-breadcrumb">Главная / Каталог / ${group(p)}</div><h1>${title(p)}</h1><span class="m-tag">${group(p)}</span>${d?` <span class="m-tag" style="background:#ffecec;color:#e3342f">Скидка ${d}%</span>`:''}
    <div class="m-buybox"><div class="m-price-line"><div class="m-big-price">${money(price(p))}</div>${op?`<span class="m-old">${money(op)}</span>`:''}${installment(p)?`<span class="m-installment">Рассрочка от ${money(monthPay(p))} в мес. на 12 мес.</span>`:''}</div><span class="m-stock">В наличии: ${stock(p)}</span>
    <div class="m-buy-actions"><button class="m-action cart" data-cart="${p.id}">В корзину</button><button class="m-action fav ${favs.includes(p.id)?'active':''}" data-fav="${p.id}">♡ ${favs.includes(p.id)?'В избранном':'В избранное'}</button></div></div></div></div>
    <section class="m-desc"><h2>Описание</h2><p>Описание товара пока не добавлено.</p></section>
    <section class="m-specs"><h2>Характеристики</h2><div class="m-spec-row"><span>Название</span><b>${title(p)}</b></div><div class="m-spec-row"><span>Группа</span><b>${group(p)}</b></div><div class="m-spec-row"><span>Остаток</span><b>${stock(p)}</b></div><div class="m-spec-row"><span>Цена</span><b>${money(price(p))}</b></div></section>
    <section class="m-related"><div class="m-section-head"><h2>Похожие товары</h2><a class="m-see" href="mobile-catalog.html?category=${encodeURIComponent(group(p))}">Все</a></div><div class="m-carousel">${products.filter(x=>x.id!==p.id&&group(x)===group(p)).slice(0,12).map(card).join('')||'<div class="m-empty">Похожих товаров пока нет</div>'}</div></section>`;
  bind($('#mProduct')); clearLoader();
}
async function renderCart(){
  setupShell('cart'); await initData();
  const byId=new Map(products.map(p=>[p.id,p])); const counts={}; cart.forEach(id=>counts[id]=(counts[id]||0)+1);
  const rows=Object.keys(counts).map(id=>byId.get(id)).filter(Boolean);
  const total=rows.reduce((s,p)=>s+price(p)*counts[p.id],0);
  $('#mCartList').innerHTML=rows.map(p=>`<div class="m-list-item"><a class="m-list-img" href="mobile-product.html?id=${p.id}">${img(p)?`<img src="${img(p)}" alt="${title(p)}">`:'Фото'}</a><div><b>${title(p)}</b><div class="m-group">${group(p)}</div><div class="m-qty-row"><span>${counts[p.id]} × ${money(price(p))}</span><button class="m-danger" data-remove="${p.id}">Удалить</button></div></div></div>`).join('')||'<div class="m-empty">Корзина пустая</div>';
  $('#mTotal').textContent=money(total);
  $$('[data-remove]').forEach(b=>b.onclick=()=>{cart=cart.filter(id=>id!==b.dataset.remove); save(); renderCart();});
  clearLoader();
}
async function renderFavorites(){
  setupShell('fav'); await initData(); const list=products.filter(p=>favs.includes(p.id));
  $('#mFavGrid').innerHTML=list.map(card).join('')||'<div class="m-empty">В избранном пока пусто</div>'; bind(); clearLoader();
}
function initials(u){const base=(u?.displayName||u?.email||'AS').trim();return base.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'AS'}
async function renderProfile(){
  setupShell('profile');
  onAuthStateChanged(auth,u=>{userNow=u; const box=$('#mProfileBox'); if(!u){ box.innerHTML=`<h1>Профиль</h1><p class="m-group">Войдите, чтобы управлять аккаунтом.</p><input id="pEmail" class="m-input" placeholder="Email" style="margin-top:12px"><input id="pPass" class="m-input" type="password" placeholder="Пароль" style="margin-top:10px"><button id="pLogin" class="m-primary" style="width:100%;margin-top:10px">Войти</button><a class="m-btn" style="width:100%;margin-top:10px" href="register.html">Создать аккаунт</a>`; $('#pLogin').onclick=async()=>signInWithEmailAndPassword(auth,$('#pEmail').value.trim(),$('#pPass').value); clearLoader(); return; }
    box.innerHTML=`<div class="m-row"><div class="m-avatar">${u.photoURL?`<img src="${u.photoURL}">`:initials(u)}</div><div><h1 style="margin:0">${u.displayName||'Профиль'}</h1><div class="m-group">${u.email||''}</div></div></div><div class="m-profile-actions"><a class="green" href="mobile-profile.html#edit">Редактировать профиль</a><a href="mobile-favorites.html">♡ Избранное</a><a href="mobile-cart.html">🛒 Корзина</a></div><div id="edit" style="margin-top:18px"><input id="nameEdit" class="m-input" value="${u.displayName||''}" placeholder="Имя"><input id="photoEdit" class="m-input" value="${u.photoURL||''}" placeholder="Фото URL" style="margin-top:10px"><input id="passEdit" class="m-input" type="password" placeholder="Новый пароль" style="margin-top:10px"><button id="saveProfile" class="m-primary" style="width:100%;margin-top:10px">Сохранить</button><button id="pLogout" class="m-danger" style="width:100%;height:50px;margin-top:10px">Выйти</button></div>`;
    $('#saveProfile').onclick=async()=>{await updateProfile(u,{displayName:$('#nameEdit').value.trim(),photoURL:$('#photoEdit').value.trim()||null}); if($('#passEdit').value.trim()) await updatePassword(u,$('#passEdit').value.trim()); await setDoc(doc(db,COLLECTIONS.users,u.uid),{name:$('#nameEdit').value.trim(),email:u.email,photoURL:$('#photoEdit').value.trim()||''},{merge:true}); alert('Сохранено'); location.reload();};
    $('#pLogout').onclick=async()=>{localStorage.removeItem('cart');localStorage.removeItem('favorites');await signOut(auth);location.href='mobile.html'}; clearLoader(); });
}
(async()=>{
  try{
    if(page==='home') await renderHome();
    if(page==='catalog') await renderCatalog();
    if(page==='product') await renderProduct();
    if(page==='cart') await renderCart();
    if(page==='favorites') await renderFavorites();
    if(page==='profile') await renderProfile();
  }catch(e){ console.error(e); clearLoader(); }
})();
