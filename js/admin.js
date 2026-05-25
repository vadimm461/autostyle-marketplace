import { db, auth, storage } from './firebase.js';
import { collection, getDocs, doc, getDoc, setDoc, addDoc, deleteDoc, serverTimestamp, orderBy, query } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';
const $=s=>document.querySelector(s); let active='settings';
const tabs=['settings','categories','banners','products','features'];
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>show(b.dataset.tab));
function show(t){active=t;tabs.forEach(x=>$('#'+x).classList.toggle('hidden',x!==t));document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===t));loadLists()}
async function upload(file,path){if(!file)return '';const r=ref(storage,path+'/'+Date.now()+'-'+file.name);await uploadBytes(r,file);return await getDownloadURL(r)}
onAuthStateChanged(auth,async u=>{if(!u){location.href='login.html';return} const us=await getDoc(doc(db,'users',u.uid)); if(!us.exists()||us.data().role!=='admin'){alert('Нужны права администратора. В Firestore users -> ваш uid -> role: admin'); location.href='index.html'; return} init();});
async function init(){const s=await getDoc(doc(db,'site','settings')); if(s.exists()){const d=s.data(); for(const k in d){if($('#set_'+k))$('#set_'+k).value=d[k]}} loadLists()}
$('#logout').onclick=()=>signOut(auth);
$('#settingsForm').onsubmit=async e=>{e.preventDefault();const f=e.target;let heroImage=f.heroImage.value;if(f.heroFile.files[0])heroImage=await upload(f.heroFile.files[0],'site');await setDoc(doc(db,'site','settings'),{brand:f.brand.value,phone:f.phone.value,slogan:f.slogan.value,heroTitle:f.heroTitle.value,heroText:f.heroText.value,heroImage},{merge:true});alert('Главная обновлена')};
$('#catForm').onsubmit=async e=>{e.preventDefault();await addDoc(collection(db,'categories'),{title:e.target.title.value,icon:e.target.icon.value,createdAt:serverTimestamp()});e.target.reset();loadLists()};
$('#bannerForm').onsubmit=async e=>{e.preventDefault();const f=e.target;let imageUrl=f.imageUrl.value;if(f.file.files[0])imageUrl=await upload(f.file.files[0],'banners');await addDoc(collection(db,'banners'),{title:f.title.value,text:f.text.value,link:f.link.value,type:f.type.value,imageUrl,createdAt:serverTimestamp()});f.reset();loadLists()};
$('#productForm').onsubmit=async e=>{e.preventDefault();const f=e.target;let imageUrl=f.imageUrl.value;if(f.file.files[0])imageUrl=await upload(f.file.files[0],'products');await addDoc(collection(db,'products'),{title:f.title.value,price:Number(f.price.value),oldPrice:Number(f.oldPrice.value||0),category:f.category.value,description:f.description.value,imageUrl,inStock:f.inStock.checked,createdAt:serverTimestamp()});f.reset();loadLists()};
$('#featureForm').onsubmit=async e=>{e.preventDefault();await addDoc(collection(db,'features'),{title:e.target.title.value,text:e.target.text.value,createdAt:serverTimestamp()});e.target.reset();loadLists()};
async function list(name){try{return (await getDocs(query(collection(db,name),orderBy('createdAt','desc')))).docs.map(d=>({id:d.id,...d.data()}))}catch(e){return []}}
async function del(name,id){if(confirm('Удалить?')){await deleteDoc(doc(db,name,id));loadLists()}}
window.del=del;
async function loadLists(){
 const cats=await list('categories');$('#catList').innerHTML=cats.map(i=>item('categories',i,i.title,i.icon||'')).join('');
 const banners=await list('banners');$('#bannerList').innerHTML=banners.map(i=>item('banners',i,i.title,i.text,i.imageUrl)).join('');
 const prods=await list('products');$('#productList').innerHTML=prods.map(i=>item('products',i,i.title,(i.price||0)+' ₸',i.imageUrl)).join('');
 const fs=await list('features');$('#featureList').innerHTML=fs.map(i=>item('features',i,i.title,i.text)).join('');
}
function item(col,i,title,sub,img=''){return `<div class="listItem">${img?`<img src="${img}">`:''}<div><b>${title}</b><br><span>${sub||''}</span></div><button class="btn danger" onclick="del('${col}','${i.id}')">Удалить</button></div>`}
show('settings');
