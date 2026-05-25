import { db, auth } from './firebase.js';
import { collection, getDocs, doc, getDoc, setDoc, addDoc, deleteDoc, query, orderBy, limit } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

const $ = (s)=>document.querySelector(s);
const fallback = {
  settings:{brand:'AUTO<span class="green">STYLE</span>', phone:'779-67-67', slogan:'Автотовары и аксессуары нового поколения', heroTitle:'Автотовары, которым доверяют', heroText:'Подбирайте масла, автохимию, аксессуары и инструменты в современном магазине AUTO STYLE.', heroImage:'assets/store.jpeg'},
  categories:['Автохимия','Масла','Аксессуары','Инструменты','Автосвет','Фильтры','Щетки','Запчасти'],
  banners:[{title:'Товар дня',text:'Скидки на сезонные товары',type:'green'},{title:'Качество которому доверяют',text:'Проверенные бренды и консультация специалистов',type:'dark'}],
  features:[{title:'Проверенные бренды',text:'Только товары, которые реально нужны автомобилистам'},{title:'Широкий ассортимент',text:'От автохимии до инструментов'},{title:'Выгодные цены',text:'Акции и предложения каждый день'},{title:'Консультация',text:'Поможем выбрать правильный товар'}]
};
async function loadSettings(){const snap=await getDoc(doc(db,'site','settings'));return snap.exists()?snap.data():fallback.settings}
async function loadCollection(name, fb){try{const s=await getDocs(query(collection(db,name),orderBy('createdAt','desc')));const arr=s.docs.map(d=>({id:d.id,...d.data()}));return arr.length?arr:fb}catch(e){return fb}}
function money(v){return Number(v||0).toLocaleString('ru-RU')+' ₸'}
async function initHome(){const settings=await loadSettings();$('#brand').innerHTML=settings.brand||fallback.settings.brand;$('#phone').textContent=settings.phone||fallback.settings.phone;$('#slogan').textContent=settings.slogan||fallback.settings.slogan;$('#heroTitle').textContent=settings.heroTitle||fallback.settings.heroTitle;$('#heroText').textContent=settings.heroText||fallback.settings.heroText;$('#heroImg').src=settings.heroImage||fallback.settings.heroImage;
 const cats=await loadCollection('categories',fallback.categories.map(title=>({title})));$('#cats').innerHTML=cats.map(c=>`<a class="cat" href="catalog.html?cat=${encodeURIComponent(c.title)}"><span>${c.icon||'▸'} ${c.title}</span><b>›</b></a>`).join('');
 const banners=await loadCollection('banners',fallback.banners);$('#banners').innerHTML=banners.slice(0,2).map(b=>`<div class="miniBanner banner ${b.type==='dark'?'dark':'green'}"><h2>${b.title}</h2><p>${b.text||''}</p><a class="btn btnDark" href="${b.link||'catalog.html'}">Смотреть</a></div>`).join('');
 const fs=await loadCollection('features',fallback.features);$('#features').innerHTML=fs.map(f=>`<div class="feature card"><b>${f.title}</b><span>${f.text||''}</span></div>`).join('');
 const products=await loadCollection('products',[]);$('#products').innerHTML=products.length?products.slice(0,8).map(p=>card(p)).join(''):'<div class="card product"><h3>Товары появятся здесь после добавления в админке</h3></div>';
}
function card(p){return `<article class="product card"><a href="product.html?id=${p.id||''}"><div class="pic"><img src="${p.imageUrl||'assets/logo.jpeg'}"></div><h3>${p.title||'Товар'}</h3><div class="old">${p.oldPrice?money(p.oldPrice):''}</div><div class="price">${money(p.price)}</div></a><button class="btn buy">Подробнее</button></article>`}
async function initCatalog(){const products=await loadCollection('products',[]);$('#catalogProducts').innerHTML=products.map(p=>card(p)).join('')||'<p>Пока нет товаров.</p>'}
onAuthStateChanged(auth,u=>{document.querySelectorAll('[data-user]').forEach(el=>el.textContent=u?'Профиль':'Войти');document.querySelectorAll('[data-logout]').forEach(el=>el.onclick=()=>signOut(auth).then(()=>location.href='index.html'))});
if($('#home')) initHome(); if($('#catalogProducts')) initCatalog();
