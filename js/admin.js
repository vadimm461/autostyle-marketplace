import { auth, db } from './firebase.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { collection, doc, getDoc, getDocs, addDoc, deleteDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
const $=s=>document.querySelector(s);
function item(title, col, id){return `<div class="listItem"><b>${title}</b><button class="danger" data-col="${col}" data-id="${id}">Удалить</button></div>`}
async function loadAdmin(){
 const ps=(await getDocs(collection(db,'products'))).docs.map(d=>({id:d.id,...d.data()}));
 const cs=(await getDocs(collection(db,'categories'))).docs.map(d=>({id:d.id,...d.data()}));
 const bs=(await getDocs(collection(db,'banners'))).docs.map(d=>({id:d.id,...d.data()}));
 $('#adminProducts').innerHTML=ps.map(p=>item(p.title||p.name,'products',p.id)).join('')||'<p class="muted">Нет товаров</p>';
 $('#adminCategories').innerHTML=cs.map(c=>item(c.name,'categories',c.id)).join('')||'<p class="muted">Нет категорий</p>';
 $('#adminBanners').innerHTML=bs.map(b=>item(b.title,'banners',b.id)).join('')||'<p class="muted">Нет баннеров</p>';
 document.querySelectorAll('.danger').forEach(b=>b.onclick=async()=>{await deleteDoc(doc(db,b.dataset.col,b.dataset.id));loadAdmin()});
}
onAuthStateChanged(auth,async user=>{ if(!user){location.href='index.html';return} const snap=await getDoc(doc(db,'users',user.uid)); if(!snap.exists()||snap.data().role!=='admin'){$('#adminAccess').style.display='block';return} $('#adminPanel').style.display='grid'; loadAdmin(); });
$('#logoutAdmin').onclick=()=>signOut(auth).then(()=>location.href='index.html');
$('#productForm').onsubmit=async e=>{e.preventDefault(); await addDoc(collection(db,'products'),{title:$('#pTitle').value,price:+$('#pPrice').value,category:$('#pCategory').value,imageUrl:$('#pImage').value,description:$('#pDesc').value,createdAt:serverTimestamp()}); e.target.reset(); loadAdmin()};
$('#categoryForm').onsubmit=async e=>{e.preventDefault(); if($('#cName').value) await addDoc(collection(db,'categories'),{name:$('#cName').value}); e.target.reset(); loadAdmin()};
$('#bannerForm').onsubmit=async e=>{e.preventDefault(); await addDoc(collection(db,'banners'),{tag:$('#bTag').value,title:$('#bTitle').value,subtitle:$('#bSubtitle').value,link:$('#bLink').value||'#products'}); e.target.reset(); loadAdmin()};
