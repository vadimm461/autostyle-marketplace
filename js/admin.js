
import { auth, db } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { collection, addDoc, deleteDoc, doc, onSnapshot, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
const $=s=>document.querySelector(s);
async function isAdmin(user){const s=await getDoc(doc(db,'users',user.uid)); return s.exists()&&s.data().role==='admin';}
onAuthStateChanged(auth, async user=>{
  if(!user){$('#adminGuard').textContent='Войдите в аккаунт администратора.'; return}
  if(!(await isAdmin(user))){$('#adminGuard').textContent='Нет доступа. В Firestore → users → ваш UID поставьте role: admin'; return}
  $('#adminGuard').classList.add('hidden'); $('#adminPanel').classList.remove('hidden'); initAdmin();
});
function item(title,id,coll){return `<div class="admin-item"><span>${title}</span><button class="danger" data-del="${id}" data-coll="${coll}">Удалить</button></div>`}
function bindDelete(){document.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>deleteDoc(doc(db,b.dataset.coll,b.dataset.del)));}
function initAdmin(){
  $('#categoryForm').onsubmit=async e=>{e.preventDefault();await addDoc(collection(db,'categories'),{name:$('#catName').value,icon:$('#catIcon').value});e.target.reset();}
  $('#bannerForm').onsubmit=async e=>{e.preventDefault();await addDoc(collection(db,'banners'),{title:$('#bannerTitle').value,text:$('#bannerText').value,image:$('#bannerImage').value,link:$('#bannerLink').value});e.target.reset();}
  $('#productForm').onsubmit=async e=>{e.preventDefault();await addDoc(collection(db,'products'),{name:$('#pName').value,price:Number($('#pPrice').value),oldPrice:Number($('#pOldPrice').value||0),category:$('#pCategory').value,image:$('#pImage').value,description:$('#pDescription').value});e.target.reset();}
  onSnapshot(collection(db,'categories'),s=>{$('#adminCategories').innerHTML=s.docs.map(d=>item(d.data().name,d.id,'categories')).join('');bindDelete();});
  onSnapshot(collection(db,'banners'),s=>{$('#adminBanners').innerHTML=s.docs.map(d=>item(d.data().title,d.id,'banners')).join('');bindDelete();});
  onSnapshot(collection(db,'products'),s=>{$('#adminProducts').innerHTML=s.docs.map(d=>item(d.data().name,d.id,'products')).join('');bindDelete();});
}
