import { auth, db, COLLECTIONS } from './firebase.js';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, updateProfile, updatePassword, sendEmailVerification, RecaptchaVerifier, signInWithPhoneNumber, linkWithPhoneNumber } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getProducts, getCategories, getBanners, getCollectionCached } from './data-cache.js';

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
let products = [], categories = [], banners = [], homeBlocks = [], promoCards = [], userNow = null;
let dataPromise = null;
const PAGE_SIZE = 24;
let cart = JSON.parse(localStorage.getItem('cart') || '[]');
let favs = JSON.parse(localStorage.getItem('favorites') || '[]');
const page = document.body.dataset.page;

const HOME_BLOCKS_COLLECTION = COLLECTIONS.homeBlocks || 'autostyle_home_blocks';
const PROMO_CARDS_COLLECTIONS = [...new Set([
  COLLECTIONS.promoCards || 'autostyle_promo_cards',
  'autostyle_promo_cards', 'autostyle_promoCards', 'autostyle_home_cards', 'promoCards', 'homeCards'
].filter(Boolean))];
const whenIdle = fn => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 1600 }) : setTimeout(fn, 60));
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[ch]));
const appUrl = url => {
  const raw = String(url || '').trim();
  if (!raw || raw === '#') return 'mobile-catalog.html';
  if (/^(tel:|mailto:|https?:\/\/|#)/i.test(raw)) return raw;
  return raw
    .replace(/^index\.html(.*)$/i, 'mobile.html$1')
    .replace(/^catalog\.html(.*)$/i, 'mobile-catalog.html$1')
    .replace(/^product\.html(.*)$/i, 'mobile-product.html$1')
    .replace(/^cart\.html(.*)$/i, 'mobile-cart.html$1')
    .replace(/^favorites\.html(.*)$/i, 'mobile-favorites.html$1')
    .replace(/^profile\.html(.*)$/i, 'mobile-profile.html$1')
    .replace(/^about\.html(.*)$/i, 'mobile-about.html$1')
    .replace(/^contacts\.html(.*)$/i, 'mobile-contacts.html$1')
    .replace(/^installment\.html(.*)$/i, 'mobile-installment.html$1')
    .replace(/^certificates\.html(.*)$/i, 'mobile-certificates.html$1')
    .replace(/^login\.html(.*)$/i, 'mobile-profile.html$1')
    .replace(/^register\.html(.*)$/i, 'mobile-profile.html$1');
};
const safeLoadCollection = async name => { try { return await getCollectionCached(name); } catch(e) { console.warn('Не удалось загрузить', name, e); return []; } };
const safeLoadCollections = async names => {
  const all = [];
  for (const name of names) (await safeLoadCollection(name)).forEach(row => all.push({ ...row, _collection:name }));
  const seen = new Set();
  return all.filter(row => { const k = String(row.key || row.slug || row.id || `${row._collection}:${row.title || row.name || Math.random()}`).trim(); if (seen.has(k)) return false; seen.add(k); return true; });
};
function defaultHomeBlocks(){
  return [
    {id:'new', key:'new', title:'Новинки', order:1, builtin:true},
    {id:'recentlyViewed', key:'recentlyViewed', title:'Недавно просмотренные', order:2, builtin:true, recent:true},
    {id:'bestsellers', key:'bestsellers', title:'Лидеры продаж', order:3, builtin:true},
    {id:'hot', key:'hot', title:'Горячие предложения', order:4, builtin:true}
  ];
}
function mergeHomeBlocks(custom){
  const byKey = new Map();
  defaultHomeBlocks().forEach(b => byKey.set(b.key, b));
  (custom || []).forEach(b => {
    const key = b.key || b.slug || b.id;
    if (!key) return;
    const base = byKey.get(key) || {};
    byKey.set(key, { ...base, id:b.id || base.id, key, title:b.title || b.name || base.title || key, order:Number(b.order ?? base.order ?? 999), enabled:b.enabled !== false, builtin:base.builtin === true });
  });
  return [...byKey.values()].filter(b => b.enabled !== false).sort((a,b)=>Number(a.order??999)-Number(b.order??999));
}
function isMarkedForHome(p){ return p.showOnHome === true || p.showOnHome === 'true' || p.onHome === true || p.home === true; }
function productSection(p){ return String(p.homeSection || p.homeBlock || p.tag || '').toLowerCase(); }
function productsForHomeBlock(block){
  const key = norm(block.key);
  const availableProducts = products.filter(available);
  if (block.recent || key === 'recentlyviewed') {
    const ids = JSON.parse(localStorage.getItem('viewedProducts') || '[]');
    const byId = new Map(availableProducts.map(p => [p.id, p]));
    return ids.map(id => byId.get(id)).filter(Boolean).filter(id => id === 'password' || id === 'phone');
  }
  let selected = availableProducts.filter(p => isMarkedForHome(p) && norm(productSection(p)) === key);
  if (selected.length) return selected;
  selected = availableProducts.filter(p => norm(productSection(p)) === key || norm(p.tag) === key);
  if (selected.length) return selected;
  if (key === 'bestsellers' || key === 'best' || key === 'leaders') return availableProducts.filter(p => ['best','bestsellers','leader','leaders'].includes(norm(p.tag))).slice(0,20);
  if (key === 'new') return availableProducts.filter(p => norm(p.tag) === 'new').slice(0,20);
  if (key === 'hot') return availableProducts.filter(isMarkedForHome).concat(availableProducts).filter((p,i,a)=>a.findIndex(x=>x.id===p.id)===i).slice(0,20);
  return availableProducts.filter(p => isMarkedForHome(p)).slice(0,20);
}
function promoCard(c){
  const image = c.image || c.imageUrl || c.photoUrl || '';
  const titleText = escapeHtml(c.title || c.name || 'AutoStyle');
  return `<a class="m-promo-card" href="${appUrl(c.link || c.url || 'mobile-catalog.html')}">${image ? `<img loading="lazy" decoding="async" src="${image}" alt="${titleText}">` : ''}<span><b>${titleText}</b>${c.text || c.description ? `<small>${escapeHtml(c.text || c.description)}</small>` : ''}</span></a>`;
}
function renderMobileSection(block, list){
  list = (list || []).slice(0, 12);
  const id = `mBlock_${String(block.key).replace(/[^a-zA-Z0-9_-]/g,'_')}`;
  return `<section id="${id}" class="m-section m-home-block" data-block="${block.key}"><div class="m-section-head"><h2>${block.title || block.name || 'Блок'}</h2><a class="m-see" href="mobile-catalog.html">Все</a></div><div class="m-carousel m-home-products">${list.length ? list.map(card).join('') : '<div class="m-empty">Товары для этого блока пока не выбраны.</div>'}</div></section>`;
}
function setupMobileChrome(){
  let lastY = window.scrollY;
  const top = document.querySelector('.m-top');
  const nav = document.querySelector('.m-bottom-nav');
  const apply = () => {
    const y = window.scrollY;
    if (top) top.classList.toggle('m-top-hidden', y > 24 && y > lastY);
    if (nav) nav.classList.toggle('m-nav-scrolled', y > 12);
    lastY = Math.max(0, y);
  };
  apply();
  window.addEventListener('scroll', apply, { passive:true });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href') || '';
    if (/^(https?:\/\/)/i.test(href) && !href.includes(location.host)) a.setAttribute('target', '_blank');
  });
}
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
  const d=discount(p), op=oldPrice(p), im=img(p), t=escapeHtml(title(p)), g=escapeHtml(group(p));
  return `<article class="m-card">
    <button class="m-fav ${favs.includes(p.id)?'active':''}" data-fav="${p.id}" type="button">♡</button>${d?`<span class="m-discount">-${d}%</span>`:''}
    <a class="m-card-img" href="${appUrl(`product.html?id=${encodeURIComponent(p.id)}`)}">${im?`<img loading="lazy" decoding="async" src="${im}" alt="${t}">`:'<span>Фото</span>'}</a>
    <a class="m-card-title" href="${appUrl(`product.html?id=${encodeURIComponent(p.id)}`)}">${t}</a>
    <div class="m-group">${g}</div>
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
async function initData(options={}){
  if (!dataPromise || options.force) {
    dataPromise = Promise.all([
      getProducts(),
      getCategories(),
      getBanners().catch(()=>[]),
      safeLoadCollection(HOME_BLOCKS_COLLECTION),
      safeLoadCollections(PROMO_CARDS_COLLECTIONS)
    ]).then(([p,c,b,h,pc])=>{
      products=(p||[]).filter(available);
      categories=c||[];
      banners=(b||[]).filter(x=>x.enabled!==false).sort((a,b)=>Number(a.order??999)-Number(b.order??999));
      homeBlocks=mergeHomeBlocks(h||[]);
      promoCards=pc||[];
      return { products, categories, banners, homeBlocks, promoCards };
    });
  }
  return dataPromise;
}
async function renderHome(){
  setupShell('home'); await initData();
  const slides=banners.map(b=>({ ...b, image:b.image||b.imageUrl||b.photoUrl||'' })).filter(b=>b.image);
  $('#mHero').innerHTML = slides.length
    ? `<div class="m-hero-slider">${slides.map((b,i)=>`<a class="m-hero-image ${i===0?'active':''}" href="${appUrl(b.link||b.url||'mobile-catalog.html')}" data-m-slide="${i}"><img loading="${i?'lazy':'eager'}" decoding="async" src="${b.image}" alt="${b.title||'AutoStyle'}"></a>`).join('')}${slides.length>1?`<div class="m-hero-dots">${slides.map((_,i)=>`<span class="${i===0?'active':''}" data-m-dot="${i}"></span>`).join('')}</div>`:''}</div>`
    : `<div><span class="m-label">AUTO STYLE MARKET</span><h1>AutoStyle</h1><p>Добавьте главный баннер в админке.</p></div>`;
  if (slides.length > 1) {
    let i=0; const hero=$('#mHero'); const hs=[...hero.querySelectorAll('[data-m-slide]')], dots=[...hero.querySelectorAll('[data-m-dot]')];
    setInterval(()=>{ i=(i+1)%hs.length; hs.forEach((x,n)=>x.classList.toggle('active',n===i)); dots.forEach((x,n)=>x.classList.toggle('active',n===i)); }, 5500);
    dots.forEach((dot,n)=>dot.onclick=e=>{ e.preventDefault(); i=n; hs.forEach((x,k)=>x.classList.toggle('active',k===i)); dots.forEach((x,k)=>x.classList.toggle('active',k===i)); });
  }
  $('#mCats').innerHTML=parentsList().map(c=>`<a class="m-cat" href="mobile-catalog.html?category=${encodeURIComponent(catName(c))}">${catName(c)}</a>`).join('');
  const promoHtml = promoCards.filter(c=>c.enabled!==false).sort((a,b)=>Number(a.order??999)-Number(b.order??999)).map(promoCard).join('');
  const blocksHtml = homeBlocks.map(block => ({ block, list:productsForHomeBlock(block) })).filter(x => !(x.block.recent && !x.list.length)).map(x => renderMobileSection(x.block, x.list)).join('');
  $('#mHomeDynamic').innerHTML = (promoHtml ? `<section class="m-section"><div class="m-section-head"><h2>Акции и подборки</h2></div><div class="m-promo-row">${promoHtml}</div></section>` : '') + blocksHtml;
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
  $('#mCatalogTitle').textContent = selected ? selected : (q ? `Поиск: ${escapeHtml(q)}` : 'Каталог товаров');
  $('#mCatalogCount').textContent = `${list.length} товаров`;
  renderCatalogBatch(list, 0);
  clearLoader();
}
function renderCatalogBatch(list, start=0){
  const grid = $('#mCatalogGrid');
  if (!grid) return;
  if (!list.length) { grid.innerHTML = '<div class="m-empty">Товары не найдены</div>'; return; }
  if (start === 0) grid.innerHTML = '';
  const end = Math.min(start + PAGE_SIZE, list.length);
  grid.insertAdjacentHTML('beforeend', list.slice(start, end).map(card).join(''));
  bind(grid);
  const old = $('#mMoreProducts'); if (old) old.remove();
  if (end < list.length) {
    grid.insertAdjacentHTML('afterend', `<button id="mMoreProducts" class="m-primary" style="width:100%;margin:14px 0">Показать ещё ${Math.min(PAGE_SIZE, list.length-end)}</button>`);
    $('#mMoreProducts').onclick = () => renderCatalogBatch(list, end);
  }
}
async function renderProduct(){
  setupShell('catalog'); await initData();
  const id=new URLSearchParams(location.search).get('id'); const p=products.find(x=>String(x.id)===String(id));
  if(!p){ $('#mProduct').innerHTML='<div class="m-empty">Товар не найден</div>'; clearLoader(); return; }
  const im=img(p), d=discount(p), op=oldPrice(p);
  let viewed=JSON.parse(localStorage.getItem('viewedProducts')||'[]').filter(x=>x!==p.id); viewed.unshift(p.id); localStorage.setItem('viewedProducts',JSON.stringify(viewed.slice(0,30)));
  $('#mProduct').innerHTML=`<a class="m-btn" href="mobile-catalog.html?category=${encodeURIComponent(group(p))}">← Вернуться в каталог</a>
    <div class="m-product-layout"><div class="m-photo-box"><div class="m-photo">${im?`<img loading="eager" decoding="async" src="${im}" alt="${escapeHtml(title(p))}">`:'<span>Фото</span>'}</div></div>
    <div class="m-info"><div class="m-breadcrumb"><a href="mobile.html">Главная</a> / <a href="mobile-catalog.html">Каталог</a> / <a href="mobile-catalog.html?category=${encodeURIComponent(group(p))}">${escapeHtml(group(p))}</a></div><h1>${escapeHtml(title(p))}</h1><a class="m-tag" href="mobile-catalog.html?category=${encodeURIComponent(group(p))}">${escapeHtml(group(p))}</a>${d?` <span class="m-tag" style="background:#ffecec;color:#e3342f">Скидка ${d}%</span>`:''}
    <div class="m-buybox"><div class="m-price-line"><div class="m-big-price">${money(price(p))}</div>${op?`<span class="m-old">${money(op)}</span>`:''}</div>${installment(p)?`<span class="m-installment">Рассрочка от ${money(monthPay(p))} в мес. на 12 мес.</span>`:''}<span class="m-stock">В наличии: ${stock(p)}</span>
    <div class="m-buy-actions"><button class="m-action cart" data-cart="${p.id}">В корзину</button><button class="m-action fav ${favs.includes(p.id)?'active':''}" data-fav="${p.id}">♡ ${favs.includes(p.id)?'В избранном':'В избранное'}</button></div></div></div></div>
    <section class="m-desc m-collapsed" id="mProductDesc"><div class="m-desc-head"><h2>Описание</h2><button class="m-desc-toggle" id="mDescToggle" type="button">Показать</button></div><p>${escapeHtml(p.description || 'Описание товара пока не добавлено.')}</p></section>
    <section class="m-specs"><h2>Характеристики</h2><div class="m-spec-row"><span>Название</span><b>${escapeHtml(title(p))}</b></div><div class="m-spec-row"><span>Группа</span><b><a href="mobile-catalog.html?category=${encodeURIComponent(group(p))}">${escapeHtml(group(p))}</a></b></div><div class="m-spec-row"><span>Остаток</span><b>${stock(p)}</b></div><div class="m-spec-row"><span>Цена</span><b>${money(price(p))}</b></div></section>
    <section class="m-related"><div class="m-section-head"><h2>Похожие товары</h2><a class="m-see" href="mobile-catalog.html?category=${encodeURIComponent(group(p))}">Все</a></div><div class="m-carousel">${products.filter(x=>x.id!==p.id&&group(x)===group(p)).slice(0,12).map(card).join('')||'<div class="m-empty">Похожих товаров пока нет</div>'}</div></section>`;
  bind($('#mProduct'));
  const desc = $('#mProductDesc'), descBtn = $('#mDescToggle');
  if (desc && descBtn) descBtn.onclick = () => { const closed = desc.classList.toggle('m-collapsed'); descBtn.textContent = closed ? 'Показать' : 'Скрыть'; };
  clearLoader();
}
async function renderCart(){
  setupShell('cart'); await initData();
  const byId=new Map(products.map(p=>[p.id,p])); const counts={}; cart.forEach(id=>counts[id]=(counts[id]||0)+1);
  const rows=Object.keys(counts).map(id=>byId.get(id)).filter(Boolean);
  const total=rows.reduce((s,p)=>s+price(p)*counts[p.id],0);
  $('#mCartList').innerHTML=rows.map(p=>`<div class="m-list-item"><a class="m-list-img" href="mobile-product.html?id=${p.id}">${img(p)?`<img loading="lazy" decoding="async" src="${img(p)}" alt="${escapeHtml(title(p))}">`:'Фото'}</a><div><b>${title(p)}</b><div class="m-group">${group(p)}</div><div class="m-qty-row"><span>${counts[p.id]} × ${money(price(p))}</span><button class="m-danger" data-remove="${p.id}">Удалить</button></div></div></div>`).join('')||'<div class="m-empty">Корзина пустая</div>';
  $('#mTotal').textContent=money(total);
  $$('[data-remove]').forEach(b=>b.onclick=()=>{cart=cart.filter(id=>id!==b.dataset.remove); save(); renderCart();});
  clearLoader();
}
async function renderFavorites(){
  setupShell('fav'); await initData(); const list=products.filter(p=>favs.includes(p.id));
  $('#mFavGrid').innerHTML=list.map(card).join('')||'<div class="m-empty">В избранном пока пусто</div>'; bind(); clearLoader();
}

const usersCollection = COLLECTIONS.users || 'autostyle_users';
async function getUserDoc(uid){
  const primary = doc(db, usersCollection, uid);
  const snap = await getDoc(primary);
  if (snap.exists()) return { ref:primary, data:snap.data() };
  const legacy = doc(db, 'users', uid);
  const old = await getDoc(legacy).catch(()=>null);
  if (old && old.exists()) return { ref:primary, data:old.data() };
  return { ref:primary, data:{} };
}
function isProfileCompleteData(d={}){
  return Boolean(String(d.name||'').trim() && String(d.email||'').trim() && String(d.phone||'').trim() && String(d.city||'').trim() && String(d.address||'').trim() && String(d.car||d.carText||'').trim());
}
function makeDiscountCardNumber(uid=''){
  const base = String(uid).split('').reduce((sum,ch)=>sum+ch.charCodeAt(0),0);
  let body = ('29' + String(base).padStart(5,'0').slice(-5) + String(Date.now()).slice(-5)).slice(0,12).padEnd(12,'0');
  let sum=0; for(let i=0;i<12;i++) sum += Number(body[i]) * (i % 2 === 0 ? 1 : 3);
  return body + ((10 - (sum % 10)) % 10);
}
function ean13Svg(code){
  const L={'0':'0001101','1':'0011001','2':'0010011','3':'0111101','4':'0100011','5':'0110001','6':'0101111','7':'0111011','8':'0110111','9':'0001011'};
  const G={'0':'0100111','1':'0110011','2':'0011011','3':'0100001','4':'0011101','5':'0111001','6':'0000101','7':'0010001','8':'0001001','9':'0010111'};
  const R={'0':'1110010','1':'1100110','2':'1101100','3':'1000010','4':'1011100','5':'1001110','6':'1010000','7':'1000100','8':'1001000','9':'1110100'};
  const P=['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];
  code=String(code||'').replace(/\D/g,'').padEnd(13,'0').slice(0,13); const parity=P[Number(code[0])||0]; let bits='101';
  for(let i=1;i<=6;i++) bits+=(parity[i-1]==='L'?L:G)[code[i]]; bits+='01010'; for(let i=7;i<=12;i++) bits+=R[code[i]]; bits+='101';
  const w=190,h=56,bw=w/bits.length; let rects=''; for(let i=0;i<bits.length;i++) if(bits[i]==='1') rects+=`<rect x="${(i*bw).toFixed(2)}" y="0" width="${Math.ceil(bw)+.4}" height="44"/>`;
  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg"><rect width="${w}" height="${h}" rx="6" fill="#fff"/>${rects}<text x="${w/2}" y="53" text-anchor="middle" font-family="monospace" font-size="10" fill="#111827">${code.replace(/(\d)(\d{6})(\d{6})/,'$1 $2 $3')}</text></svg>`;
}
function profileDataFromForm(u, old={}){
  return {
    uid:u.uid,
    name:$('#pName')?.value.trim() || old.name || u.displayName || '',
    email:$('#pEmailEdit')?.value.trim() || old.email || u.email || '',
    phone:$('#pPhone')?.value.trim() || old.phone || '',
    city:$('#pCity')?.value.trim() || old.city || '',
    address:$('#pAddress')?.value.trim() || old.address || '',
    car:$('#pCar')?.value.trim() || old.car || old.carText || '',
    photoURL:$('#pPhoto')?.value.trim() || old.photoURL || u.photoURL || ''
  };
}
function renderDiscountCard(u, data={}){
  const card=data.discountCard || {}; const active=Boolean(card.active || data.discountCardActive);
  const complete=isProfileCompleteData({...data,email:data.email||u.email,name:data.name||u.displayName});
  const number=card.number || data.discountCardNumber || makeDiscountCardNumber(u.uid);
  return `<section class="m-discount-card ${active?'active':'locked'}"><div class="m-discount-visual"><div class="m-discount-logo">AS <span>AUTOSTYLE</span></div><em>${data.name||u.displayName||u.email||'AutoStyle'}</em><div class="m-discount-barcode">${active?ean13Svg(number):'<div class="m-discount-lock">Заполните профиль</div>'}</div><small>${active?number:'Карта пока не активна'}</small></div><div class="m-discount-info"><h2>${active?'Скидочная карта активна':'Скидочная карта'}</h2><p>${active?'Карта привязана к аккаунту и доступна в мобильном приложении.':'Заполните имя, телефон, город, адрес и автомобиль, затем получите карту.'}</p><button id="mGetDiscount" class="m-primary" style="width:100%">${complete?'Получить скидочную карту':'Заполнить профиль'}</button><a class="m-btn" style="width:100%;margin-top:10px" href="mobile-cart.html">Перейти в корзину</a></div></section>`;
}
async function activateDiscountCard(u, currentData){
  const data=profileDataFromForm(u,currentData);
  if(!isProfileCompleteData(data)){ alert('Заполните имя, телефон, город, адрес и автомобиль, затем сохраните профиль.'); return; }
  const number=currentData.discountCard?.number || currentData.discountCardNumber || makeDiscountCardNumber(u.uid);
  const issuedAt=new Date().toISOString();
  const current=await getUserDoc(u.uid);
  await setDoc(current.ref,{...data,discountCard:{active:true,number,type:'EAN13',issuedAt},discountCardActive:true,discountCardNumber:number,updatedAt:issuedAt,createdAt:current.data.createdAt||issuedAt,role:current.data.role||'user'},{merge:true});
  await setDoc(doc(db, COLLECTIONS.discountCards || 'autostyle_discountCards', u.uid),{...data,userId:u.uid,number,type:'EAN13',active:true,issuedAt,updatedAt:issuedAt,createdAtServer:serverTimestamp(),searchText:`${data.name} ${data.email} ${data.phone} ${number} ${data.city} ${data.car}`.toLowerCase()},{merge:true}).catch(()=>{});
  alert('Скидочная карта активирована.'); location.hash='discount-card'; location.reload();
}
function renderInfoShell(active='more'){ setupShell(active); clearLoader(); }



