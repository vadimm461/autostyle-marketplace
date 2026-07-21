
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
    <div class="wheel-admin-hero">
      <div>
        <span class="wheel-admin-kicker">Игровой модуль</span>
        <h2>Колесо фортуны</h2>
        <p>Управление товарами, шансами, расписанием и сроком получения призов.</p>
      </div>
      <button id="wheelSave" class="wheel-admin-save" type="button">
        <span>Сохранить настройки</span>
      </button>
    </div>

    <div class="wheel-admin-summary">
      <div class="wheel-summary-card">
        <span>Статус</span>
        <b id="wheelSummaryStatus">Выключено</b>
      </div>
      <div class="wheel-summary-card">
        <span>Товаров</span>
        <b id="wheelSummaryProducts">0</b>
      </div>
      <div class="wheel-summary-card">
        <span>Общий шанс</span>
        <b id="wheelSummaryChance">0%</b>
      </div>
      <div class="wheel-summary-card">
        <span>Без выигрыша</span>
        <b id="wheelSummaryEmpty">100%</b>
      </div>
    </div>

    <div class="wheel-admin-grid">
      <div class="wheel-admin-card wheel-settings-card">
        <div class="wheel-card-head">
          <div>
            <span class="wheel-card-eyebrow">Основные параметры</span>
            <h3>Настройки игры</h3>
          </div>
        </div>

        <label class="wheel-switch-row">
          <span>
            <b>Колесо включено</b>
            <small>Пользователи смогут запускать игру по расписанию</small>
          </span>
          <input id="wheelEnabled" type="checkbox">
          <i aria-hidden="true"></i>
        </label>

        <div class="wheel-settings-fields">
          <label class="wheel-field">
            <span>Интервал между играми</span>
            <div><input id="wheelInterval" type="number" min="1" value="48"><em>час.</em></div>
            <small>48 часов — один раз в два дня</small>
          </label>

          <label class="wheel-field">
            <span>Срок получения приза</span>
            <div><input id="wheelClaimHours" type="number" min="1" value="48"><em>час.</em></div>
            <small>После этого штрихкод станет недействительным</small>
          </label>
        </div>

        <div class="wheel-chance-box">
          <div class="wheel-chance-head">
            <span>Распределение вероятностей</span>
            <b id="wheelChanceTotalValue">0%</b>
          </div>
          <div class="wheel-chance-track"><i id="wheelChanceBar"></i></div>
          <p id="wheelChanceTotal" class="muted"></p>
        </div>

        <div class="wheel-add-block">
          <div class="wheel-card-head">
            <div>
              <span class="wheel-card-eyebrow">Каталог сайта</span>
              <h3>Добавить товар</h3>
            </div>
          </div>
          <div class="wheel-product-picker">
            <input id="wheelProductSearch" placeholder="Начните вводить название или код товара">
            <div id="wheelPickerResults" class="wheel-picker-results" hidden></div>
          </div>
        </div>
      </div>

      <div class="wheel-admin-card wheel-products-card">
        <div class="wheel-card-head">
          <div>
            <span class="wheel-card-eyebrow">Состав колеса</span>
            <h3>Товары на колесе</h3>
          </div>
          <span id="wheelProductsBadge" class="wheel-count-badge">0 товаров</span>
        </div>
        <div class="wheel-products-note">Укажите внутреннюю вероятность выигрыша для каждого товара. Посетители сайта её не увидят.</div>
        <div id="wheelSelectedProducts" class="wheel-admin-products"></div>
      </div>
    </div>

    <div class="wheel-admin-card wheel-winners-card">
      <div class="wheel-card-head">
        <div>
          <span class="wheel-card-eyebrow">История</span>
          <h3>Последние выигрыши</h3>
        </div>
      </div>
      <div class="wheel-table-wrap">
        <table class="wheel-winner-table">
          <thead><tr><th>Пользователь</th><th>Товар</th><th>Штрихкод</th><th>Статус</th></tr></thead>
          <tbody id="wheelWinners"></tbody>
        </table>
      </div>
    </div>`;
  main.appendChild(section);
  btn.addEventListener('click',()=>openSection());
  document.querySelectorAll('.admin-tree-list').forEach(()=>{});
  document.getElementById('wheelSave').addEventListener('click',save);
  document.getElementById('wheelProductSearch').addEventListener('input',renderPicker);
  document.getElementById('wheelEnabled').addEventListener('change',updateTotal);
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
  wheelSelectedProducts.innerHTML=selected.map((p,i)=>`
    <div class="wheel-admin-product" data-i="${i}">
      <div class="wheel-product-image"><img src="${esc(p.image||'assets/as-logo-192.png')}" alt=""></div>
      <div class="wheel-product-copy">
        <b>${esc(p.name)}</b>
        <small>Код: ${esc(p.code||'—')}</small>
      </div>
      <label class="wheel-chance-input">
        <span>Шанс</span>
        <div><input class="wheel-chance" type="number" min="0" max="100" step="0.1" value="${Number(p.chance||0)}"><em>%</em></div>
      </label>
      <button class="wheel-admin-remove" type="button" title="Удалить товар">×</button>
    </div>`).join('')||`
      <div class="wheel-products-empty">
        <div>🎁</div>
        <b>Товары пока не добавлены</b>
        <span>Найдите товар в каталоге слева и добавьте его на колесо.</span>
      </div>`;

  wheelSelectedProducts.querySelectorAll('.wheel-admin-product').forEach(row=>{
    const i=Number(row.dataset.i);
    row.querySelector('.wheel-chance').oninput=e=>{
      selected[i].chance=Math.max(0,Math.min(100,Number(e.target.value||0)));
      updateTotal();
    };
    row.querySelector('.wheel-admin-remove').onclick=()=>{
      selected.splice(i,1);
      renderSelected();
    };
  });
  updateTotal();
}
function updateTotal(){
  const sum=selected.reduce((s,p)=>s+Number(p.chance||0),0);
  const empty=Math.max(0,100-sum);
  const safe=Math.min(sum,100);

  wheelChanceTotal.textContent=sum>100
    ? `Превышение на ${(sum-100).toFixed(1)}%. Уменьшите вероятность товаров.`
    : `Шанс без выигрыша: ${empty.toFixed(1)}%.`;
  wheelChanceTotal.style.color=sum>100?'#dc2626':'';

  if(document.getElementById('wheelChanceTotalValue')){
    wheelChanceTotalValue.textContent=`${sum.toFixed(1)}%`;
  }
  if(document.getElementById('wheelChanceBar')){
    wheelChanceBar.style.width=`${safe}%`;
    wheelChanceBar.classList.toggle('is-over',sum>100);
  }
  if(document.getElementById('wheelSummaryProducts')){
    wheelSummaryProducts.textContent=String(selected.length);
    wheelSummaryChance.textContent=`${sum.toFixed(1)}%`;
    wheelSummaryEmpty.textContent=`${empty.toFixed(1)}%`;
    wheelSummaryStatus.textContent=wheelEnabled?.checked?'Включено':'Выключено';
    wheelSummaryStatus.classList.toggle('is-on',wheelEnabled?.checked);
  }
  if(document.getElementById('wheelProductsBadge')){
    const count=selected.length;
    wheelProductsBadge.textContent=`${count} ${count===1?'товар':'товаров'}`;
  }
}
async function save(){
  const sum=selected.reduce((s,p)=>s+Number(p.chance||0),0);if(sum>100)return alert('Сумма вероятностей не может быть больше 100%.');
  wheelSave.disabled=true;wheelSave.textContent='Сохранение…';
  try{await setDoc(doc(db,'autostyle_wheel_config','main'),{enabled:wheelEnabled.checked,intervalHours:Number(wheelInterval.value||48),claimHours:Number(wheelClaimHours.value||48),products:selected,updatedAt:new Date().toISOString()},{merge:true});alert('Колесо сохранено.')}
  catch(e){alert('Ошибка: '+(e.message||e))}
  finally{wheelSave.disabled=false;wheelSave.textContent='Сохранить'}
}
function renderWinners(items){
  const statusLabel=status=>{
    if(status==='redeemed')return '<span class="wheel-status-pill is-done">Выдан</span>';
    if(status==='expired')return '<span class="wheel-status-pill is-expired">Просрочен</span>';
    return '<span class="wheel-status-pill is-active">Ожидает выдачи</span>';
  };
  wheelWinners.innerHTML=items.map(p=>`
    <tr>
      <td><b>${esc(p.userEmail||p.userId)}</b></td>
      <td>${esc(p.productName)}</td>
      <td><code>${esc(p.barcode)}</code></td>
      <td>${statusLabel(p.status||'active')}</td>
    </tr>`).join('')||`
      <tr><td colspan="4"><div class="wheel-table-empty">Выигрышей пока нет.</div></td></tr>`;
}
inject();
