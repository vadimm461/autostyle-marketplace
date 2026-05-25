import { auth, db, storage } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { collection, addDoc, getDocs, doc, getDoc, deleteDoc, updateDoc, serverTimestamp, orderBy, query } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';
const fmt = new Intl.NumberFormat('ru-RU');
const gate=document.querySelector('#adminGate'), form=document.querySelector('#productForm'), table=document.querySelector('#productsTable'), msg=document.querySelector('#msg');
let editId=null;
function show(t){ if(msg) msg.textContent=t; }
onAuthStateChanged(auth, async user=>{
 if(!user){ location.href='login.html'; return; }
 const snap=await getDoc(doc(db,'users',user.uid));
 const role=snap.exists()?snap.data().role:'user';
 if(role!=='admin'){ gate.innerHTML='<div class="notice">Нет доступа. Твой аккаунт не администратор.</div>'; return; }
 gate.classList.remove('hidden'); loadProducts();
});
async function upload(file){ if(!file) return ''; const r=ref(storage,`products/${Date.now()}-${file.name}`); await uploadBytes(r,file); return await getDownloadURL(r); }
form?.addEventListener('submit',async e=>{
 e.preventDefault(); show('Сохраняю...');
 const file=form.image.files[0]; const img=await upload(file);
 const data={title:form.title.value,price:Number(form.price.value),category:form.category.value,description:form.description.value,inStock:form.inStock.checked,updatedAt:serverTimestamp()};
 if(img) data.imageUrl=img;
 if(editId){ await updateDoc(doc(db,'products',editId),data); editId=null; form.querySelector('button[type=submit]').textContent='Добавить товар'; }
 else{ data.createdAt=serverTimestamp(); await addDoc(collection(db,'products'),data); }
 form.reset(); show('Готово.'); loadProducts();
});
async function loadProducts(){
 const snap=await getDocs(query(collection(db,'products'),orderBy('createdAt','desc')));
 table.innerHTML=snap.docs.map(d=>{const p=d.data();return `<tr><td><img class="mini" src="${p.imageUrl||'assets/placeholder.svg'}"></td><td>${p.title||''}<br><span class="muted">${p.category||''}</span></td><td>${fmt.format(Number(p.price||0))} ₽</td><td>${p.inStock?'В наличии':'Нет'}</td><td><button class="btn dark" data-edit="${d.id}">Изм.</button> <button class="btn dark" data-del="${d.id}">Удал.</button></td></tr>`}).join('') || '<tr><td colspan="5">Пока нет товаров</td></tr>';
 document.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{ if(confirm('Удалить товар?')){await deleteDoc(doc(db,'products',b.dataset.del));loadProducts();}});
 document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=async()=>{ const s=await getDoc(doc(db,'products',b.dataset.edit)); const p=s.data(); editId=b.dataset.edit; form.title.value=p.title||''; form.price.value=p.price||''; form.category.value=p.category||''; form.description.value=p.description||''; form.inStock.checked=!!p.inStock; form.querySelector('button[type=submit]').textContent='Сохранить изменения'; scrollTo({top:0,behavior:'smooth'}); });
}
