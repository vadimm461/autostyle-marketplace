import { db, COLLECTIONS } from './firebase.js';
import { collection, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { initMobileUi, setupSearch, productCard, bindCartButtons, productStock, productTitle } from './common.js';

const grid=document.querySelector('#catalogGrid');
const search=document.querySelector('#search');
const cat=document.querySelector('#category');
const sort=document.querySelector('#sort');
const count=document.querySelector('#catalogCount');
const zeroNotice=document.querySelector('#zeroNotice');

let products=[], categories=[], showZero=false;

function catTitle(c){return c.title||c.name||c.category||'Без названия';}

async function load(){
  initMobileUi(); setupSearch();
  const ps=await getDocs(collection(db,COLLECTIONS.products));
  products=ps.docs.map(d=>({id:d.id,...d.data()}));
  try{
    const cs=await getDocs(collection(db,COLLECTIONS.categories));
    categories=cs.docs.map(d=>({id:d.id,...d.data()}));
  }catch(e){categories=[]}
  const fromProducts=[...new Set(products.map(p=>p.category).filter(Boolean))].map(x=>({title:x}));
  const map=new Map();
  [...categories,...fromProducts].forEach(c=>map.set(catTitle(c).toLowerCase(),c));
  categories=[...map.values()].sort((a,b)=>catTitle(a).localeCompare(catTitle(b),'ru'));
  if(cat)cat.innerHTML='<option value="">Все категории</option>'+categories.map(c=>`<option value="${catTitle(c)}">${catTitle(c)}</option>`).join('');
  const params=new URLSearchParams(location.search);
  if(params.get('search')) search.value=params.get('search');
  if(params.get('category')) cat.value=params.get('category');
  render();
}
function render(){
  const q=(search?.value||'').toLowerCase(), c=cat?.value||'';
  let list=products.filter(p=>{
    const t=`${p.code||''} ${p.article||''} ${productTitle(p)} ${p.description||''} ${p.category||''}`.toLowerCase();
    if(c&&p.category!==c)return false;
    if(q&&!t.includes(q))return false;
    if(!showZero&&productStock(p)<=0)return false;
    return true;
  });
  if(sort?.value==='priceAsc')list.sort((a,b)=>Number(a.price||0)-Number(b.price||0));
  if(sort?.value==='priceDesc')list.sort((a,b)=>Number(b.price||0)-Number(a.price||0));
  if(sort?.value==='nameAsc')list.sort((a,b)=>productTitle(a).localeCompare(productTitle(b),'ru'));
  if(count)count.textContent=`${list.length} товаров`;
  if(zeroNotice)zeroNotice.textContent=showZero?'Показаны все товары':'Товары с нулевым остатком скрыты';
  grid.innerHTML=list.length?list.map(p=>productCard(p,'catalog')).join(''):'<div class="notice">Товары не найдены.</div>';
  bindCartButtons();
}
search?.addEventListener('input',render); cat?.addEventListener('change',render); sort?.addEventListener('change',render);
zeroNotice?.addEventListener('click',()=>{if(!showZero){if(confirm('Показать все товары, включая товары с нулевым остатком?')){showZero=true;render();}}else{showZero=false;render();}});
load();
