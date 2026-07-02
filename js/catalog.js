
function currentParentForCatalog(){
  const selected = cat?.value || '';
  const parents = getParents(false);
  if(!parents.length) return null;
  if(selected){
    const asParent = parents.find(p => catName(p) === selected);
    if(asParent) return asParent;
    const byChild = parents.find(p => childrenOf(p).some(ch => catName(ch) === selected));
    if(byChild) return byChild;
  }
  return parents[0];
}

function renderTopCategoryBar(parentOverride){
 const bar=document.getElementById('topCategoryBar');
 if(!bar||!categories.length)return;
 const parent = parentOverride || currentParentForCatalog();
 if(!parent){ bar.innerHTML=''; return; }
 const selected = cat?.value || '';
 const children = childrenOf(parent).filter(showInCatalog);
 const buttons = [
   `<button class="top-cat-btn ${selected===catName(parent)||!selected?'active':''}" data-cat="${catName(parent)}">${parentAllLabel(parent)}</button>`,
   ...children.map(ch=>`<button class="top-cat-btn ${selected===catName(ch)?'active':''}" data-cat="${catName(ch)}">${shortChildName(ch,parent)}</button>`)
 ];
 bar.innerHTML = `<div class="top-child-groups">${buttons.join('')}</div>`;
 setupCatalogDragScroll();
 bar.onclick=e=>{
   const btn=e.target.closest('.top-cat-btn');
   if(!btn)return;
   if(cat){cat.value=btn.dataset.cat; renderCategoryFilter(); render();}
 };
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
function showInCatalog(c){return c.showInCatalog!==false && c.showInTopCatalog!==false && c.hideFromTopCatalog!==true && !isBlockedCategory(c) && !isServiceGroup(c)}
function showInTopCatalog(c){return showInCatalog(c)}
function childrenOf(parent){
  const ids = [catId(parent), String(parent.externalId || '').trim()].filter(Boolean);
  return categories.filter(c => ids.includes(catParent(c)) && showInCatalog(c)).sort(sortCats);
}
function getParents(forTopCatalog=false){
  const allowed = c => showInCatalog(c);
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
  $$('.mega-parent').forEach(b=>{
    b.onmouseenter=()=>{
      $$('.mega-parent').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      const p=parents.find(x=>catId(x)===b.dataset.parent);
      if(p)render(p);
    };
    b.onclick=()=>{
      const p=parents.find(x=>catId(x)===b.dataset.parent);
      if(p)location.href='catalog.html?category='+encodeURIComponent(catName(p));
    };
  });
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
  const selected = cat?.value || '';
  const activeParent = currentParentForCatalog();

  box.innerHTML=`<div class="cat-filter-head"><b>Каталог</b><button type="button" id="clearCategoryFilter">Все товары</button></div><div class="cat-tree-parents cat-tree-main-only">${parents.map(p=>`<button type="button" title="${catName(p)}" class="cat-tree-parent ${activeParent&&catId(activeParent)===catId(p)?'active':''}" data-parent="${catId(p)}" data-cat="${catName(p)}">${catName(p)}</button>`).join('')}</div>`;

  $('#clearCategoryFilter').onclick=()=>{cat.value=''; renderCategoryFilter(); renderTopCategoryBar(); render();};
  box.querySelectorAll('.cat-tree-parent').forEach(btn=>btn.onclick=()=>{
    if(cat) cat.value=btn.dataset.cat || '';
    renderCategoryFilter();
    const p=parents.find(x=>catId(x)===btn.dataset.parent);
    renderTopCategoryBar(p);
    render();
  });
  renderTopCategoryBar(activeParent);
}




function setupCatalogTopControls(){
  const top = document.querySelector('.catalog-top');
  const zeroBtn = document.getElementById('zeroNotice');
  const sortField = sort?.closest('.field');
  if(!top || !zeroBtn || !sortField) return;

  sortField.classList.add('catalog-top-sort-field');
  sortField.classList.remove('sidebar-sort-field');
  // Реальное перемещение DOM: сортировка стоит в верхней панели прямо перед кнопкой нулевого остатка.
  top.insertBefore(sortField, zeroBtn);
}

function setupCatalogDragScroll(){
  function bindDragScroll(el, axis){
    if(!el || el.dataset.dragScrollReady === '1') return;
    el.dataset.dragScrollReady = '1';
    let down=false, moved=false, startX=0, startY=0, startLeft=0, startTop=0;
    el.addEventListener('pointerdown', e=>{
      if(e.button !== undefined && e.button !== 0) return;
      down=true; moved=false;
      startX=e.clientX; startY=e.clientY;
      startLeft=el.scrollLeft; startTop=el.scrollTop;
      el.classList.add('dragging-scroll');
    });
    window.addEventListener('pointermove', e=>{
      if(!down) return;
      const dx=e.clientX-startX, dy=e.clientY-startY;
      if(Math.abs(dx)>4 || Math.abs(dy)>4) moved=true;
      if(axis === 'x') el.scrollLeft = startLeft - dx;
      else el.scrollTop = startTop - dy;
      if(moved) e.preventDefault();
    }, {passive:false});
    window.addEventListener('pointerup', ()=>{
      if(!down) return;
      down=false;
      setTimeout(()=>{ moved=false; }, 0);
      el.classList.remove('dragging-scroll');
    });
    el.addEventListener('click', e=>{
      if(el.classList.contains('dragging-scroll') || moved){
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);
  }
  bindDragScroll(document.querySelector('.filters.catalog-filters'), 'y');
  bindDragScroll(document.querySelector('.top-child-groups'), 'x');
}

function accountInitials(name, email){
  const base = String(name || email || 'AS').trim();
  return (base.split(/\s+/).slice(0,2).map(x=>x[0]).join('') || 'AS').toUpperCase();
}
function icon(name){
  return `<img class="account-menu-icon" src="assets/icons/${name}.svg" alt="" loading="lazy" decoding="async">`;
}
function renderAccountPanel(user){
  const drop = document.querySelector('#accountDrop .drop');
  if(!drop || !user) return;
  const name = user.displayName || 'Профиль AutoStyle';
  const email = user.email || '';
  const photo = user.photoURL || '';
  drop.classList.add('account-panel');
  const avatarHtml = photo ? `<img loading="lazy" decoding="async" src="${photo}" alt="${name}">` : accountInitials(name, email);
  drop.innerHTML = `
    <a class="account-user account-user-link" href="profile.html#home" title="Открыть профиль">
      <div class="account-avatar">${avatarHtml}</div>
      <div>
        <b class="account-name">${name}</b>
        <span class="account-email">${email}</span>
      </div>
    </a>
    <div class="account-status">● Вы авторизованы</div>
    <nav class="account-menu">
      <a class="primary-account" href="profile.html#home">${icon('user')} Фото и профиль</a>
      <a href="profile.html#discount-card">${icon('card')} Скидочная карта</a>
      <a href="cart.html">${icon('cart')} Корзина</a>
      <a href="favorites.html">${icon('heart')} Избранное</a>
      <a href="profile.html#orders">${icon('package')} Заказы</a>
      <button id="logout" class="account-logout" type="button">Выйти</button>
    </nav>`;
}

function setupAuth(){const modal=$('#authModal');const say=t=>{const m=$('#authFullMsg');if(m)m.textContent=t||''};$('#openAuth')&&modal&&($('#openAuth').onclick=()=>modal.classList.add('open'));$('#closeAuth')&&modal&&($('#closeAuth').onclick=()=>modal.classList.remove('open'));$$('.tab').forEach(t=>t.onclick=()=>{$$('.tab').forEach(x=>x.classList.remove('active'));t.classList.add('active');$('#loginForm').style.display=t.dataset.tab==='login'?'block':'none';$('#registerForm').style.display=t.dataset.tab==='register'?'block':'none'});$('#loginForm')&&($('#loginForm').onsubmit=async e=>{e.preventDefault();try{say('Входим...');await loginEmail($('#loginEmail').value.trim(),$('#loginPass').value);modal.classList.remove('open');location.reload()}catch(err){say('Ошибка входа: '+(err.message||err))}});$('#registerForm')&&($('#registerForm').onsubmit=async e=>{e.preventDefault();try{say('Создаём аккаунт...');await registerEmail($('#regName').value.trim(),$('#regEmail').value.trim(),$('#regPass').value);say('Аккаунт создан. Проверьте письмо подтверждения на почте.')}catch(err){say('Ошибка регистрации: '+(err.message||err))}});$('#sendSmsCode')&&($('#sendSmsCode').onclick=async()=>{try{say('Отправляем SMS...');await sendSmsCode($('#phoneLogin').value.trim());say('Код отправлен. Введите его ниже.')}catch(err){say('Ошибка SMS: '+(err.message||err))}});$('#confirmSmsCode')&&($('#confirmSmsCode').onclick=async()=>{try{say('Проверяем код...');await confirmSmsCode($('#smsCode').value.trim());modal.classList.remove('open');location.reload()}catch(err){say('Ошибка подтверждения: '+(err.message||err))}});onAuthStateChanged(auth,async u=>{const ob=$('#openAuth'),dd=$('#accountDrop');if(u){await ensureUserProfile(u);const accountMenuUser=await getAccountMenuUser(u);window.AutoStyleAccountMenu?.renderUser(accountMenuUser||u,async()=>{clearCartAndFavorites();await signOut(auth);location.reload()});ob&&(ob.style.display='none');dd&&(dd.style.display='block');renderAccountPanel(u);$('#logout')&&($('#logout').onclick=async()=>{clearCartAndFavorites();await signOut(auth);location.reload()})}else{window.AutoStyleAccountMenu?.renderGuest();clearCartAndFavorites();ob&&(ob.style.display='inline-block');dd&&(dd.style.display='none')}});const accBtn=$('#accountBtn'),accDrop=$('#accountDrop');if(accBtn&&accDrop&&!accDrop.dataset.closeReady){accDrop.dataset.closeReady='1';accBtn.onclick=e=>{e.preventDefault();e.stopPropagation();accDrop.classList.toggle('open')};accDrop.addEventListener('click',e=>e.stopPropagation());document.addEventListener('click',()=>accDrop.classList.remove('open'));document.addEventListener('keydown',e=>{if(e.key==='Escape')accDrop.classList.remove('open')})}}
async function load(){await waitUserCartReady();cart=getCurrentUserCart();updateCart();items=await getCollection(COLLECTIONS.products);try{categories=await getCollection(COLLECTIONS.categories)}catch(e){}categories=categories.filter(c=>!isBlockedCategory(c));categories.sort((a,b)=>Number(a.order??999)-Number(b.order??999)||String(a.title||a.name||'').localeCompare(String(b.title||b.name||''),'ru'));const visibleCategories=categories.filter(showInCatalog);const hiddenCategoryNames=new Set(categories.filter(c=>!showInCatalog(c)).map(c=>catName(c).toLowerCase()));const opts=new Map();visibleCategories.forEach(c=>opts.set((c.title||c.name||'').toLowerCase(),c.title||c.name));items.forEach(p=>{const g=group(p);if(g&&g!=='Без группы'&&!isBlockedCatalogName(g)&&!hiddenCategoryNames.has(String(g).toLowerCase()))opts.set(g.toLowerCase(),g)});cat&&(cat.innerHTML='<option value="">Все группы</option>'+[...opts.values()].map(x=>`<option value="${x}">${x}</option>`).join(''));await renderCatalogMenu();const params=new URLSearchParams(location.search);if(params.get('category'))cat.value=params.get('category');if(params.get('search')){search.value=params.get('search');topSearch&&(topSearch.value=params.get('search'))}
if(params.get('brand')){search.value=params.get('brand');topSearch&&(topSearch.value=params.get('brand'))}renderCategoryFilter();renderTopCategoryBar();setupCatalogTopControls();setupCatalogDragScroll();updateCart();render()}
function card(p){
  const d=discount(p),op=oldPrice(p),s=stock(p),href=`product.html?id=${encodeURIComponent(p.id)}`;
  const favActive=favs.includes(p.id);
  const badge=d?`<span class="as-exact-badge">-${d}%</span>`:(p.isNew||p.new||p.isNewProduct?`<span class="as-exact-badge new">НОВИНКА</span>`:(p.hit||p.bestseller?`<span class="as-exact-badge hit">ХИТ</span>`:''));
  return `<article class="as-product-card-exact catalog-card product-card" data-product-href="${href}">
    ${badge}
    <a class="as-exact-photo product-image-link" href="${href}" aria-label="${title(p)}">
      ${image(p)?`<img loading="lazy" decoding="async" src="${image(p)}" alt="${title(p)}">`:'<span class="as-exact-no-photo">Фото</span>'}
    </a>
    <button class="fav-btn as-exact-fav ${favActive?'active':''}" data-fav="${p.id}" type="button" aria-label="Избранное">${favActive?'♥':'♡'}</button>
    <div class="as-exact-info">
      <a class="as-exact-title catalog-card-link product-card-link product-title" href="${href}">${title(p)}</a>
      <div class="as-exact-category catalog-card-category product-group">${group(p)}</div>
    </div>
    <div class="as-exact-bottom">
      <div class="as-exact-price-row price-row-card"><div class="as-exact-price catalog-card-price price-current">${money(p.price)}</div>${op?`<div class="as-exact-old-price old-price price-old">${money(op)}</div>`:''}</div>
      <div class="as-exact-stock catalog-card-stock ${s>0?'':'out'}">${s>0?'В наличии':'Нет в наличии'}</div>
      <button class="as-exact-cart catalog-cart-btn" data-cart="${p.id}" type="button" ${s<=0?'disabled':''} aria-label="В корзину"></button>
    </div>
  </article>`
}
function render(){const q=(search?.value||'').toLowerCase(),c=cat?.value||'',pf=Number($('#priceFrom')?.value||0),pt=Number($('#priceTo')?.value||999999999),params=new URLSearchParams(location.search),brandParam=(params.get('brand')||'').toLowerCase();let list=items.filter(p=>{const brand=String(p.brand||p.brandName||p.manufacturer||p.vendor||'').toLowerCase();const text=`${title(p)} ${p.description||''} ${group(p)} ${p.code||''} ${brand}`.toLowerCase();const pr=Number(p.price||0);if(c&&!categoryNamesFor(c).includes(group(p)))return false;if(brandParam&&brand!==brandParam&&!text.includes(brandParam))return false;if(q&&!text.includes(q))return false;if(pr<pf||pr>pt)return false;if(!showZero&&stock(p)<=0)return false;return true});if(sort?.value==='priceAsc')list.sort((a,b)=>Number(a.price||0)-Number(b.price||0));if(sort?.value==='priceDesc')list.sort((a,b)=>Number(b.price||0)-Number(a.price||0));if(sort?.value==='nameAsc')list.sort((a,b)=>title(a).localeCompare(title(b),'ru'));count&&(count.textContent=`${list.length} товаров`);$('#zeroNotice')&&($('#zeroNotice').textContent=showZero?'Показаны все товары':'Товары с нулевым остатком');grid.innerHTML=list.length?list.map(card).join(''):'<div class="notice">Товары не найдены.</div>';bind()}
function bind(){$$('[data-cart]').forEach(b=>b.onclick=async e=>{e.preventDefault();try{await addUserCartItem(b.dataset.cart);cart=getCurrentUserCart();updateCart();b.classList.add('added');setTimeout(()=>b.classList.remove('added'),700)}catch(err){alert(err?.message||'Войдите в аккаунт, чтобы добавить товар в корзину')}});$$('[data-fav]').forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();const id=b.dataset.fav;favs=favs.includes(id)?favs.filter(x=>x!==id):[...favs,id];b.classList.toggle('active',favs.includes(id));saveFav()})}
function setupSearch(){const btn=$('#topSearchBtn');function go(){const q=encodeURIComponent((topSearch?.value||'').trim());location.href=q?`catalog.html?search=${q}`:'catalog.html'}btn&&(btn.onclick=go);topSearch&&topSearch.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();go()}})}

