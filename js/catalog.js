
function renderTopCategoryBar(){
  const bar=document.getElementById('topCategoryBar');
  if(!bar||!cat)return;
  const current=cat.value||'';
  const parents=getParents(false).filter(c=>!isServiceGroup(c));
  const activeParent=parents.find(p=>catName(p)===current)||parents.find(p=>childrenOf(p).some(ch=>catName(ch)===current))||parents[0];
  const children=activeParent?childrenOf(activeParent).filter(ch=>!isServiceGroup(ch)):[];
  if(!activeParent){bar.innerHTML='';return;}
  const allActive=current===''||current===catName(activeParent);
  bar.innerHTML=`<button class="top-cat-btn ${allActive?'active':''}" type="button" data-cat="${catName(activeParent)}">${parentAllLabel(activeParent)}</button>`+
    children.map(ch=>{const n=catName(ch);return `<button class="top-cat-btn ${current===n?'active':''}" type="button" data-cat="${n}">${shortChildName(ch,activeParent)}</button>`}).join('');
  bar.querySelectorAll('[data-cat]').forEach(btn=>btn.onclick=()=>{
    cat.value=btn.dataset.cat;
    render();
    renderCategoryFilter();
    renderTopCategoryBar();
  });
}

function ensureCatalogControlsInSidebar(){
  const sidebar=document.querySelector('.catalog-filters');
  if(!sidebar)return;
  let box=document.getElementById('catalogSidebarControls');
  if(!box){
    box=document.createElement('div');
    box.id='catalogSidebarControls';
    box.className='catalog-sidebar-controls';
    sidebar.appendChild(box);
  }
  const price=document.querySelector('.catalog-top-price');
  if(price && !box.contains(price)){
    price.classList.add('sidebar-price-filter');
    box.appendChild(price);
  }
  const sortField=document.getElementById('sort')?.closest('.field');
  if(sortField && !box.contains(sortField)){
    sortField.classList.add('sidebar-sort-filter');
    box.appendChild(sortField);
  }
  const zero=document.getElementById('zeroNotice');
  if(zero && !box.contains(zero)){
    zero.classList.add('sidebar-zero-toggle');
    box.appendChild(zero);
  }
}


