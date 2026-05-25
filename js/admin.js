import { auth, db } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { collection, addDoc, getDocs, deleteDoc, doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

let active = 'products';
const fields = ['name','price','category','image','subtitle'];
const $ = s => document.querySelector(s);
const list = $('#adminList');
const msg = $('#adminMsg');
const form = $('#itemForm');
const title = $('#formTitle');
const tabs = document.querySelectorAll('.adminNav button');
const show = t => msg.textContent = t || '';

function configure(){
  title.textContent = active==='products'?'Добавить товар':active==='categories'?'Добавить категорию':'Добавить баннер';
  document.getElementById('price').closest('.field').style.display = active==='products'?'block':'none';
  document.getElementById('category').closest('.field').style.display = active==='products'?'block':'none';
  document.getElementById('subtitle').closest('.field').style.display = active==='banners'?'block':'none';
  document.getElementById('image').closest('.field').style.display = active==='products'||active==='banners'?'block':'none';
}
async function load(){
  configure(); list.innerHTML='Загрузка...';
  const snap = await getDocs(collection(db, active));
  if(snap.empty){ list.innerHTML='<p class="muted">Пока пусто</p>'; return; }
  list.innerHTML = snap.docs.map(d=>{const x=d.data();return `<div class="listItem"><div><b>${x.name||x.title||'Без названия'}</b><br><small>${x.category||x.subtitle||''}</small></div><button class="danger" data-id="${d.id}">Удалить</button></div>`}).join('');
  list.querySelectorAll('.danger').forEach(b=>b.onclick=async()=>{await deleteDoc(doc(db,active,b.dataset.id));load();});
}
tabs.forEach(b=>b.onclick=()=>{tabs.forEach(x=>x.classList.remove('active')); b.classList.add('active'); active=b.dataset.tab; form.reset(); load();});
form.addEventListener('submit',async e=>{e.preventDefault(); const data={}; fields.forEach(f=>{const el=document.getElementById(f); if(el && el.value.trim()) data[f]=el.value.trim();}); if(active==='banners'){data.title=data.name; data.label='AUTO STYLE'} if(active==='categories') data.name=data.name||'Категория'; data.createdAt=new Date().toISOString(); await addDoc(collection(db,active),data); show('Сохранено'); form.reset(); load();});

onAuthStateChanged(auth, async user=>{
  if(!user){ $('#adminContent').classList.add('hide'); $('#noAccess').classList.remove('hide'); return; }
  const s = await getDoc(doc(db,'users',user.uid));
  if(!s.exists() || s.data().role !== 'admin'){ $('#adminContent').classList.add('hide'); $('#noAccess').classList.remove('hide'); return; }
  load();
});
