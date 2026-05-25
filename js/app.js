import { db, auth } from './firebase.js';
import { collection, addDoc, getDocs, deleteDoc, doc, setDoc, getDoc, serverTimestamp, query, orderBy } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const money = n => (Number(n)||0).toLocaleString('ru-RU') + ' ₴';

const defaults = {
 categories:['Автохимия','Масла','Аксессуары','Инструменты','Автосвет','Щетки','Фильтры','Авто и мототовары'],
 banners:[
  {title:'AUTO STYLE',subtitle:'Автотовары и аксессуары',text:'Премиальный магазин для ухода, тюнинга и обслуживания авто',image:'assets/store.jpeg'},
  {title:'Товар дня',subtitle:'Скидки недели',text:'Лучшие предложения на автохимию и аксессуары',image:'assets/logo.jpeg'},
  {title:'Качество, которому доверяют',subtitle:'Проверенные бренды',text:'Широкий ассортимент, консультация и выгодные цены',image:'assets/store.jpeg'}
 ],
 products:[
  {title:'Омыватель стекла зимний -20°C',price:129,oldPrice:169,category:'Автохимия',image:'assets/store.jpeg',rating:'4.9'},
  {title:'Моторное масло premium 5W-30',price:899,oldPrice:1099,category:'Масла',image:'assets/logo.jpeg',rating:'4.8'},
  {title:'Набор автоаксессуаров',price:499,oldPrice:649,category:'Аксессуары',image:'assets/store.jpeg',rating:'4.7'}
 ]
};

async function getCol(name){ const snap = await getDocs(query(collection(db,name), orderBy('createdAt','desc'))).catch(()=>null); return snap? snap.docs.map(d=>({id:d.id,...d.data()})):[] }
async function seedIfEmpty(){ for(const c of defaults.categories){ /* no auto seed categories to avoid duplicates */ } }

function layoutHeader(){
 const cart = getCart();
 return `<div class="topbar"><span>📍 Ваш город</span><nav><a>Акции</a><a>Магазины</a><a>Доставка</a><a>Покупателям</a></nav><span>☎ Связаться с нами</span></div>
 <header class="header"><div class="header-inner"><a class="brand" href="index.html"><span>AUTO</span>STYLE</a><button class="catalog-btn" onclick="document.getElementById('categories').scrollIntoView({behavior:'smooth'})">☷ Каталог</button><form class="search" onsubmit="event.preventDefault(); window.searchProducts?.()"><input id="searchInput" placeholder="Я ищу..."><button>Найти</button></form><div class="head-actions"><a class="head-action" href="login.html"><b>👤</b>Войти</a><a class="head-action" href="#"><b>♡</b>Избранное</a><button class="cart-btn" onclick="window.toggleCart()">🛒 Корзина <span id="cartCount">${cart.length}</span></button></div></div></header>`
}
function cartHtml(){ return `<aside id="cartDrawer" class="cart-drawer"><button class="danger" onclick="toggleCart()">Закрыть</button><h2>Корзина</h2><div id="cartList"></div><h3 id="cartTotal"></h3></aside>` }
function getCart(){return JSON.parse(localStorage.getItem('cart')||'[]')}
function setCart(c){localStorage.setItem('cart',JSON.stringify(c)); const cc=$('#cartCount'); if(cc)cc.textContent=c.length; renderCart()}
window.addToCart = p => {const c=getCart(); c.push(p); setCart(c); toggleCart(true)};
window.toggleCart = open => {$('#cartDrawer')?.classList.toggle('open', open ?? !$('#cartDrawer').classList.contains('open')); renderCart()}
function renderCart(){const list=$('#cartList'); if(!list)return; const c=getCart(); list.innerHTML=c.length?c.map((x,i)=>`<div class="cart-line"><span>${x.title}</span><b>${money(x.price)}</b><button onclick="let c=getCart();c.splice(${i},1);setCart(c)">×</button></div>`).join(''):'<p class="muted">Корзина пустая</p>'; $('#cartTotal').textContent='Итого: '+money(c.reduce((s,x)=>s+Number(x.price||0),0))}
window.getCart=getCart; window.setCart=setCart;

async function home(){
 if(!$('#home'))return;
 $('#siteHeader').innerHTML=layoutHeader(); $('#cartRoot').innerHTML=cartHtml();
 let cats=(await getCol('categories')).map(x=>x.title); if(!cats.length)cats=defaults.categories;
 let banners=await getCol('banners'); if(!banners.length)banners=defaults.banners;
 let products=await getCol('products'); if(!products.length)products=defaults.products;
 $('#sideCats').innerHTML=cats.map(c=>`<div class="cat-row" onclick="filterCat('${c}')"><span>${c}</span><b>›</b></div>`).join('');
 $('#chips').innerHTML=['ТОП товары',...cats].map((c,i)=>`<button class="chip ${i==0?'active':''}" onclick="filterCat('${i?c:''}')">${c}</button>`).join('');
 $('#slider').innerHTML=banners.map((b,i)=>`<div class="slide ${i==0?'active':''}" style="background-image:url('${b.image||'assets/store.jpeg'}')"><div class="slide-content"><div class="slide-kicker">${b.subtitle||'AUTO STYLE'}</div><h1>${b.title||''}</h1><p>${b.text||''}</p><button class="primary">Смотреть товары</button></div></div>`).join('')+'<div class="dots">'+banners.map((_,i)=>`<span class="dot ${i==0?'active':''}"></span>`).join('')+'</div>';
 $('#miniBanners').innerHTML=banners.slice(1,3).map(b=>`<div class="mini-banner"><div><h3>${b.title}</h3><p>${b.text||''}</p></div><img src="${b.image||'assets/logo.jpeg'}"></div>`).join('');
 window.allProducts=products; renderProducts(products);
 let idx=0; setInterval(()=>{const slides=$$('.slide'),dots=$$('.dot'); if(!slides.length)return; slides[idx].classList.remove('active'); dots[idx]?.classList.remove('active'); idx=(idx+1)%slides.length; slides[idx].classList.add('active'); dots[idx]?.classList.add('active')},3500)
}
function renderProducts(products){ $('#products').innerHTML=products.map(p=>`<article class="product-card"><div class="product-img"><img src="${p.image||'assets/logo.jpeg'}"></div><div><span class="badge">5% mono</span><span class="badge green">акция</span></div><p class="product-title">${p.title}</p><div class="rating">★★★★★ <span class="muted">${p.rating||'4.9'}</span></div><div class="old">${p.oldPrice?money(p.oldPrice):''}</div><div class="price">${money(p.price)}</div><button class="buy" onclick='addToCart(${JSON.stringify({title:p.title,price:p.price}).replaceAll("'","&apos;")})'>🛒</button></article>`).join('') }
window.filterCat = cat => renderProducts(cat?window.allProducts.filter(p=>p.category===cat):window.allProducts);
window.searchProducts = () => {const v=$('#searchInput').value.toLowerCase(); renderProducts(window.allProducts.filter(p=>(p.title||'').toLowerCase().includes(v)))};

onAuthStateChanged(auth, async user=>{ const box=$('#userBox'); if(box){ box.innerHTML=user?`<b>${user.email}</b> <button onclick="signOut(auth)">Выйти</button>`:'<a href="login.html">Войти</a>'; } });
home();