import { auth, db, COLLECTIONS } from './firebase.js';
import { onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { setDoc, doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { loginEmail, registerEmail, sendSmsCode, confirmSmsCode, ensureUserProfile } from './auth-core.js';
import { getProducts, getCategories } from './data-cache.js';
import { addUserCartItem, getCurrentUserCart, waitUserCartReady, updateCartBadges } from './user-cart-store.js';
const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);const fmt=new Intl.NumberFormat('ru-RU');let items=[],categories=[],cart=[],favs=JSON.parse(localStorage.getItem('favorites')||'[]'),showZero=false;const grid=$('#catalogGrid'),search=$('#search'),topSearch=$('#topSearch'),cat=$('#category'),sort=$('#sort'),count=$('#catalogCount');


async function getAccountMenuUser(user){
  if(!user) return null;
  let profile = {};
  try{
    const usersCollection = COLLECTIONS.users || 'autostyle_users';
    const snap = await getDoc(doc(db, usersCollection, user.uid));
    if(snap.exists()) profile = snap.data() || {};
  }catch(err){
    console.warn('account menu profile load error', err);
  }
  return {
    uid: user.uid,
    email: profile.email || user.email || user.phoneNumber || '',
    phoneNumber: profile.phone || user.phoneNumber || '',
    displayName: profile.name || profile.displayName || user.displayName || '',
    name: profile.name || profile.displayName || user.displayName || '',
    photoURL: profile.photoURL || profile.photo || profile.avatar || user.photoURL || ''
  };
}

function clearCartAndFavorites(){
  // Не очищаем корзину и избранное при обычной загрузке страницы или выходе.
  // Иначе гость/разлогин получает пустую корзину сразу после открытия сайта.
  localStorage.removeItem('autostyle_user');
  window.dispatchEvent(new Event('autostyle-account-cleared'));
}

function money(v){return `${fmt.format(Number(v||0))} ₽`}function stock(p){return Number(p.stock??p.quantity??p.count??1)}function title(p){return p.title||p.name||'Товар'}function image(p){return p.image||p.imageUrl||p.photo||''}function group(p){return p.group||p.category||p.categoryName||'Без группы'}function rawOldPrice(p){return Number(p.oldPrice||p.priceOld||p.compareAtPrice||0)}function oldPrice(p){const op=rawOldPrice(p),pr=Number(p.price||0);return op>pr?op:0}function discount(p){const manual=Number(p.discount||p.discountPercent||0),rawOp=rawOldPrice(p),op=oldPrice(p),pr=Number(p.price||0);if(manual>0)return manual;return op>pr&&pr>0?Math.round((op-pr)/op*100):0}function cartQtyCount(rows = cart){return (Array.isArray(rows)?rows:[]).reduce((sum,item)=>sum+(item&&typeof item==='object'?Math.max(1,Number(item.qty??item.quantity??item.count??1)||1):1),0)}function updateCart(){cart=getCurrentUserCart();updateCartBadges(cart)}function saveFav(){localStorage.setItem('favorites',JSON.stringify(favs))}
async function getCollection(n){return n===COLLECTIONS.products?await getProducts():n===COLLECTIONS.categories?await getCategories():[]}

function catName(c){ return (c.title || c.name || '').trim() || 'Без названия'; }
function catId(c){ return String(c.id || c.externalId || '').trim(); }
function catParent(c){ return String(c.parentId || c.parent || c.parentExternalId || '').trim(); }
function sortCats(a,b){ return Number(a.order ?? 999) - Number(b.order ?? 999) || catName(a).localeCompare(catName(b), 'ru'); }
function isServiceGroup(c){ return /^\s*\d+[.)-]?\s*/.test(catName(c)); }
function normCatText(text){return String(text||'').trim().toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/[\s_-]+/g,' ')}
function isBlockedCatalogName(text){const n=normCatText(text);return n==='тмц'||n==='я мусорка'||n==='ямусорка'||n.includes('мусорка')}
function isBlockedCategory(c){return isBlockedCatalogName(catName(c))}
function showInTopCatalog(c){return c.showInTopCatalog!==false && c.hideFromTopCatalog!==true && !isBlockedCategory(c) && !isServiceGroup(c)}
function childrenOf(parent){
  const ids = [catId(parent), String(parent.externalId || '').trim()].filter(Boolean);
  return categories.filter(c => ids.includes(catParent(c)) && !isBlockedCategory(c)).sort(sortCats);
}
function getParents(forTopCatalog=false){
  const allowed = c => forTopCatalog ? showInTopCatalog(c) : (!isBlockedCategory(c) && !isServiceGroup(c));
  const byId = new Map();
  categories.forEach(c => { [catId(c), String(c.externalId || '').trim()].filter(Boolean).forEach(id => byId.set(id, c)); });
  const parentOf = c => byId.get(catParent(c));
  const list = categories.filter(c => {
    if (!allowed(c)) return false;
    const p = parentOf(c);
    if (!p) return !catParent(c) || childrenOf(c).length > 0;
    if (isServiceGroup(p)) return true;
    return childrenOf(c).length > 0;
  });
  const seen = new Set();
  return list.filter(c => { const key = catId(c) || catName(c).toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; }).sort(sortCats);
}
function shortChildName(child, parent){
  let childName = catName(child);
  const parentName = catName(parent);
  const re = new RegExp('^' + parentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+', 'i');
  childName = childName.replace(re, '').trim();
  return childName || catName(child);
}
function parentAllLabel(parent){
  const raw = catName(parent).trim();
  const lower = raw.toLocaleLowerCase('ru-RU');
  const map = {
    'инструмент':'инструменты',
    'аккумулятор':'аккумуляторы',
    'ароматизатор':'ароматизаторы',
    'лампочка':'лампочки',
    'колпак':'колпаки',
    'коврик':'коврики',
    'фильтр':'фильтры'
  };
  return 'Все ' + (map[lower] || lower);
}
function categoryNamesFor(value){
  if (!value) return [];
  const found = categories.find(c => catName(c) === value);
  if (!found) return [value];
  const kids = childrenOf(found).map(catName);
  return [catName(found), ...kids];
}
async function renderCatalogMenu(){
  const pb=$('#catalogParents'), cb=$('#catalogChildren'), tb=$('#megaTitle');
  if(!pb||!cb||!tb)return;
  const parents=getParents(true);
  function render(parent){
    const list=childrenOf(parent).filter(showInTopCatalog);
    tb.textContent=catName(parent);
    const allItem = `<a href="catalog.html?category=${encodeURIComponent(catName(parent))}" class="mega-child mega-child-all"><div><b>${parentAllLabel(parent)}</b><small>Основная категория и все подкатегории</small></div></a>`;
    cb.innerHTML = allItem + list.map(ch=>`<a href="catalog.html?category=${encodeURIComponent(catName(ch))}" class="mega-child"><div><b>${shortChildName(ch,parent)}</b><small>${catName(ch)}</small></div></a>`).join('');
  }
  pb.innerHTML=parents.length?parents.map((p,i)=>`<button class="mega-parent ${i?'':'active'}" type="button" data-parent="${catId(p)}">${catName(p)}</button>`).join(''):'<p class="muted">Категорий пока нет</p>';
  if(parents[0])render(parents[0]);
  $$('.mega-parent').forEach(b=>b.onmouseenter=b.onclick=()=>{$$('.mega-parent').forEach(x=>x.classList.remove('active'));b.classList.add('active');const p=parents.find(x=>catId(x)===b.dataset.parent);if(p)render(p)});
}
function renderCategoryFilter(){
  if(!cat)return;
  const host=document.querySelector('.catalog-filters')||document.querySelector('.filters')||document.querySelector('aside')||document.body;
  let box = document.getElementById('categoryTreeFilter');
  if(!box){
    box=document.createElement('div');
    box.id='categoryTreeFilter';
    const first=host.firstElementChild;
    if(first) first.after(box); else host.prepend(box);
  }
  box.className='category-tree-filter category-tree-filter-main-only';
  const current=cat.value||'';
  const parents=getParents(false).filter(c=>!isServiceGroup(c));
  const activeParent=parents.find(p=>catName(p)===current)||parents.find(p=>childrenOf(p).some(ch=>catName(ch)===current));
  box.innerHTML=`<div class="cat-filter-head"><b>Каталог</b><button type="button" id="clearCategoryFilter">Все товары</button></div><div class="cat-tree-parents main-only-list">${parents.length?parents.map(p=>{const n=catName(p);const active=activeParent&&catId(activeParent)===catId(p);return `<button type="button" class="cat-tree-parent ${active?'active':''}" data-cat="${n}">${n}</button>`}).join(''):'<span class="muted">Категорий пока нет</span>'}</div>`;
  const clear=document.getElementById('clearCategoryFilter');
  if(clear)clear.onclick=()=>{cat.value='';render();renderCategoryFilter();renderTopCategoryBar();};
  box.querySelectorAll('[data-cat]').forEach(btn=>btn.onclick=()=>{
    cat.value=btn.dataset.cat;
    render();
    renderCategoryFilter();
    renderTopCategoryBar();
  });
}

function setupSearch(){const btn=$('#topSearchBtn');function go(){const q=encodeURIComponent((topSearch?.value||'').trim());location.href=q?`catalog.html?search=${q}`:'catalog.html'}btn&&(btn.onclick=go);topSearch&&topSearch.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();go()}})}
search?.addEventListener('input',render);cat?.addEventListener('change',()=>{renderCategoryFilter();renderTopCategoryBar();render();});sort?.addEventListener('change',render);$('#priceFrom')?.addEventListener('input',render);$('#priceTo')?.addEventListener('input',render);$('#zeroNotice')&&($('#zeroNotice').onclick=()=>{showZero=!showZero;render()});setupAuth();setupSearch();load().finally(()=>window.AutoStyleLoader&&window.AutoStyleLoader.hide());