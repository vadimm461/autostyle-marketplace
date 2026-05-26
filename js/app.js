import { auth, db, COLLECTIONS } from './firebase.js';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, sendEmailVerification } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { collection, getDocs, addDoc, setDoc, doc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
let cart = JSON.parse(localStorage.getItem('cart') || '[]');

function money(v){ return `${Number(v||0).toLocaleString('ru-RU')} ₽`; }
function saveCart(){ localStorage.setItem('cart', JSON.stringify(cart)); $('#cartCount') && ($('#cartCount').textContent = cart.length); }
async function loadCollection(name){ const snap = await getDocs(collection(db, name)); return snap.docs.map(d=>({id:d.id,...d.data()})); }

async function renderHome(){
  const cats = await loadCollection(COLLECTIONS.categories);
  const products = await loadCollection(COLLECTIONS.products);
  const banners = await loadCollection(COLLECTIONS.banners);
  const catBox = $('#categories');
  if(catBox) catBox.innerHTML = cats.length ? cats.map(c=>`<div class="cat-item">${c.title||c.name}</div>`).join('') : '<div class="muted">Категории появятся после добавления в админке.</div>';
  const hero = $('#hero');
  if(hero){ const b=banners[0]||{}; hero.innerHTML = `<h1>${b.title||'AUTO STYLE'} <span class="accent">market</span></h1><p>${b.text||'Современный магазин автотоваров и аксессуаров. Добавьте баннеры в админке.'}</p><button class="primary">Смотреть каталог</button>`; }
  const bannersBox=$('#banners');
  if(bannersBox) bannersBox.innerHTML = (banners.slice(1,4).length?banners.slice(1,4):[{title:'Акции',text:'Добавьте баннеры'},{title:'Новинки',text:'Управление из админки'},{title:'Топ товары',text:'Минималистичный UI'}]).map(b=>`<div class="mini-banner"><h3>${b.title}</h3><p class="muted">${b.text||''}</p></div>`).join('');
  const grid = $('#productsGrid');
  if(grid) grid.innerHTML = products.length ? products.map(p=>`<article class="product-card"><div class="product-img">${p.image?`<img src="${p.image}" alt="">`:'Фото'}</div><div class="product-title">${p.title||p.name}</div><div class="muted">${p.category||''}</div><div class="price">${money(p.price)}</div><button class="cart" data-id="${p.id}">В корзину</button></article>`).join('') : '<div class="panel muted">Товары появятся после добавления в админке.</div>';
  $$('[data-id]').forEach(btn=>btn.onclick=()=>{cart.push(btn.dataset.id);saveCart();});
  saveCart();
}

function authModal(){
  const modal = $('#authModal'); if(!modal) return;
  $('#openAuth') && ($('#openAuth').onclick=()=>modal.classList.add('open'));
  $('#closeAuth') && ($('#closeAuth').onclick=()=>modal.classList.remove('open'));
  $$('.tab').forEach(t=>t.onclick=()=>{ $$('.tab').forEach(x=>x.classList.remove('active')); t.classList.add('active'); $('#loginForm').style.display=t.dataset.tab==='login'?'block':'none'; $('#registerForm').style.display=t.dataset.tab==='register'?'block':'none'; });
  $('#loginForm') && ($('#loginForm').onsubmit=async e=>{e.preventDefault(); const email=$('#loginEmail').value.trim(), pass=$('#loginPass').value; await signInWithEmailAndPassword(auth,email,pass); modal.classList.remove('open');});
  $('#registerForm') && ($('#registerForm').onsubmit=async e=>{e.preventDefault(); const name=$('#regName').value.trim(), email=$('#regEmail').value.trim(), pass=$('#regPass').value; const res=await createUserWithEmailAndPassword(auth,email,pass); await setDoc(doc(db,COLLECTIONS.users,res.user.uid),{name,email,role:'user',createdAt:new Date().toISOString()}); await sendEmailVerification(res.user); alert('Аккаунт создан. Проверьте письмо на почте для подтверждения.'); modal.classList.remove('open');});
  onAuthStateChanged(auth,u=>{ const authBtn=$('#openAuth'); const dd=$('#accountDrop'); if(u){ if(authBtn) authBtn.style.display='none'; if(dd){dd.style.display='block'; $('#userEmail').textContent=u.email; $('#logout').onclick=()=>signOut(auth);} } else { if(authBtn) authBtn.style.display='inline-block'; if(dd) dd.style.display='none'; }});
  $('#accountBtn') && ($('#accountBtn').onclick=()=>$('#accountDrop').classList.toggle('open'));
}

authModal();renderHome();
document.querySelectorAll('.product-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.product-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const title = document.querySelector('.section-head h2');

    if (btn.dataset.filter === 'hot') {
      title.textContent = 'Горячие предложения';
    }

    if (btn.dataset.filter === 'new') {
      title.textContent = 'Новинки';
    }

    if (btn.dataset.filter === 'best') {
      title.textContent = 'Лучшая цена';
    }
  });
});
