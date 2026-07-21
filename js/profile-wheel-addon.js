
import { auth, db } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  doc,getDoc,collection,query,where,getDocs,
  runTransaction,serverTimestamp,Timestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const CONFIG_REF = doc(db,'autostyle_wheel_config','main');
const stateRef = uid => doc(db,'autostyle_wheel_state',uid);
let currentUser=null, currentConfig=null, rotation=0, spinning=false;

function esc(v){return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#039;")}
function loadJsBarcode(){
  if(window.JsBarcode) return Promise.resolve();
  return new Promise((resolve,reject)=>{
    const s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js';
    s.onload=resolve;s.onerror=reject;document.head.appendChild(s);
  });
}
function addTab(){
  const nav=document.querySelector('.profile-tabs');
  const content=document.querySelector('.profile-content');
  if(!nav||!content||document.getElementById('wheelProfileTab')) return;
  const btn=document.createElement('button');
  btn.id='wheelProfileTab';btn.type='button';btn.dataset.profileTab='wheel';
  btn.innerHTML='<span class="profile-nav-ico">🎁</span> Колесо фортуны';
  nav.insertBefore(btn,document.getElementById('staffWorkspaceTab'));
  const pane=document.createElement('section');
  pane.className='profile-card profile-pane wheel-profile-pane';
  pane.dataset.pane='wheel';
  pane.innerHTML=`
    <div class="profile-card-head"><div><h2>Колесо фортуны</h2><p class="muted">Испытай удачу и получи товар AutoStyle.</p></div></div>
    <div class="wheel-shell">
      <div class="wheel-stage"><div class="wheel-pointer"></div><div id="fortuneWheel" class="fortune-wheel"></div></div>
      <div>
        <div class="wheel-panel">
          <h3>Твой шанс на подарок</h3>
          <p class="muted">Играть можно по расписанию, которое установил администратор.</p>
          <div id="wheelStatus" class="wheel-status">Загрузка...</div>
          <button id="wheelSpinBtn" class="wheel-spin-btn" type="button" disabled>Крутить колесо</button>
        </div>
        <h3 style="margin:22px 0 10px">Мои выигрыши</h3>
        <div id="wheelPrizeList" class="wheel-prizes"></div>
      </div>
    </div>`;
  content.appendChild(pane);
  btn.addEventListener('click',()=>{
    document.querySelectorAll('[data-profile-tab]').forEach(x=>x.classList.remove('active'));
    document.querySelectorAll('[data-pane]').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active');pane.classList.add('active');
    history.replaceState(null,'',location.pathname+location.search+'#wheel');
    refreshWheel();
  });
  if(location.hash==='#wheel') setTimeout(()=>btn.click(),100);
  window.addEventListener('hashchange',()=>{if(location.hash==='#wheel')btn.click()});
  document.getElementById('wheelSpinBtn').addEventListener('click',spin);
}
function color(i,total){return `hsl(${Math.round((i/Math.max(total,1))*330)} 72% 48%)`}
function renderWheel(config){
  const wheel=document.getElementById('fortuneWheel');
  if(!wheel)return;

  const products=(config?.products||[])
    .filter(item=>item.enabled!==false&&Number(item.chance)>0);

  const chanceSum=products.reduce((sum,item)=>sum+Number(item.chance||0),0);
  const items=[...products];

  if(chanceSum<100){
    items.push({
      name:'Попробуй ещё',
      chance:100-chanceSum,
      noPrize:true
    });
  }

  if(!items.length){
    items.push({
      name:'Скоро призы',
      chance:100,
      noPrize:true
    });
  }

  /*
    Пользователь не видит реальные коэффициенты.
    Внешне колесо не разбито на вероятностные сектора:
    все фотографии расположены равномерно по окружности.
    Реальные chance используются только при определении выигрыша.
  */
  wheel.innerHTML='';
  wheel.style.background=`
    radial-gradient(circle at center,
      rgba(255,255,255,.98) 0 24%,
      rgba(255,255,255,.10) 24.5% 25.5%,
      transparent 26%
    ),
    conic-gradient(
      from 0deg,
      #151f33,
      #202d46 25%,
      #101827 50%,
      #202d46 75%,
      #151f33
    )
  `;

  const equalStep=360/items.length;

  items.forEach((item,index)=>{
    const angle=index*equalStep+(equalStep/2);
    const visual=document.createElement('div');
    visual.className='wheel-prize-visual';
    visual.style.setProperty('--segment-angle',`${angle}deg`);

    if(item.noPrize){
      visual.innerHTML='<div class="wheel-empty-icon" title="Попробуй ещё">↻</div>';
    }else{
      const image=String(item.image||'assets/as-logo-192.png')
        .replaceAll('&','&amp;')
        .replaceAll('"','&quot;');

      visual.innerHTML=`
        <img src="${image}"
             alt=""
             loading="lazy"
             decoding="async"
             title="${String(item.name||'Приз').replaceAll('"','&quot;')}">
      `;
    }

    wheel.appendChild(visual);
  });

  wheel.dataset.items=JSON.stringify(items);
}
function weightedResult(items){
  const r=Math.random()*100;let cursor=0;
  for(const item of items){cursor+=Number(item.chance||0);if(r<cursor)return item}
  return {name:'Попробуй ещё',noPrize:true};
}
function barcode(){
  const digits=Array.from({length:12},()=>Math.floor(Math.random()*10)).join('');
  return 'ASW'+digits;
}
async function refreshWheel(){
  if(!currentUser)return;

  const status=document.getElementById('wheelStatus');
  const btn=document.getElementById('wheelSpinBtn');

  if(status)status.textContent='Загрузка...';
  if(btn)btn.disabled=true;

  try{
    /*
      Не используем where + orderBy: такой запрос требует ручного
      составного индекса Firestore. Получаем только документы пользователя,
      затем сортируем их локально — работает сразу у всех посетителей.
    */
    const [cfgResult,stateResult,prizesResult]=await Promise.allSettled([
      getDoc(CONFIG_REF),
      getDoc(stateRef(currentUser.uid)),
      getDocs(query(
        collection(db,'autostyle_wheel_prizes'),
        where('userId','==',currentUser.uid)
      ))
    ]);

    const cfg=cfgResult.status==='fulfilled'?cfgResult.value:null;
    const state=stateResult.status==='fulfilled'?stateResult.value:null;
    const prizes=prizesResult.status==='fulfilled'?prizesResult.value:null;

    if(cfgResult.status==='rejected'){
      console.error('Ошибка загрузки настроек колеса:',cfgResult.reason);
    }
    if(stateResult.status==='rejected'){
      console.error('Ошибка загрузки состояния колеса:',stateResult.reason);
    }
    if(prizesResult.status==='rejected'){
      console.error('Ошибка загрузки выигрышей:',prizesResult.reason);
    }

    currentConfig=cfg?.exists()?cfg.data():{enabled:false,products:[]};
    renderWheel(currentConfig);

    const interval=Number(currentConfig.intervalHours||48)*3600000;
    const last=state?.exists()&&state.data().lastSpinAt?.toMillis
      ? state.data().lastSpinAt.toMillis()
      : 0;
    const next=last+interval;
    const now=Date.now();

    if(!currentConfig.enabled){
      if(status)status.textContent='Колесо временно выключено.';
      if(btn)btn.disabled=true;
    }else if(now<next){
      const ms=next-now;
      const h=Math.floor(ms/3600000);
      const m=Math.ceil((ms%3600000)/60000);
      if(status)status.textContent=`Следующая игра через ${h} ч. ${m} мин.`;
      if(btn)btn.disabled=true;
    }else{
      if(status)status.textContent='Колесо готово. Удачи!';
      if(btn)btn.disabled=false;
    }

    const prizeItems=prizes
      ? prizes.docs
          .map(d=>({id:d.id,...d.data()}))
          .sort((a,b)=>{
            const aTime=a.createdAt?.toMillis?.()||0;
            const bTime=b.createdAt?.toMillis?.()||0;
            return bTime-aTime;
          })
          .slice(0,20)
      : [];

    await renderPrizes(prizeItems);
  }catch(error){
    console.error('Ошибка загрузки колеса:',error);
    currentConfig={enabled:false,products:[]};
    renderWheel(currentConfig);
    if(status)status.textContent='Не удалось загрузить колесо. Обнови страницу.';
    if(btn)btn.disabled=true;
    await renderPrizes([]);
  }
}
async function renderPrizes(items){
  const list=document.getElementById('wheelPrizeList');if(!list)return;
  await loadJsBarcode().catch(()=>{});
  if(!items.length){list.innerHTML='<div class="profile-empty">Выигрышей пока нет.</div>';return}
  list.innerHTML=items.map(p=>{
    const exp=p.expiresAt?.toDate?.();const expired=exp&&exp<Date.now();const redeemed=p.status==='redeemed';
    return `<article class="wheel-prize-card ${expired?'wheel-expired':''}">
      <img src="${esc(p.productImage||'assets/as-logo-192.png')}" alt="">
      <div><b>${esc(p.productName)}</b><div class="wheel-prize-meta">Статус: ${redeemed?'Получен':expired?'Срок истёк':'Можно забрать'}<br>Забрать до: ${exp?exp.toLocaleString('ru-RU'):'—'}</div></div>
      <div class="wheel-barcode"><svg data-barcode="${esc(p.barcode)}"></svg><div><b>${esc(p.barcode)}</b></div></div>
    </article>`;
  }).join('');
  if(window.JsBarcode)document.querySelectorAll('[data-barcode]').forEach(svg=>JsBarcode(svg,svg.dataset.barcode,{format:'CODE128',height:52,displayValue:false,margin:3}));
}
async function spin(){
  if(spinning||!currentUser||!currentConfig)return;
  spinning=true;const btn=document.getElementById('wheelSpinBtn');btn.disabled=true;
  try{
    const products=(currentConfig.products||[]).filter(x=>x.enabled!==false&&Number(x.chance)>0);
    const sum=products.reduce((s,x)=>s+Number(x.chance||0),0);
    const items=[...products,...(sum<100?[{name:'Попробуй ещё',chance:100-sum,noPrize:true}]:[])];
    const result=weightedResult(items);
    const selectedIndex=Math.max(0,items.findIndex(x=>x===result));
    /*
      Визуальные позиции равные и не раскрывают реальные вероятности.
      Результат по-прежнему выбран функцией weightedResult по chance.
    */
    const equalStep=360/items.length;
    const segmentCenter=selectedIndex*equalStep+(equalStep/2);
    /*
      Лёгкая и стабильная анимация через Web Animations API.
      Без тяжёлых filter/drop-shadow и анимации каждого фото.
    */
    const wheel=document.getElementById('fortuneWheel');
    const stage=wheel.closest('.wheel-stage');

    const startRotation=rotation;
    const extraTurns=5*360;
    const targetRotation=startRotation+extraTurns+(360-segmentCenter);
    rotation=targetRotation;

    wheel.getAnimations().forEach(animation=>animation.cancel());
    wheel.classList.remove('is-finished');
    wheel.classList.add('is-spinning');
    stage?.classList.add('is-spinning');

    const animation=wheel.animate(
      [
        {transform:`rotate(${startRotation}deg)`},
        {transform:`rotate(${targetRotation}deg)`}
      ],
      {
        duration:4300,
        easing:'cubic-bezier(.10,.72,.08,1)',
        fill:'forwards'
      }
    );

    await animation.finished;
    animation.cancel();
    wheel.style.transform=`rotate(${targetRotation}deg)`;

    wheel.classList.remove('is-spinning');
    wheel.classList.add('is-finished');
    stage?.classList.remove('is-spinning');
    setTimeout(()=>wheel.classList.remove('is-finished'),450);
    const claimHours=Number(currentConfig.claimHours||48);
    await runTransaction(db,async tx=>{
      const sref=stateRef(currentUser.uid),ss=await tx.get(sref),cfg=await tx.get(CONFIG_REF);
      const live=cfg.exists()?cfg.data():currentConfig;
      const last=ss.exists()&&ss.data().lastSpinAt?.toMillis?ss.data().lastSpinAt.toMillis():0;
      const interval=Number(live.intervalHours||48)*3600000;
      if(Date.now()<last+interval)throw new Error('Играть пока рано.');
      tx.set(sref,{lastSpinAt:serverTimestamp(),lastResult:result.noPrize?'none':result.productId||'',updatedAt:serverTimestamp()},{merge:true});
      if(!result.noPrize){
        const pref=doc(collection(db,'autostyle_wheel_prizes'));
        tx.set(pref,{
          userId:currentUser.uid,userEmail:currentUser.email||'',
          productId:result.productId||'',productCode:result.code||'',
          productName:result.name||'Приз',productImage:result.image||'',
          barcode:barcode(),status:'active',
          createdAt:serverTimestamp(),
          expiresAt:Timestamp.fromMillis(Date.now()+claimHours*3600000)
        });
      }
    });
    alert(result.noPrize?'В этот раз без приза. Попробуй снова позже!':`Поздравляем! Ты выиграл: ${result.name}`);
    await refreshWheel();
  }catch(e){alert(e.message||e);await refreshWheel()}
  finally{spinning=false}
}
addTab();
onAuthStateChanged(auth,u=>{currentUser=u;if(u)refreshWheel()});
