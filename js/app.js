import { db, COLLECTIONS } from './firebase.js';
import { collection, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { initMobileUi, setupSearch, productCard, bindCartButtons, productStock } from './common.js';

const grid=document.querySelector('#productsGrid');
const tabs=[...document.querySelectorAll('.product-tab')];
let products=[];

async function load(){
  initMobileUi(); setupSearch();
  if(!grid)return;
  const snap=await getDocs(collection(db,COLLECTIONS.products));
  products=snap.docs.map(d=>({id:d.id,...d.data()}));
  render(document.querySelector('.product-tab.active')?.dataset.filter||'hot');
}
function render(filter='hot'){
  const list=products.filter(p=>productStock(p)>0).filter(p=>p.showOnHome===true||p.tag===filter||p.label===filter).slice(0,24);
  grid.innerHTML=list.length?list.map(p=>productCard(p,'home')).join(''):'<div class="notice">Товары не найдены.</div>';
  bindCartButtons();
}
tabs.forEach(btn=>btn.onclick=()=>{tabs.forEach(x=>x.classList.remove('active'));btn.classList.add('active');render(btn.dataset.filter||'hot');});
load();
