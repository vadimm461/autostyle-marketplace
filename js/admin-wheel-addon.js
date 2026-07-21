
import {db} from './firebase.js';
import {collection,getDocs,getDoc,doc,setDoc,query,orderBy,limit} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

let catalog=[], selected=[];
const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function inject(){
  const nav=document.querySelector('.admin-nav');const main=document.querySelector('.admin-main');
  if(!nav||!main||document.getElementById('wheelAdminNav'))return;
  const btn=document.createElement('button');btn.id='wheelAdminNav';btn.dataset.section='wheel';btn.textContent='Колесо фортуны';
  nav.insertBefore(btn,nav.querySelector('.admin-link-btn'));
  const section=document.createElement('section');section.id='wheel';section.className='admin-section';
  section.innerHTML=`
    <div class="section-head"><div><h2>Колесо фортуны</h2><p>Товары, шансы, расписание игры и срок получения приза.</p></div><button id="wheelSave" class="primary" type="button">Сохранить</button></div>
    <div class="wheel-admin-grid">
      <div class="wheel-admin-card">
        <h3>Настройки игры</h3>
        <label class="field">Колесо включено <input id="wheelEnabled" type="checkbox"></label>
        <label class="field">Интервал между играми, часов <input id="wheelInterval" type="number" min="1" value="48"></label>
        <label class="field">Забрать приз в течение, часов <input id="wheelClaimHours" type="number" min="1" value="48"></label>
        <p id="wheelChanceTotal" class="muted"></p>
        <h3>Добавить товар</h3>
        <div class="wheel-product-picker"><input id="wheelProductSearch" placeholder="Название или код товара"><div id="wheelPickerResults" class="wheel-picker-results" hidden></div></div>
      </div>
      <div class="wheel-admin-card"><h3>Товары на колесе</h3><div id="wheelSelectedProducts" class="wheel-admin-products"></div></div>
    </div>
    <div class="wheel-admin-card" style="margin-top:20px"><h3>Последние выигрыши</h3><div style="overflow:auto"><table class="wheel-winner-table"><thead><tr><th>Пользователь</th><th>Товар</th><th>Штрихкод</th><th>Статус</th></tr></thead><tbody id="wheelWinners"></tbody></table></div></div>`;
  main.appendChild(section);
  btn.addEventListener('click',()=>openSection());
  document.querySelectorAll('.admin-tree-list').forEach(()=>{});
  document.getElementById('wheelSave').addEventListener('click',save);
  document.getElementById('wheelProductSearch').addEventListener('input',renderPicker);
  load();
}
function openSection(){
  document.querySelectorAll('.admin-nav [data-section]').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.admin-section').forEach(x=>x.classList.remove('active'));
  document.getElementById('wheelAdminNav').classList.add('active');
  document.getElementById('wheel').classList.add('active');location.hash='wheel';
}
async function load(){
  const [products,cfg,winners]=await Promise.all([
    getDocs(collection(db,'autostyle_products')),
    getDoc(doc(db,'autostyle_wheel_config','main')),
    getDocs(query(collection(db,'autostyle_wheel_prizes'),orderBy('createdAt','desc'),limit(50)))
  ]);
  catalog=products.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'ru'));
  const c=cfg.exists()?cfg.data():{};
  selected=Array.isArray(c.products)?c.products:[];
  wheelEnabled.checked=c.enabled===true;wheelInterval.value=c.intervalHours||48;wheelClaimHours.value=c.claimHours||48;
  renderSelected();renderWinners(winners.docs.map(d=>({id:d.id,...d.data()})));
  if(location.hash==='#wheel')openSection();
}
function image(p){return p.image||p.imageURL||p.imageUrl||p.photo||''}
function code(p){return p.code||p.productCode||p.article||p.sku||''}
function renderPicker(){
  const q=wheelProductSearch.value.trim().toLowerCase(),box=wheelPickerResults;
  if(!q){box.hidden=true;return}
  const rows=catalog.filter(p=>`${p.name||''} ${code(p)}`.toLowerCase().includes(q)).slice(0,30);
  box.innerHTML=rows.map(p=>`<button class="wheel-picker-item" type="button" data-id="${p.id}"><img src="${esc(image(p)||'assets/as-logo-192.png')}"><span><b>${esc(p.name||'Товар')}</b><br><small>Код: ${esc(code(p))} · Остаток: ${Number(p.stock??p.quantity??0)}</small></span></button>`).join('');
  box.hidden=false;
  box.querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>{const p=catalog.find(x=>x.id===b.dataset.id);if(!selected.some(x=>x.productId===p.id))selected.push({productId:p.id,name:p.name||'Товар',image:image(p),code:code(p),chance:0,enabled:true});wheelProductSearch.value='';box.hidden=true;renderSelected()});
}
function renderSelected(){
  wheelSelectedProducts.innerHTML=selected.map((p,i)=>`<div class="wheel-admin-product" data-i="${i}"><img src="${esc(p.image||'assets/as-logo-192.png')}"><div><b>${esc(p.name)}</b><br><small>${esc(p.code||'')}</small></div><input class="wheel-chance" type="number" min="0" max="100" step="0.1" value="${Number(p.chance||0)}" title="Вероятность %"><button class="wheel-admin-remove" type="button">×</button></div>`).join('')||'<div class="muted">Товары пока не добавлены.</div>';
  wheelSelectedProducts.querySelectorAll('.wheel-admin-product').forEach(row=>{
    const i=Number(row.dataset.i);row.querySelector('.wheel-chance').oninput=e=>{selected[i].chance=Math.max(0,Math.min(100,Number(e.target.value||0)));updateTotal()};
    row.querySelector('.wheel-admin-remove').onclick=()=>{selected.splice(i,1);renderSelected()};
  });updateTotal();
}
function updateTotal(){const sum=selected.reduce((s,p)=>s+Number(p.chance||0),0);wheelChanceTotal.textContent=`Сумма вероятностей: ${sum.toFixed(1)}%. Остаток до 100% — вариант без выигрыша.`;wheelChanceTotal.style.color=sum>100?'#dc2626':''}
async function save(){
  const sum=selected.reduce((s,p)=>s+Number(p.chance||0),0);if(sum>100)return alert('Сумма вероятностей не может быть больше 100%.');
  wheelSave.disabled=true;wheelSave.textContent='Сохранение…';
  try{await setDoc(doc(db,'autostyle_wheel_config','main'),{enabled:wheelEnabled.checked,intervalHours:Number(wheelInterval.value||48),claimHours:Number(wheelClaimHours.value||48),products:selected,updatedAt:new Date().toISOString()},{merge:true});alert('Колесо сохранено.')}
  catch(e){alert('Ошибка: '+(e.message||e))}
  finally{wheelSave.disabled=false;wheelSave.textContent='Сохранить'}
}
function renderWinners(items){wheelWinners.innerHTML=items.map(p=>`<tr><td>${esc(p.userEmail||p.userId)}</td><td>${esc(p.productName)}</td><td><b>${esc(p.barcode)}</b></td><td>${esc(p.status||'active')}</td></tr>`).join('')||'<tr><td colspan="4">Выигрышей пока нет.</td></tr>'}
inject();