function providerTitle(id){
  return ({'password':'Email/пароль','phone':'Телефон / SMS'})[id] || id;
}
function userProviders(u){ return (u?.providerData || []).map(x => x.providerId).filter(Boolean).filter(id => id === 'password' || id === 'phone'); }
async function saveAuthProfile(u, extra={}){
  if(!u) return;
  const current = await getUserDoc(u.uid);
  await setDoc(current.ref, {
    uid:u.uid,
    name: extra.name || current.data.name || u.displayName || '',
    email: extra.email || current.data.email || u.email || '',
    phone: extra.phone || current.data.phone || u.phoneNumber || '',
    photoURL: extra.photoURL || current.data.photoURL || u.photoURL || '',
    providers:userProviders(u),
    emailVerified:Boolean(u.emailVerified),
    phoneVerified:Boolean(u.phoneNumber),
    lastLoginAt:new Date().toISOString(),
    updatedAt:new Date().toISOString(),
    createdAt:current.data.createdAt || new Date().toISOString(),
    role:current.data.role || 'user'
  }, { merge:true });
}
function ensureRecaptcha(containerId='mRecaptcha'){
  let el = document.getElementById(containerId);
  if(!el){ el = document.createElement('div'); el.id = containerId; document.body.appendChild(el); }
  if(!window.mRecaptchaVerifier) window.mRecaptchaVerifier = new RecaptchaVerifier(auth, containerId, { size:'invisible' });
  return window.mRecaptchaVerifier;
}
async function startPhoneAuth(phone, link=false){
  const verifier = ensureRecaptcha();
  if(link && auth.currentUser){
    window.mPhoneConfirmation = await linkWithPhoneNumber(auth.currentUser, phone, verifier);
  } else {
    window.mPhoneConfirmation = await signInWithPhoneNumber(auth, phone, verifier);
  }
  alert('SMS-код отправлен.');
}
async function confirmPhoneAuth(code){
  if(!window.mPhoneConfirmation) throw new Error('Сначала отправьте SMS-код.');
  const res = await window.mPhoneConfirmation.confirm(code);
  await saveAuthProfile(auth.currentUser || res.user);
  alert('Телефон подтверждён.');
  location.reload();
}
async function registerByEmail(){
  const name = $('#pRegName')?.value.trim() || '';
  const email = $('#pRegEmail')?.value.trim() || '';
  const pass = $('#pRegPass')?.value || '';
  const res = await createUserWithEmailAndPassword(auth, email, pass);
  await updateProfile(res.user, { displayName:name });
  await sendEmailVerification(res.user);
  await saveAuthProfile(res.user, { name, email });
  alert('Аккаунт создан. Письмо подтверждения отправлено на почту.');
  location.reload();
}