window.addEventListener('autostyle-cache-updated', e => {
  const name = e.detail?.name;
  const rows = e.detail?.rows;
  if (!Array.isArray(rows)) return;
  if (name === COLLECTIONS.products) {
    items = rows;
    render();
  }
  if (name === COLLECTIONS.categories) {
    categories = rows.filter(c=>!isBlockedCategory(c)).sort((a,b)=>Number(a.order??999)-Number(b.order??999)||String(a.title||a.name||'').localeCompare(String(b.title||b.name||''),'ru'));
    renderCategoryFilter();
    renderTopCategoryBar();
    render();
  }
});

search?.addEventListener('input',render);cat?.addEventListener('change',()=>{renderCategoryFilter();render();});sort?.addEventListener('change',render);$('#priceFrom')?.addEventListener('input',render);$('#priceTo')?.addEventListener('input',render);$('#zeroNotice')&&($('#zeroNotice').onclick=()=>{showZero=!showZero;render()});setupAuth();setupSearch();load().catch(err=>{console.error('catalog load error', err); if(grid) grid.innerHTML='<div class="notice">Не удалось загрузить каталог. Обновите страницу.</div>';}).finally(()=>window.AutoStyleLoader&&window.AutoStyleLoader.hide());

function setupProductCardOpen(){
  if (document.dataset && document.documentElement.dataset.productOpenReady === '1') return;
  document.documentElement.dataset.productOpenReady = '1';
  document.addEventListener('click', e => {
    if (e.defaultPrevented) return;
    if (e.target.closest('button, input, select, textarea, label, .fav-btn, .cart, .cart-btn, .catalog-cart-btn, [data-cart], [data-fav]')) return;
    const card = e.target.closest('.product-card, .catalog-card, .related-card, .favorite-card, .home-product-card');
    if (!card) return;
    const link = e.target.closest('a[href*="product.html"]') || card.querySelector('a[href*="product.html"]');
    if (!link || !link.href) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    location.href = link.href;
  });
}
setupProductCardOpen();
