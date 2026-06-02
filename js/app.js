
import { auth, db, COLLECTIONS } from './firebase.js';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, sendEmailVerification } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { collection, getDocs, setDoc, doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);let cart=JSON.parse(localStorage.getItem('cart')||'[]');let favs=JSON.parse(localStorage.getItem('favorites')||'[]');let allProducts=[];
const money=v=>`${Number(v||0).toLocaleString('ru-RU')} ₽`;const stock=p=>Number(p.stock??p.quantity??p.count??1);const title=p=>p.title||p.name||'Без названия';const img=p=>p.image||p.imageUrl||p.photo||'';const group=p=>p.group||p.category||p.categoryName||'Без группы';
function oldPrice(p){return Number(p.oldPrice||p.priceOld||p.compareAtPrice||0)}function discount(p){const d=Number(p.discount||p.discountPercent||0);if(d>0)return d;const op=oldPrice(p), pr=Number(p.price||0);return op>pr&&pr>0?Math.round((op-pr)/op*100):0}
function saveCart(){localStorage.setItem('cart',JSON.stringify(cart));$('#cartCount')&&($('#cartCount').textContent=cart.length)}function saveFav(){localStorage.setItem('favorites',JSON.stringify(favs))}
async function loadCollection(name){const snap=await getDocs(collection(db,name));return snap.docs.map(d=>({id:d.id,...d.data()}))}
function isHome(p,section){const hs=String(p.homeSection||p.homeBlock||'').toLowerCase();const tag=String(p.tag||'').toLowerCase();if(section==='new')return p.showOnHome===true&&(hs==='new'||tag==='new');if(section==='bestsellers')return p.showOnHome===true&&(hs==='bestsellers'||hs==='best'||tag==='best'||tag==='bestseller');if(section==='hot')return p.showOnHome===true&&(!hs||hs==='hot'||tag==='hot'||!tag);return false}
function card(p){const d=discount(p), op=oldPrice(p), inst=(p.installment||p.installmentAvailable);return `<article class="product-card"><button class="fav-btn ${favs.includes(p.id)?'active':''}" data-fav="${p.id}" type="button">♡</button><a class="product-card-link" href="product.html?id=${p.id}"><div class="product-img">${d?`<span class="discount-badge">-${d}%</span>`:''}${img(p)?`<img src="${img(p)}" alt="${title(p)}">`:'Фото'}</div><div class="product-title">${title(p)}</div><div class="product-group">${group(p)}</div>${inst?`<div class="installment-badge">Доступно в рассрочку</div>`:''}<div class="price-row-card"><div class="price-current price">${money(p.price)}</div>${op?`<div class="old-price price-old">${money(op)}</div>`:''}</div></a><button class="cart" data-cart="${p.id}" type="button">В корзину</button></article>`}
function renderGrid(sel,products,empty){const box=$(sel);if(!box)return;const limit=Number(box.dataset.limit||5);const list=products.filter(p=>stock(p)>0).slice(0,limit);box.innerHTML=list.length?list.map(card).join(''):`<div class="notice">${empty}</div>`;bindProductButtons(box)}
function bindProductButtons(scope=document){scope.querySelectorAll('[data-cart]').forEach(b=>b.onclick=e=>{e.preventDefault();cart.push(b.dataset.cart);saveCart();b.textContent='✓ Добавлено';setTimeout(()=>b.textContent='В корзину',900)});scope.querySelectorAll('[data-fav]').forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();const id=b.dataset.fav;favs=favs.includes(id)?favs.filter(x=>x!==id):[...favs,id];b.classList.toggle('active',favs.includes(id));saveFav()})}
async function renderCatalogMenu(){let cats=[];try{cats=await loadCollection(COLLECTIONS.categories)}catch(e){}cats.sort((a,b)=>Number(a.order??999)-Number(b.order??999)||String(a.title||a.name||'').localeCompare(String(b.title||b.name||''),'ru'));const pb=$('#catalogParents'),cb=$('#catalogChildren'),tb=$('#megaTitle');if(!pb||!cb||!tb)return;const parents=cats.filter(c=>!c.parentId),children=cats.filter(c=>c.parentId);const name=c=>c.title||c.name||'Без названия';function render(parent){const list=children.filter(c=>c.parentId===parent.id||c.parentId===parent.externalId);tb.textContent=name(parent);cb.innerHTML=(list.length?list:[parent]).map(ch=>`<a href="catalog.html?category=${encodeURIComponent(name(ch))}" class="mega-child"><span>${ch.icon||'AS'}</span><div><b>${list.length?name(ch):'Все товары категории'}</b><small>${name(ch)}</small></div></a>`).join('')}pb.innerHTML=parents.length?parents.map((p,i)=>`<button class="mega-parent ${i?'':'active'}" data-parent="${p.id}" type="button"><span>${p.icon||'AS'}</span>${name(p)}</button>`).join(''):'<p class="muted">Категорий пока нет</p>';if(parents[0])render(parents[0]);$$('.mega-parent').forEach(btn=>btn.onmouseenter=btn.onclick=()=>{ $$('.mega-parent').forEach(b=>b.classList.remove('active'));btn.classList.add('active');const p=parents.find(x=>x.id===btn.dataset.parent);if(p)render(p)})}
const DEFAULT_HOME_BLOCKS=[
  {key:'bestsellers',title:'Лидеры продаж',order:1,enabled:true},
  {key:'new',title:'Новинки',order:2,enabled:true},
  {key:'hot',title:'Горячие предложения',order:3,enabled:true},
  {key:'recentlyViewed',title:'Недавно просмотренные',order:5,enabled:true,special:'recentlyViewed'}
];
async function getHomeBlocksConfig(){
  try{
    const snap=await getDoc(doc(db,COLLECTIONS.settings,'homeBlocks'));
    if(!snap.exists()) return DEFAULT_HOME_BLOCKS;
    const data=snap.data();
    if(Array.isArray(data.blocks)&&data.blocks.length){
      return data.blocks
        .map((b,i)=>({
          key:String(b.key||b.id||'block_'+i).trim(),
          title:b.title||b.name||String(b.key||'Блок товаров'),
          order:Number(b.order??999),
          enabled:b.enabled!==false,
          special:b.special||''
        }))
        .filter(b=>b.key&&b.enabled)
        .sort((a,b)=>a.order-b.order||a.title.localeCompare(b.title,'ru'));
    }
    return DEFAULT_HOME_BLOCKS.map(b=>({
      ...b,
      order:Number(data[b.key]??b.order),
      enabled:data[b.key+'Enabled']!==false
    })).sort((a,b)=>a.order-b.order);
  }catch(e){
    console.warn('Не удалось загрузить блоки главной:',e);
    return DEFAULT_HOME_BLOCKS;
  }
}
function bool(v){return v===true||v==='true'||v===1||v==='1'||v==='yes'||v==='Да'||v==='да'}
function productInBlock(p,key){
  const hs=String(p.homeSection||p.homeBlock||p.mainBlock||'').toLowerCase().trim();
  const tag=String(p.tag||p.label||p.badge||'').toLowerCase().trim();
  const k=String(key||'').toLowerCase().trim();
  const onHome=bool(p.showOnHome)||bool(p.home)||bool(p.onHome)||bool(p.mainPage);
  if(k==='recentlyviewed') return false;
  if(k==='new') return hs==='new'||hs==='novinki'||tag==='new'||tag==='новинка'||bool(p.isNew)||onHome&&tag==='new';
  if(k==='bestsellers') return hs==='bestsellers'||hs==='best'||hs==='leaders'||hs==='lideri'||tag==='best'||tag==='bestseller'||tag==='лидер'||tag==='хит'||bool(p.isBestseller)||bool(p.bestSeller);
  if(k==='hot') return hs==='hot'||hs==='sale'||tag==='hot'||tag==='sale'||tag==='акция'||tag==='горячее'||onHome||(!hs&&!tag);
  return hs===k || tag===k;
}
function ensureHomeSections(blocks){
  const main=document.querySelector('main.container');
  if(!main) return;
  const old=$$('.section-block.dynamic-home-block');
  old.forEach(x=>x.remove());
  // убираем старые фиксированные секции, чтобы не было дублей, и строим все заново в нужном порядке
  ['newProducts','recentlyViewed','bestsellers','productsBlock'].forEach(id=>{const el=document.getElementById(id); if(el) el.remove();});
  blocks.forEach(b=>{
    const gridId=`homeGrid_${b.key}`.replace(/[^a-zA-Z0-9_\-]/g,'_');
    const section=document.createElement('section');
    section.id=`homeBlock_${b.key}`.replace(/[^a-zA-Z0-9_\-]/g,'_');
    section.className='section-block dynamic-home-block';
    section.dataset.blockKey=b.key;
    section.style.order=String(Number(b.order??999));
    section.innerHTML=`<div class="section-head"><h2>${b.title}</h2><div class="section-actions"><button class="carousel-arrow" data-scroll-left="${gridId}" type="button">‹</button><button class="carousel-arrow" data-scroll-right="${gridId}" type="button">›</button><button class="show-section-btn" data-expand="${gridId}" type="button">Смотреть все</button></div></div><div id="${gridId}" class="products home-carousel" data-limit="5"></div>`;
    main.appendChild(section);
  });
}
function updateCarouselControls(box,total){
  if(!box) return;
  const section=box.closest('.section-block');
  if(!section) return;
  const arrows=section.querySelectorAll('.carousel-arrow');
  arrows.forEach(a=>{a.style.display=total>5?'inline-flex':'none'});
}
function renderGrid(sel,products,empty){
  const box=$(sel);if(!box)return;
  const limit=Number(box.dataset.limit||5);
  const available=products.filter(p=>stock(p)>0);
  const list=available.slice(0,limit);
  box.innerHTML=list.length?list.map(card).join(''):`<div class="notice">${empty}</div>`;
  updateCarouselControls(box, available.length);
  bindProductButtons(box)
}
async function renderHome(){
  let products=await loadCollection(COLLECTIONS.products);
  const blocks=await getHomeBlocksConfig();
  ensureHomeSections(blocks);
  allProducts=products;
  let banners=[];try{banners=await loadCollection(COLLECTIONS.banners)}catch(e){}
  const hero=$('#hero');if(hero){const b=banners[0]||{};hero.innerHTML=`<div class="hero-content"><span class="hero-label">AUTO STYLE MARKET</span><h1>${b.title||'Автотовары для стиля, комфорта и защиты'}</h1><p>${b.text||'Подбери аксессуары, автохимию и полезные товары для своего автомобиля в пару кликов.'}</p><div class="hero-actions"><a href="catalog.html" class="primary hero-btn">Смотреть каталог</a><a href="#homeBlock_bestsellers" class="hero-link">Лидеры продаж</a></div></div><div class="hero-visual"><div class="hero-car">AUTO</div></div>`}
  const bannersBox=$('#banners');if(bannersBox){const defs=[{title:'Акции',text:'Лучшие предложения недели'},{title:'Новинки',text:'Свежие товары для твоего авто'},{title:'Топ товары',text:'Популярный выбор покупателей'}];const list=banners.slice(1,4).length?banners.slice(1,4):defs;bannersBox.innerHTML=list.map(b=>`<a class="mini-banner" href="${b.link||'#homeBlock_hot'}"><h3>${b.title}</h3><p class="muted">${b.text||''}</p></a>`).join('')}
  for(const b of blocks){
    const gridId=('#homeGrid_'+b.key).replace(/[^#a-zA-Z0-9_\-]/g,'_');
    if(b.key==='recentlyViewed'||b.special==='recentlyViewed'){
      await renderRecentlyViewed(products, gridId);
    }else{
      { let list=products.filter(p=>productInBlock(p,b.key)); if((b.key==='hot'||b.key==='products'||b.key==='offers') && !list.length) list=products; renderGrid(gridId, list, `В админке отметьте товары: показывать на главной + блок “${b.title}”.`); }
    }
  }
  saveCart()
}
async function renderRecentlyViewed(products, sel='#homeGrid_recentlyViewed'){
  const ids=JSON.parse(localStorage.getItem('viewedProducts')||'[]');
  const byId=new Map(products.map(p=>[p.id,p]));
  let list=ids.map(id=>byId.get(id)).filter(Boolean);
  const section=$(sel)?.closest('.section-block');
  if(!list.length){ if(section) section.style.display='none'; return }
  if(section) section.style.display='block';
  renderGrid(sel,list,'Вы пока не смотрели товары.')
}
function setupExpand(){
  document.addEventListener('click',e=>{
    const left=e.target.closest('[data-scroll-left]');
    const right=e.target.closest('[data-scroll-right]');
    if(left||right){
      const id=(left||right).dataset.scrollLeft || (left||right).dataset.scrollRight;
      const grid=document.getElementById(id); if(!grid)return;
      const card=grid.querySelector('.product-card');
      const step=card?card.getBoundingClientRect().width+16:320;
      grid.scrollBy({left:left?-step:step,behavior:'smooth'});
      return;
    }
    const b=e.target.closest('[data-expand]');if(!b)return;
    const grid=document.getElementById(b.dataset.expand);if(!grid)return;
    grid.dataset.limit= grid.dataset.limit==='999'?'5':'999';
    b.textContent=grid.dataset.limit==='999'?'Свернуть':'Смотреть все';
    renderHome().then(()=>document.getElementById(b.dataset.expand)?.closest('.section-block')?.scrollIntoView({behavior:'smooth',block:'start'}))
  })
}
function setupSearch(){const input=$('#homeSearch')||$('#siteSearch'),btn=$('#homeSearchBtn')||$('#siteSearchBtn');const go=()=>{const q=encodeURIComponent((input?.value||'').trim());location.href=q?`catalog.html?search=${q}`:'catalog.html'};btn&&(btn.onclick=go);input&&input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();go()}})}
function authModal(){const modal=$('#authModal');if(!modal)return;$('#openAuth')&&($('#openAuth').onclick=()=>modal.classList.add('open'));$('#closeAuth')&&($('#closeAuth').onclick=()=>modal.classList.remove('open'));$$('.tab').forEach(t=>t.onclick=()=>{$$('.tab').forEach(x=>x.classList.remove('active'));t.classList.add('active');$('#loginForm').style.display=t.dataset.tab==='login'?'block':'none';$('#registerForm').style.display=t.dataset.tab==='register'?'block':'none'});$('#loginForm')&&($('#loginForm').onsubmit=async e=>{e.preventDefault();await signInWithEmailAndPassword(auth,$('#loginEmail').value.trim(),$('#loginPass').value);modal.classList.remove('open')});$('#registerForm')&&($('#registerForm').onsubmit=async e=>{e.preventDefault();const res=await createUserWithEmailAndPassword(auth,$('#regEmail').value.trim(),$('#regPass').value);await setDoc(doc(db,COLLECTIONS.users,res.user.uid),{name:$('#regName').value.trim(),email:$('#regEmail').value.trim(),role:'user',createdAt:new Date().toISOString()});await sendEmailVerification(res.user);alert('Аккаунт создан. Проверьте письмо на почте.');modal.classList.remove('open')});onAuthStateChanged(auth,u=>{const authBtn=$('#openAuth'),dd=$('#accountDrop');if(u){authBtn&&(authBtn.style.display='none');if(dd){dd.style.display='block';$('#userEmail')&&($('#userEmail').textContent=u.email);$('#logout')&&($('#logout').onclick=()=>signOut(auth))}}else{authBtn&&(authBtn.style.display='inline-block');dd&&(dd.style.display='none')}});$('#accountBtn')&&($('#accountBtn').onclick=()=>$('#accountDrop').classList.toggle('open'))}
authModal();setupSearch();setupExpand();renderHome();renderCatalogMenu();