function initials(u){const base=(u?.displayName||u?.email||'AS').trim();return base.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'AS'}
async function renderProfile(){
  setupShell('profile');
  onAuthStateChanged(auth, async u=>{
    userNow=u; const box=$('#mProfileBox');
    if(!u){
      box.innerHTML=`<h1>Профиль</h1><p class="m-group">Войдите по почте, зарегистрируйтесь или используйте SMS. После входа можно подтвердить почту и привязать телефон.</p>
      <div class="m-auth-box"><h2>Email</h2><input id="pEmail" class="m-input" placeholder="Email"><input id="pPass" class="m-input" type="password" placeholder="Пароль"><button id="pLogin" class="m-primary" style="width:100%;margin-top:10px">Войти</button></div>
      <div class="m-auth-box"><h2>Регистрация</h2><input id="pRegName" class="m-input" placeholder="Имя"><input id="pRegEmail" class="m-input" type="email" placeholder="Email"><input id="pRegPass" class="m-input" type="password" placeholder="Пароль от 6 символов"><button id="pRegister" class="m-primary" style="width:100%;margin-top:10px">Создать и подтвердить почту</button></div>
      <div class="m-auth-box"><h2>Вход по SMS</h2><input id="pPhoneLogin" class="m-input" placeholder="Телефон: +373..."><button id="pSendSms" class="m-btn" style="width:100%;margin-top:10px">Получить SMS-код</button><input id="pSmsCode" class="m-input" placeholder="Код из SMS"><button id="pConfirmSms" class="m-primary" style="width:100%;margin-top:10px">Подтвердить SMS</button><div id="mRecaptcha"></div></div>
      <a class="m-btn" style="width:100%;margin-top:10px" href="mobile.html">На главную</a><div class="m-link-grid" style="margin-top:16px"><a href="mobile-contacts.html">Контакты</a><a href="mobile-installment.html">Рассрочка</a><a href="mobile-certificates.html">Сертификаты</a><a href="mobile-about.html">Про нас</a></div>`;
      $('#pLogin').onclick=async()=>{ try{ const res=await signInWithEmailAndPassword(auth,$('#pEmail').value.trim(),$('#pPass').value); await saveAuthProfile(res.user); location.reload(); }catch(e){ alert('Ошибка входа: '+(e.message||e)); } };
      $('#pRegister').onclick=async()=>{ try{ await registerByEmail(); }catch(e){ alert('Ошибка регистрации: '+(e.message||e)); } };
      $('#pSendSms').onclick=async()=>{ try{ await startPhoneAuth($('#pPhoneLogin').value.trim()); }catch(e){ alert('Не удалось отправить SMS: '+(e.message||e)); } };
      $('#pConfirmSms').onclick=async()=>{ try{ await confirmPhoneAuth($('#pSmsCode').value.trim()); }catch(e){ alert('Ошибка SMS-подтверждения: '+(e.message||e)); } };
      clearLoader(); return;
    }
    const current=await getUserDoc(u.uid); const d=current.data || {};
    box.innerHTML=`<div class="m-row"><div class="m-avatar">${(d.photoURL||u.photoURL)?`<img src="${d.photoURL||u.photoURL}">`:initials({displayName:d.name||u.displayName,email:d.email||u.email})}</div><div><h1 style="margin:0">${d.name||u.displayName||'Профиль'}</h1><div class="m-group">${d.email||u.email||''}</div></div></div>
    <div class="m-profile-tabs"><a href="#account">Данные</a><a href="#security">Вход</a><a href="#discount-card">Карта</a><a href="mobile-favorites.html">Избранное</a><a href="mobile-cart.html">Корзина</a></div>
    <section id="account" class="m-profile-pane"><h2>Данные аккаунта</h2><input id="pName" class="m-input" value="${d.name||u.displayName||''}" placeholder="Имя"><input id="pEmailEdit" class="m-input" value="${d.email||u.email||''}" placeholder="Email"><input id="pPhone" class="m-input" value="${d.phone||u.phoneNumber||''}" placeholder="Телефон"><input id="pCity" class="m-input" value="${d.city||''}" placeholder="Город"><input id="pAddress" class="m-input" value="${d.address||''}" placeholder="Адрес"><input id="pCar" class="m-input" value="${d.car||d.carText||''}" placeholder="Автомобиль"><input id="pPhoto" class="m-input" value="${d.photoURL||u.photoURL||''}" placeholder="Фото URL"><input id="pPassEdit" class="m-input" type="password" placeholder="Новый пароль"><button id="saveProfile" class="m-primary" style="width:100%;margin-top:10px">Сохранить профиль</button></section>
    <section id="security" class="m-profile-pane"><h2>Привязка входа</h2><p class="m-group">Подключено: ${userProviders(u).map(providerTitle).join(', ') || 'не определено'} · Почта ${u.emailVerified?'подтверждена':'не подтверждена'} · Телефон ${u.phoneNumber?'подтверждён':'не привязан'}</p><button id="resendEmailVerify" class="m-btn" style="width:100%;margin-top:10px">Отправить подтверждение почты</button><div class="m-auth-box"><input id="pLinkPhone" class="m-input" value="${u.phoneNumber||d.phone||''}" placeholder="Телефон: +373..."><button id="pLinkSms" class="m-btn" style="width:100%;margin-top:10px">Отправить SMS для привязки</button><input id="pLinkCode" class="m-input" placeholder="Код из SMS"><button id="pConfirmLinkSms" class="m-primary" style="width:100%;margin-top:10px">Подтвердить и привязать</button><div id="mRecaptcha"></div></div></section>
    <section id="discount-card" class="m-profile-pane">${renderDiscountCard(u,d)}</section>
    <section class="m-profile-pane"><h2>Все разделы</h2><div class="m-link-grid"><a href="mobile-installment.html">Рассрочка</a><a href="mobile-certificates.html">Сертификаты</a><a href="mobile-contacts.html">Контакты</a><a href="mobile-about.html">Про нас</a></div><button id="pLogout" class="m-danger" style="width:100%;height:50px;margin-top:14px">Выйти</button></section>`;
    $$('.m-profile-pane .m-input').forEach(el=>el.style.marginTop='10px');
    $('#saveProfile').onclick=async()=>{ const data=profileDataFromForm(u,d); await updateProfile(u,{displayName:data.name,photoURL:data.photoURL||null}); if($('#pPassEdit').value.trim()) await updatePassword(u,$('#pPassEdit').value.trim()); await setDoc(current.ref,{...data,updatedAt:new Date().toISOString(),createdAt:d.createdAt||new Date().toISOString(),role:d.role||'user'},{merge:true}); alert('Профиль сохранён'); location.reload(); };
    $('#mGetDiscount').onclick=async()=>activateDiscountCard(u,d);
    $('#resendEmailVerify').onclick=async()=>{ try{ await sendEmailVerification(u); alert('Письмо подтверждения отправлено.'); }catch(e){ alert('Не удалось отправить письмо: '+(e.message||e)); } };
    $('#pLinkSms').onclick=async()=>{ try{ await startPhoneAuth($('#pLinkPhone').value.trim(), true); }catch(e){ alert('Не удалось отправить SMS: '+(e.message||e)); } };
    $('#pConfirmLinkSms').onclick=async()=>{ try{ await confirmPhoneAuth($('#pLinkCode').value.trim()); }catch(e){ alert('Ошибка подтверждения телефона: '+(e.message||e)); } };
    $('#pLogout').onclick=async()=>{localStorage.removeItem('cart');localStorage.removeItem('favorites');await signOut(auth);location.href='mobile.html'};
    clearLoader();
  });
}

(async()=>{
  try{
    setupMobileChrome();
    if(page==='home') await renderHome();
    if(page==='catalog') await renderCatalog();
    if(page==='product') await renderProduct();
    if(page==='cart') await renderCart();
    if(page==='favorites') await renderFavorites();
    if(page==='profile') await renderProfile();
    if(['about','contacts','installment','certificates','more'].includes(page)) renderInfoShell(page==='more'?'profile':'home');
  }catch(e){ console.error(e); clearLoader(); }
})();
