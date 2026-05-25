import { auth, db } from './firebase.js';
import { onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { collection, doc, setDoc, getDoc, getDocs, addDoc, deleteDoc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const money = n => `${Number(n || 0).toLocaleString('ru-RU')} ₽`;
let currentUser=null, currentRole='user', products=[], categories=[], banners=[];

function defaultData(){
  categories = categories.length ? categories : ['Автохимия','Масла','Аксессуары','Инструменты','Автосвет','Фильтры','Ароматизаторы'].map((name,i)=>({id:'local'+i,name}));
  banners = banners.length ? banners : [
    {title:'Автотовары нового уровня',subtitle:'Минималистичный маркетплейс AUTO STYLE',tag:'AUTO STYLE',link:'#products'},
    {title:'Химия, масла и аксессуары',subtitle:'Добавляйте баннеры и акции из админки',tag:'АКЦИИ',link:'#products'},
    {title:'Всё для ухода за авто',subtitle:'Каталог, товары, категории — всё управляется вами',tag:'SHOP',link:'#products'}
  ];
}
async function loadPublic(){
  try{ categories=(await getDocs(collection(db,'categories'))).docs.map(d=>({id:d.id,...d.data()})); }catch(e){}
  try{ banners=(await getDocs(collection(db,'banners'))).docs.map(d=>({id:d.id,...d.data()})); }catch(e){}
  try{ products=(await getDocs(collection(db,'products'))).docs.map(d=>({id:d.id,...d.data()})); }catch(e){}
  defaultData(); renderAll();
}
function renderAll(){ renderCategories(); renderBanners(); renderProducts(); }
function renderCategories(){
  const list=$('#categoryList'), tabs=$('#categoryTabs'); if(!list||!tabs) return;
  list.innerHTML=categories.map(c=>`<button class="catItem" data-cat="${c.name}"><span>${c.name}</span><b>›</b></button>`).join('') || '<div class="empty">Категории появятся после добавления.</div>';
  tabs.innerHTML='<button class="tab active" data-cat="all">ТОП товары</button>'+categories.map(c=>`<button class="tab" data-cat="${c.name}">${c.name}</button>`).join('');
  $$('.tab,.catItem').forEach(b=>b.onclick=()=>filterProducts(b.dataset.cat));
}
function renderBanners(){
  const hero=$('#heroSlides'); if(!hero) return;
  hero.innerHTML=banners.map((b,i)=>`<article class="slide ${i?'':'active'}"><small>${b.tag||'AUTO STYLE'}</small><h1>${b.title||'Главный баннер'}</h1><p>${b.subtitle||''}</p><a class="primary" href="${b.link||'#products'}" style="width:max-content;margin-top:18px">Смотреть</a></article>`).join('');
  $('#heroDots').innerHTML=banners.map((_,i)=>`<button class="dot ${i?'':'active'}" data-i="${i}"></button>`).join('');
  let idx=0; const show=i=>{$$('.slide').forEach((s,k)=>s.classList.toggle('active',k===i));$$('.dot').forEach((d,k)=>d.classList.toggle('active',k===i));idx=i};
  $$('.dot').forEach(d=>d.onclick=()=>show(+d.dataset.i)); setInterval(()=>show((idx+1)%banners.length),5000);
}
function productCard(p){return `<article class="product"><div class="badge">${p.category||'AUTO'}</div><div class="pic">${p.imageUrl?`<img src="${p.imageUrl}" alt="">`:'<span class="muted">Фото товара</span>'}</div><h3>${p.title||p.name||'Товар'}</h3><p class="meta">${p.description||'В наличии'}</p><div class="priceRow"><div class="price">${money(p.price)}</div><button class="addCart" data-add="${p.id}">+</button></div></article>`}
function renderProducts(list=products){ const grid=$('#productGrid'); if(!grid) return; grid.innerHTML=list.length?list.map(productCard).join(''):'<div class="empty">Товары пока не добавлены. Добавьте товары через админку.</div>'; }
function filterProducts(cat){ $$('.tab').forEach(t=>t.classList.toggle('active',t.dataset.cat===cat)); renderProducts(cat==='all'?products:products.filter(p=>(p.category||p.group)===cat)); }
function bindUI(){
  $('#accountBtn')?.addEventListener('click',()=> currentUser ? $('#accountMenu').classList.toggle('open') : openAuth());
  $('#loginOpen')?.addEventListener('click',openAuth); $('#authClose')?.addEventListener('click',()=>$('#authModal').classList.remove('open'));
  $$('.authTab').forEach(b=>b.onclick=()=>{ $$('.authTab').forEach(x=>x.classList.remove('active')); b.classList.add('active'); $('#loginForm').style.display=b.dataset.tab==='login'?'grid':'none'; $('#registerForm').style.display=b.dataset.tab==='register'?'grid':'none'; });
  $('#logoutBtn')?.addEventListener('click',()=>signOut(auth));
  $('#searchInput')?.addEventListener('input',e=>{const q=e.target.value.toLowerCase(); renderProducts(products.filter(p=>(p.title||p.name||'').toLowerCase().includes(q))) });
}
function openAuth(){ $('#authModal')?.classList.add('open'); }
async function handleAuth(){
  $('#registerForm')?.addEventListener('submit',async e=>{e.preventDefault(); const name=$('#regName').value.trim(), email=$('#regEmail').value.trim(), pass=$('#regPassword').value; try{const r=await createUserWithEmailAndPassword(auth,email,pass); await setDoc(doc(db,'users',r.user.uid),{name,email,role:'user',createdAt:new Date().toISOString()}); await sendEmailVerification(r.user); $('#authMsg').textContent='Аккаунт создан. Проверьте почту для подтверждения.';}catch(err){$('#authMsg').textContent='Ошибка: '+err.message}});
  $('#loginForm')?.addEventListener('submit',async e=>{e.preventDefault(); const email=$('#loginEmail').value.trim(), pass=$('#loginPassword').value; try{const r=await signInWithEmailAndPassword(auth,email,pass); if(!r.user.emailVerified){$('#authMsg').textContent='Подтвердите email. Письмо отправлено на почту.'; await sendEmailVerification(r.user); return;} $('#authModal').classList.remove('open');}catch(err){$('#authMsg').textContent='Ошибка: '+err.message}});
}
onAuthStateChanged(auth, async user=>{ currentUser=user; const btn=$('#accountBtn'), email=$('#userEmail'), admin=$('#adminLink'); if(user){ let snap; try{snap=await getDoc(doc(db,'users',user.uid)); currentRole=snap.exists()?snap.data().role:'user'}catch(e){} btn.innerHTML='Аккаунт'; email.textContent=user.email; if(admin) admin.style.display=currentRole==='admin'?'block':'none'; }else{ btn.innerHTML='Войти'; if(admin)admin.style.display='none'; }});

bindUI(); handleAuth(); loadPublic();
