
import { auth, db, COLLECTIONS } from './firebase.js';
import { onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { collection, getDocs, setDoc, doc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);const fmt=new Intl.NumberFormat('ru-RU');let items=[],categories=[],cart=JSON.parse(localStorage.getItem('cart')||'[]'),favs=JSON.parse(localStorage.getItem('favorites')||'[]'),showZero=false;const grid=$('#catalogGrid'),search=$('#search'),topSearch=$('#topSearch'),cat=$('#category'),sort=$('#sort'),count=$('#catalogCount');
function money(v){return `${fmt.format(Number(v||0))} ₽`}function stock(p){return Number(p.stock??p.quantity??p.count??1)}function title(p){return p.title||p.name||'Товар'}function image(p){return p.image||p.imageUrl||p.photo||''}function group(p){return p.group||p.category||p.categoryName||'Без группы'}function oldPrice(p){return Number(p.oldPrice||p.priceOld||p.compareAtPrice||0)}function discount(p){const d=Number(p.discount||p.discountPercent||0);if(d>0)return d;const op=oldPrice(p),pr=Number(p.price||0);return op>pr&&pr>0?Math.round((op-pr)/op*100):0}function updateCart(){localStorage.setItem('cart',JSON.stringify(cart));$('#cartCount')&&($('#cartCount').textContent=cart.length)}function saveFav(){localStorage.setItem('favorites',JSON.stringify(favs))}
async function getCollection(n){const snap=await getDocs(collection(db,n));return snap.docs.map(d=>({id:d.id,...d.data()}))}

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
  const field = cat?.closest('.field');
  if(!field) return;
  field.style.display='none';
  let box = $('#categoryTreeFilter');
  if(!box){
    box=document.createElement('div');
    box.id='categoryTreeFilter';
    box.className='category-tree-filter';
    field.insertAdjacentElement('afterend', box);
  }
  const parents=getParents(false);
  let activeParent = parents.find(p => categoryNamesFor(cat?.value||'').includes(catName(p))) || parents.find(p => childrenOf(p).some(ch => catName(ch) === (cat?.value||''))) || parents[0];
  function drawChildren(parent){
    const list=childrenOf(parent);
    const cval=cat?.value||'';
    const right=box.querySelector('.cat-tree-children');
    if(!right) return;
    right.innerHTML=`<button type="button" class="cat-tree-child ${cval===catName(parent)?'active':''}" data-cat="${catName(parent)}">${parentAllLabel(parent)}</button>`+
      (list.length?list.map(ch=>`<button type="button" class="cat-tree-child ${cval===catName(ch)?'active':''}" data-cat="${catName(ch)}">${shortChildName(ch,parent)}</button>`).join(''):'<span class="muted">Подкатегорий нет</span>');
    right.querySelectorAll('[data-cat]').forEach(btn=>btn.onclick=()=>{cat.value=btn.dataset.cat; render(); renderCategoryFilter();});
  }
  box.innerHTML=`<div class="cat-filter-head"><b>Категории</b><button type="button" id="clearCategoryFilter">Все товары</button></div><div class="cat-tree-grid"><div class="cat-tree-col cat-tree-col-parent"><div class="cat-tree-title">Разделы</div><div class="cat-tree-parents">${parents.map(p=>`<button type="button" title="${catName(p)}" class="cat-tree-parent ${activeParent&&catId(activeParent)===catId(p)?'active':''}" data-parent="${catId(p)}">${catName(p)}</button>`).join('')}</div></div><div class="cat-tree-col cat-tree-col-child"><div class="cat-tree-title">Подкатегории</div><div class="cat-tree-children"></div></div></div>`;
  $('#clearCategoryFilter').onclick=()=>{cat.value=''; render(); renderCategoryFilter();};
  box.querySelectorAll('.cat-tree-parent').forEach(btn=>btn.onclick=()=>{activeParent=parents.find(p=>catId(p)===btn.dataset.parent);box.querySelectorAll('.cat-tree-parent').forEach(x=>x.classList.remove('active'));btn.classList.add('active');if(activeParent)drawChildren(activeParent);});
  if(activeParent) drawChildren(activeParent);
}
function setupAuth(){const modal=$('#authModal');$('#openAuth')&&modal&&($('#openAuth').onclick=()=>modal.classList.add('open'));$('#closeAuth')&&modal&&($('#closeAuth').onclick=()=>modal.classList.remove('open'));$$('.tab').forEach(t=>t.onclick=()=>{$$('.tab').forEach(x=>x.classList.remove('active'));t.classList.add('active');$('#loginForm').style.display=t.dataset.tab==='login'?'block':'none';$('#registerForm').style.display=t.dataset.tab==='register'?'block':'none'});$('#loginForm')&&($('#loginForm').onsubmit=async e=>{e.preventDefault();await signInWithEmailAndPassword(auth,$('#loginEmail').value.trim(),$('#loginPass').value);modal.classList.remove('open')});$('#registerForm')&&($('#registerForm').onsubmit=async e=>{e.preventDefault();const res=await createUserWithEmailAndPassword(auth,$('#regEmail').value.trim(),$('#regPass').value);await setDoc(doc(db,COLLECTIONS.users,res.user.uid),{name:$('#regName').value.trim(),email:$('#regEmail').value.trim(),role:'user',createdAt:new Date().toISOString()});await sendEmailVerification(res.user);alert('Аккаунт создан. Проверьте почту.');modal.classList.remove('open')});onAuthStateChanged(auth,u=>{const ob=$('#openAuth'),dd=$('#accountDrop');if(u){ob&&(ob.style.display='none');dd&&(dd.style.display='block');$('#userEmail')&&($('#userEmail').textContent=u.email);$('#logout')&&($('#logout').onclick=()=>signOut(auth))}else{ob&&(ob.style.display='inline-block');dd&&(dd.style.display='none')}});const accBtn=$('#accountBtn'),accDrop=$('#accountDrop');if(accBtn&&accDrop&&!accDrop.dataset.closeReady){accDrop.dataset.closeReady='1';accBtn.onclick=e=>{e.preventDefault();e.stopPropagation();accDrop.classList.toggle('open')};accDrop.addEventListener('click',e=>e.stopPropagation());document.addEventListener('click',()=>accDrop.classList.remove('open'));document.addEventListener('keydown',e=>{if(e.key==='Escape')accDrop.classList.remove('open')})}}
async function load(){items=await getCollection(COLLECTIONS.products);try{categories=await getCollection(COLLECTIONS.categories)}catch(e){}categories=categories.filter(c=>!isBlockedCategory(c));categories.sort((a,b)=>Number(a.order??999)-Number(b.order??999)||String(a.title||a.name||'').localeCompare(String(b.title||b.name||''),'ru'));const opts=new Map();categories.forEach(c=>opts.set((c.title||c.name||'').toLowerCase(),c.title||c.name));items.forEach(p=>{const g=group(p);if(g&&g!=='Без группы'&&!isBlockedCatalogName(g))opts.set(g.toLowerCase(),g)});cat&&(cat.innerHTML='<option value="">Все группы</option>'+[...opts.values()].map(x=>`<option value="${x}">${x}</option>`).join(''));await renderCatalogMenu();const params=new URLSearchParams(location.search);if(params.get('category'))cat.value=params.get('category');if(params.get('search')){search.value=params.get('search');topSearch&&(topSearch.value=params.get('search'))}renderCategoryFilter();updateCart();render()}
function card(p){const d=discount(p),op=oldPrice(p),priceNum=Number(p.price||0),installment=(p.installment===true||p.installmentAvailable===true||p.credit===true||priceNum>=199),monthPay=Math.ceil(priceNum/12);return `<article class="catalog-card"><button class="fav-btn ${favs.includes(p.id)?'active':''}" data-fav="${p.id}" type="button">♡</button><a class="catalog-card-link" href="product.html?id=${p.id}"><div class="catalog-card-photo">${d?`<span class="discount-badge">-${d}%</span>`:''}${image(p)?`<img src="${image(p)}" alt="${title(p)}">`:'<span>Фото</span>'}</div><div class="catalog-card-body"><h3>${title(p)}</h3><div class="catalog-card-category">${group(p)}</div><div class="price-row-card"><div class="catalog-card-price">${money(p.price)}</div>${op?`<div class="old-price">${money(op)}</div>`:''}</div>${installment?`<div class="installment-badge catalog-installment-badge">Рассрочка от ${money(monthPay)}/мес</div>`:''}<div class="catalog-card-stock">${stock(p)>0?'В наличии: '+stock(p):'Нет в наличии'}</div></div></a><button class="catalog-cart-btn" data-cart="${p.id}" type="button">В корзину</button></article>`}
function render(){const q=(search?.value||'').toLowerCase(),c=cat?.value||'',pf=Number($('#priceFrom')?.value||0),pt=Number($('#priceTo')?.value||999999999);let list=items.filter(p=>{const text=`${title(p)} ${p.description||''} ${group(p)} ${p.code||''}`.toLowerCase();const pr=Number(p.price||0);if(c&&!categoryNamesFor(c).includes(group(p)))return false;if(q&&!text.includes(q))return false;if(pr<pf||pr>pt)return false;if(!showZero&&stock(p)<=0)return false;return true});if(sort?.value==='priceAsc')list.sort((a,b)=>Number(a.price||0)-Number(b.price||0));if(sort?.value==='priceDesc')list.sort((a,b)=>Number(b.price||0)-Number(a.price||0));if(sort?.value==='nameAsc')list.sort((a,b)=>title(a).localeCompare(title(b),'ru'));count&&(count.textContent=`${list.length} товаров`);$('#zeroNotice')&&($('#zeroNotice').textContent=showZero?'Показаны все товары':'Товары с нулевым остатком скрыты');grid.innerHTML=list.length?list.map(card).join(''):'<div class="notice">Товары не найдены.</div>';bind()}
function bind(){$$('[data-cart]').forEach(b=>b.onclick=e=>{e.preventDefault();cart.push(b.dataset.cart);updateCart();b.textContent='Добавлено';setTimeout(()=>b.textContent='В корзину',900)});$$('[data-fav]').forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();const id=b.dataset.fav;favs=favs.includes(id)?favs.filter(x=>x!==id):[...favs,id];b.classList.toggle('active',favs.includes(id));saveFav()})}
function setupSearch(){const btn=$('#topSearchBtn');function go(){const q=encodeURIComponent((topSearch?.value||'').trim());location.href=q?`catalog.html?search=${q}`:'catalog.html'}btn&&(btn.onclick=go);topSearch&&topSearch.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();go()}})}
search?.addEventListener('input',render);cat?.addEventListener('change',()=>{renderCategoryFilter();render();});sort?.addEventListener('change',render);$('#priceFrom')?.addEventListener('input',render);$('#priceTo')?.addEventListener('input',render);$('#zeroNotice')&&($('#zeroNotice').onclick=()=>{showZero=!showZero;render()});setupAuth();setupSearch();load().finally(()=>window.AutoStyleLoader&&window.AutoStyleLoader.hide());
