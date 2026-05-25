
import { db } from './firebase.js';
import { collection, onSnapshot, query } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
let banners=[], products=[], categories=[], current=0, cart=JSON.parse(localStorage.getItem('cart')||'[]');
const $=s=>document.querySelector(s);
function saveCart(){localStorage.setItem('cart',JSON.stringify(cart)); $('#cartCount') && ($('#cartCount').textContent=cart.length);}
function renderBanners(){const track=$('#bannerTrack'); if(!track)return; if(!banners.length){track.innerHTML='<div class="banner"><h2>Главный баннер</h2><p>Добавьте баннеры через админку.</p></div>';return} track.innerHTML=banners.map(b=>`<div class="banner" style="${b.image?'background-image:linear-gradient(90deg,rgba(0,0,0,.65),rgba(0,0,0,.1)),url('+b.image+')':''}"><h2>${b.title||''}</h2><p>${b.text||''}</p></div>`).join(''); track.style.transform=`translateX(-${current*100}%)`;}
function renderCats(){let c=$('#categoriesList'), chips=$('#categoryChips'); if(c)c.innerHTML=categories.length?categories.map(x=>`<div class="cat-row"><span>${x.icon||'▸'} ${x.name}</span>›</div>`).join(''):'<p class="empty">Категории появятся после добавления в админке.</p>'; if(chips)chips.innerHTML='<button class="chip active" data-category="">ТОП товары</button>'+categories.map(x=>`<button class="chip" data-category="${x.name}">${x.name}</button>`).join(''); document.querySelectorAll('.chip').forEach(b=>b.onclick=()=>{document.querySelectorAll('.chip').forEach(x=>x.classList.remove('active'));b.classList.add('active');renderProducts(b.dataset.category);});}
function renderProducts(filter=''){const grid=$('#productsGrid'); if(!grid)return; const list=filter?products.filter(p=>p.category===filter):products; grid.innerHTML=list.length?list.map(p=>`<article class="product"><img src="${p.image||'https://via.placeholder.com/350x250?text=AutoStyle'}"><h3>${p.name}</h3>${p.oldPrice?`<div class="old">${p.oldPrice} ₽</div>`:''}<div class="price">${p.price||0} ₽</div><button class="buy" data-id="${p.id}">🛒</button></article>`).join(''):'<p class="empty">Товары пока не добавлены. Добавьте товары через админку.</p>'; document.querySelectorAll('.buy').forEach(b=>b.onclick=()=>{cart.push(products.find(p=>p.id===b.dataset.id)); saveCart();});}
onSnapshot(collection(db,'banners'),s=>{banners=s.docs.map(d=>({id:d.id,...d.data()})); current=0; renderBanners();});
onSnapshot(collection(db,'categories'),s=>{categories=s.docs.map(d=>({id:d.id,...d.data()})); renderCats();});
onSnapshot(collection(db,'products'),s=>{products=s.docs.map(d=>({id:d.id,...d.data()})); renderProducts();});
$('#prevBanner')?.addEventListener('click',()=>{if(!banners.length)return; current=(current-1+banners.length)%banners.length; renderBanners();});
$('#nextBanner')?.addEventListener('click',()=>{if(!banners.length)return; current=(current+1)%banners.length; renderBanners();});
setInterval(()=>{if(banners.length>1){current=(current+1)%banners.length; renderBanners();}},4500);
$('#cartOpen')?.addEventListener('click',()=>{let box=$('#cartItems'); if(box)box.innerHTML=cart.length?cart.map(i=>`<div class="admin-item"><span>${i?.name||'Товар'}</span><b>${i?.price||0} ₽</b></div>`).join(''):'<p class="empty">Корзина пустая</p>'; $('#cartModal').classList.add('open');});
saveCart();
