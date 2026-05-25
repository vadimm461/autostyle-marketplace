import { db, auth } from './firebase.js';
import { collection, getDocs, query, orderBy, doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const money = n => (Number(n)||0).toLocaleString('ru-RU') + ' ₴';

async function getCol(name){
  const snap = await getDocs(query(collection(db,name), orderBy('createdAt','desc'))).catch(async()=>{
    return await getDocs(collection(db,name)).catch(()=>null);
  });
  return snap ? snap.docs.map(d=>({id:d.id,...d.data()})) : [];
}

function getCart(){return JSON.parse(localStorage.getItem('cart')||'[]')}
function setCart(c){localStorage.setItem('cart',JSON.stringify(c)); const cc=$('#cartCount'); if(cc)cc.textContent=c.length; renderCart()}
window.getCart=getCart; window.setCart=setCart;
window.addToCart = p => {const c=getCart(); c.push(p); setCart(c); toggleCart(true)};
window.toggleCart = open => {$('#cartDrawer')?.classList.toggle('open', open ?? !$('#cartDrawer').classList.contains('open')); renderCart()};

function layoutHeader(user=null, role='user'){
 const cart = getCart();
 const userArea = user
   ? `<div class="user-menu"><b>👤 ${user.email}</b><button onclick="window.logoutUser()">Выйти</button>${role==='admin'?'<a href="admin.html">Админка</a>':''}</div>`
   : `<a class="head-action" href="login.html"><b>👤</b>Войти</a>`;
 return `<header class="header clean-header"><div class="header-inner"><a class="brand" href="index.html"><span>AUTO</span>STYLE</a><button class="catalog-btn" onclick="document.getElementById('categories')?.scrollIntoView({behavior:'smooth'})">☷ Каталог</button><form class="search" onsubmit="event.preventDefault(); window.searchProducts?.()"><input id="searchInput" placeholder="Я ищу автотовары..."><button>Найти</button></form><div class="head-actions">${userArea}<a class="head-action" href="#"><b>♡</b>Избранное</a><button class="cart-btn" onclick="window.toggleCart()">🛒 Корзина <span id="cartCount">${cart.length}</span></button></div></div></header>`
}

function cartHtml(){ return `<aside id="cartDrawer" class="cart-drawer"><button class="danger" onclick="toggleCart()">Закрыть</button><h2>Корзина</h2><div id="cartList"></div><h3 id="cartTotal"></h3></aside>` }
function renderCart(){const list=$('#cartList'); if(!list)return; const c=getCart(); list.innerHTML=c.length?c.map((x,i)=>`<div class="cart-line"><span>${x.title}</span><b>${money(x.price)}</b><button onclick="let c=getCart();c.splice(${i},1);setCart(c)">×</button></div>`).join(''):'<p class="muted">Корзина пустая</p>'; $('#cartTotal').textContent='Итого: '+money(c.reduce((s,x)=>s+Number(x.price||0),0))}

async function getUserRole(user){
  if(!user) return 'user';
  const snap = await getDoc(doc(db,'users',user.uid)).catch(()=>null);
  return snap && snap.exists() ? (snap.data().role || 'user') : 'user';
}

async function renderHeader(user=null){
  const role = await getUserRole(user);
  const h = $('#siteHeader');
  if(h) h.innerHTML = layoutHeader(user, role);
  const c = $('#cartRoot');
  if(c && !$('#cartDrawer')) c.innerHTML = cartHtml();
}
window.logoutUser = () => signOut(auth).then(()=>location.href='index.html');

async function home(){
 if(!$('#home'))return;
 let cats=(await getCol('categories')).map(x=>x.title).filter(Boolean);
 let banners=await getCol('banners');
 let products=await getCol('products');

 $('#sideCats').innerHTML = cats.length
   ? cats.map(c=>`<div class="cat-row" onclick="filterCat('${c.replaceAll("'","\\'")}')"><span>${c}</span><b>›</b></div>`).join('')
   : '<div class="empty-box">Категории появятся после добавления в админке.</div>';

 $('#chips').innerHTML = ['ТОП товары',...cats].map((c,i)=>`<button class="chip ${i==0?'active':''}" onclick="filterCat('${i?c.replaceAll("'","\\'"):''}')">${c}</button>`).join('');

 if (banners.length) {
   $('#slider').innerHTML=banners.map((b,i)=>`<div class="slide ${i==0?'active':''}" style="background-image:url('${b.image||'assets/store.jpeg'}')"><div class="slide-content"><div class="slide-kicker">${b.subtitle||'AUTO STYLE'}</div><h1>${b.title||''}</h1><p>${b.text||''}</p><button class="primary">Смотреть товары</button></div></div>`).join('')+'<div class="dots">'+banners.map((_,i)=>`<span class="dot ${i==0?'active':''}"></span>`).join('')+'</div>';
   $('#miniBanners').innerHTML=banners.slice(1,3).map(b=>`<div class="mini-banner"><div><h3>${b.title||''}</h3><p>${b.text||''}</p></div><img src="${b.image||'assets/logo.jpeg'}"></div>`).join('');
 } else {
   $('#slider').innerHTML = `<div class="slide active empty-slide"><div class="slide-content"><div class="slide-kicker">AUTO STYLE</div><h1>Главный баннер</h1><p>Добавьте баннеры через админку.</p></div></div>`;
   $('#miniBanners').innerHTML = '<div class="mini-banner"><h3>Баннеры редактируются в админке</h3></div>';
 }

 window.allProducts=products;
 renderProducts(products);
 let idx=0; setInterval(()=>{const slides=$$('.slide'),dots=$$('.dot'); if(slides.length<2)return; slides[idx].classList.remove('active'); dots[idx]?.classList.remove('active'); idx=(idx+1)%slides.length; slides[idx].classList.add('active'); dots[idx]?.classList.add('active')},3500)
}

function renderProducts(products){
 const box = $('#products');
 if(!box) return;
 box.innerHTML = products.length ? products.map(p=>`<article class="product-card"><div class="product-img"><img src="${p.image||'assets/logo.jpeg'}"></div><div>${p.oldPrice?'<span class="badge">скидка</span>':''}<span class="badge green">в наличии</span></div><p class="product-title">${p.title||'Товар'}</p><div class="rating">★★★★★ <span class="muted">${p.rating||'4.9'}</span></div><div class="old">${p.oldPrice?money(p.oldPrice):''}</div><div class="price">${money(p.price)}</div><button class="buy" onclick='addToCart(${JSON.stringify({title:p.title||'Товар',price:p.price||0}).replaceAll("'","&apos;")})'>🛒</button></article>`).join('') : '<div class="empty-products">Товары пока не добавлены. Добавьте товары через админку.</div>';
}
window.filterCat = cat => renderProducts(cat?window.allProducts.filter(p=>p.category===cat):window.allProducts);
window.searchProducts = () => {const v=$('#searchInput').value.toLowerCase(); renderProducts(window.allProducts.filter(p=>(p.title||'').toLowerCase().includes(v)))};

onAuthStateChanged(auth, async user=>{ await renderHeader(user); });
home();
