
import { auth, db } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  doc,getDoc,collection,query,where,getDocs,
  runTransaction,serverTimestamp,Timestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const CONFIG_REF = doc(db,'autostyle_wheel_config','main');
const stateRef = uid => doc(db,'autostyle_wheel_state',uid);
let currentUser=null, currentConfig=null, rotation=0, spinning=false, availabilityTimer=null;

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
    <div class="wheel-mobile-hero">
      <span class="wheel-mobile-kicker">AUTO STYLE REWARDS</span>
      <h2>Колесо подарков</h2>
      <p>Крути колесо и забирай настоящий товар в магазине AutoStyle.</p>
      <div class="wheel-mobile-trust">
        <span>✓ Бесплатная попытка</span>
        <span>✓ Реальные призы</span>
      </div>
    </div>
    <div class="profile-card-head wheel-desktop-heading"><div><h2>Колесо фортуны</h2><p class="muted">Испытай удачу и получи товар AutoStyle.</p></div></div>
    <div class="wheel-shell">
      <div class="wheel-game-card">
        <div class="wheel-stage">
          <div class="wheel-light-ring" aria-hidden="true"></div>
          <div class="wheel-pointer"><i></i></div>
          <div id="fortuneWheel" class="fortune-wheel"></div>
          <div class="wheel-center-cap"><b>AS</b><small>GO</small></div>
        </div>
        <div class="wheel-mobile-status-card">
          <div><small>СТАТУС ПОПЫТКИ</small><strong id="wheelStatusMobile">Загрузка...</strong></div>
          <span class="wheel-live-dot"></span>
        </div>
        <button id="wheelSpinBtn" class="wheel-spin-btn wheel-spin-main" type="button" disabled>
          <span class="wheel-spin-icon">↻</span>
          <span><b>КРУТИТЬ КОЛЕСО</b><small>Нажми и испытай удачу</small></span>
        </button>
      </div>
      <div class="wheel-side">
        <div class="wheel-panel">
          <span class="wheel-panel-kicker">ТВОЯ ПОПЫТКА</span>
          <h3>Подарок может быть твоим</h3>
          <p class="muted">Следующая попытка откроется автоматически после завершения таймера. Мы сообщим, когда колесо снова будет готово.</p>
          <div id="wheelStatus" class="wheel-status">Загрузка...</div>
          <button id="wheelSpinBtnDesktop" class="wheel-spin-btn wheel-spin-desktop" type="button" disabled>Крутить колесо</button>
        </div>
        <div class="wheel-prizes-head">
          <div><span>МОИ ПОДАРКИ</span><h3>Выигрыши</h3></div>
          <small>Покажи штрихкод сотруднику</small>
        </div>
        <div id="wheelPrizeList" class="wheel-prizes"></div>
      </div>
    </div>
    <div id="wheelResultModal" class="wheel-result-modal" hidden>
      <div class="wheel-result-backdrop"></div>
      <div class="wheel-result-sheet" role="dialog" aria-modal="true" aria-labelledby="wheelResultTitle">
        <button id="wheelResultClose" class="wheel-result-close" type="button" aria-label="Закрыть">×</button>
        <div id="wheelResultBurst" class="wheel-result-burst">🎉</div>
        <span id="wheelResultBadge" class="wheel-result-badge">ТВОЙ ПРИЗ</span>
        <h3 id="wheelResultTitle">Поздравляем!</h3>
        <img id="wheelResultImage" src="assets/as-logo-192.png" alt="">
        <strong id="wheelResultName">Подарок AutoStyle</strong>
        <p id="wheelResultText">Приз сохранён в разделе «Мои выигрыши».</p>
        <button id="wheelResultAction" class="wheel-result-action" type="button">Отлично!</button>
      </div>
      <div id="wheelConfetti" class="wheel-confetti" aria-hidden="true"></div>
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
  document.getElementById('wheelSpinBtn')?.addEventListener('click',spin);
  document.getElementById('wheelSpinBtnDesktop')?.addEventListener('click',spin);
  document.getElementById('wheelResultClose')?.addEventListener('click',closeWheelResult);
  document.getElementById('wheelResultAction')?.addEventListener('click',closeWheelResult);
  document.querySelector('.wheel-result-backdrop')?.addEventListener('click',closeWheelResult);
}

function syncWheelButtons(disabled){
  ['wheelSpinBtn','wheelSpinBtnDesktop'].forEach(id=>{
    const button=document.getElementById(id);
    if(button)button.disabled=disabled;
  });
}
function syncWheelStatus(message){
  const desktop=document.getElementById('wheelStatus');
  const mobile=document.getElementById('wheelStatusMobile');
  if(desktop)desktop.textContent=message;
  if(mobile)mobile.textContent=message;
}
function vibrate(pattern){
  try{if(navigator.vibrate)navigator.vibrate(pattern)}catch(_){}
}
function closeWheelResult(){
  const modal=document.getElementById('wheelResultModal');
  if(!modal)return;
  modal.classList.remove('is-open');
  document.documentElement.classList.remove('wheel-modal-open');
  setTimeout(()=>{modal.hidden=true},260);
}
function createConfetti(){
  const box=document.getElementById('wheelConfetti');
  if(!box)return;
  box.innerHTML='';
  const symbols=['●','■','◆','★'];
  for(let i=0;i<46;i++){
    const piece=document.createElement('i');
    piece.textContent=symbols[i%symbols.length];
    piece.style.setProperty('--x',`${Math.random()*100}%`);
    piece.style.setProperty('--delay',`${Math.random()*.45}s`);
    piece.style.setProperty('--duration',`${1.7+Math.random()*1.4}s`);
    piece.style.setProperty('--drift',`${-70+Math.random()*140}px`);
    piece.style.setProperty('--spin',`${180+Math.random()*720}deg`);
    box.appendChild(piece);
  }
}
function showWheelResult(result){
  const modal=document.getElementById('wheelResultModal');
  if(!modal)return;
  const noPrize=!!result?.noPrize;
  const image=document.getElementById('wheelResultImage');
  const title=document.getElementById('wheelResultTitle');
  const name=document.getElementById('wheelResultName');
  const text=document.getElementById('wheelResultText');
  const badge=document.getElementById('wheelResultBadge');
  const burst=document.getElementById('wheelResultBurst');
  const action=document.getElementById('wheelResultAction');

  if(noPrize){
    modal.classList.add('is-empty-result');
    badge.textContent='ПОПРОБУЙ ЕЩЁ';
    title.textContent='Почти получилось!';
    name.textContent='В этот раз без подарка';
    text.textContent='Новая попытка появится после завершения таймера.';
    burst.textContent='↻';
    image.src='assets/as-logo-192.png';
    action.textContent='Хорошо';
  }else{
    modal.classList.remove('is-empty-result');
    badge.textContent='ТВОЙ ПРИЗ';
    title.textContent='Ты выиграл!';
    name.textContent=result.name||'Подарок AutoStyle';
    text.textContent='Приз уже сохранён в разделе «Мои выигрыши». Покажи штрихкод сотруднику магазина.';
    burst.textContent='🎉';
    image.src=result.image||'assets/as-logo-192.png';
    action.textContent='Забрать подарок';
    createConfetti();
  }
  modal.hidden=false;
  requestAnimationFrame(()=>modal.classList.add('is-open'));
  document.documentElement.classList.add('wheel-modal-open');
  vibrate(noPrize?[50]:[80,60,120,60,180]);
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

function notificationRef(id){
  return doc(db,'autostyle_notifications',id);
}
function safeNotifyId(value){
  return String(value||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,120);
}
function clearAvailabilityTimer(){
  if(availabilityTimer){clearTimeout(availabilityTimer);availabilityTimer=null;}
}
async function createReadyNotificationIfDue(stateData={}){
  if(!currentUser||!currentConfig?.enabled)return;
  const nextMs=stateData.nextAvailableAt?.toMillis?.()
    || ((stateData.lastSpinAt?.toMillis?.()||0)+Number(currentConfig.intervalHours||48)*3600000);
  const key=safeNotifyId(stateData.readyNotificationKey||nextMs);
  if(!nextMs||Date.now()<nextMs||stateData.readyNotificationSent===true||!key)return;
  try{
    await runTransaction(db,async tx=>{
      const sref=stateRef(currentUser.uid);
      const snap=await tx.get(sref);
      if(!snap.exists())return;
      const live=snap.data()||{};
      const liveNext=live.nextAvailableAt?.toMillis?.()
        || ((live.lastSpinAt?.toMillis?.()||0)+Number(currentConfig.intervalHours||48)*3600000);
      const liveKey=safeNotifyId(live.readyNotificationKey||liveNext);
      if(!liveNext||Date.now()<liveNext||live.readyNotificationSent===true||liveKey!==key)return;
      tx.set(notificationRef(`wheel-ready-${currentUser.uid}-${liveKey}`),{
        audience:'user',userId:currentUser.uid,uid:currentUser.uid,userEmail:currentUser.email||'',
        type:'wheel_ready',title:'🎡 Колесо фортуны снова доступно',
        text:'Новая попытка уже открыта. Испытай удачу — возможно, сегодняшний приз ждёт именно тебя.',
        html:'<p><b>Новая попытка уже открыта.</b></p><p>Испытай удачу — возможно, сегодняшний приз ждёт именно тебя.</p>',
        link:'profile.html#wheel',createdAt:serverTimestamp(),createdBy:'wheel-system'
      });
      tx.set(sref,{readyNotificationSent:true,readyNotificationSentAt:serverTimestamp()},{merge:true});
    });
  }catch(error){console.warn('Не удалось создать уведомление о доступности колеса:',error);}
}
function scheduleReadyNotification(stateData={}){
  clearAvailabilityTimer();
  const nextMs=stateData.nextAvailableAt?.toMillis?.()
    || ((stateData.lastSpinAt?.toMillis?.()||0)+Number(currentConfig?.intervalHours||48)*3600000);
  if(!nextMs)return;
  const delay=nextMs-Date.now();
  if(delay<=0){createReadyNotificationIfDue(stateData);return;}
  availabilityTimer=setTimeout(async()=>{
    await createReadyNotificationIfDue(stateData);
    await refreshWheel();
  },Math.min(delay+800,2147483000));
}
async function refreshWheel(){
  if(!currentUser)return;

  const status=document.getElementById('wheelStatus');
  const btn=document.getElementById('wheelSpinBtn');

  syncWheelStatus('Загрузка...');
  syncWheelButtons(true);

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

    const stateData=state?.exists()?state.data():{};
    const interval=Number(currentConfig.intervalHours||48)*3600000;
    const last=stateData.lastSpinAt?.toMillis?stateData.lastSpinAt.toMillis():0;
    const next=stateData.nextAvailableAt?.toMillis?.()||last+interval;
    const now=Date.now();

    if(!currentConfig.enabled){
      syncWheelStatus('Колесо временно выключено.');
      syncWheelButtons(true);
    }else if(now<next){
      const ms=next-now;
      const h=Math.floor(ms/3600000);
      const m=Math.ceil((ms%3600000)/60000);
      if(status)status.textContent=`Следующая игра через ${h} ч. ${m} мин.`;
      syncWheelButtons(true);
    }else{
      if(status)status.textContent='Колесо готово. Удачи!';
      syncWheelButtons(false);
    }

    scheduleReadyNotification(stateData);

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
    syncWheelButtons(true);
    await renderPrizes([]);
  }
}
async function renderPrizes(items){
  const list=document.getElementById('wheelPrizeList');if(!list)return;
  await loadJsBarcode().catch(()=>{});
  if(!items.length){list.innerHTML='<div class="profile-empty">Выигрышей пока нет.</div>';return}
  const cards=items.map((p,index)=>{
    const exp=p.expiresAt?.toDate?.();const expired=exp&&exp<Date.now();const redeemed=p.status==='redeemed';
    return `<article class="wheel-prize-card ${expired?'wheel-expired':''} ${index>=3?'wheel-prize-extra':''}">
      <img src="${esc(p.productImage||'assets/as-logo-192.png')}" alt="">
      <div><b>${esc(p.productName)}</b><div class="wheel-prize-meta">Статус: ${redeemed?'Получен':expired?'Срок истёк':'Можно забрать'}<br>Забрать до: ${exp?exp.toLocaleString('ru-RU'):'—'}</div></div>
      <div class="wheel-barcode"><svg data-barcode="${esc(p.barcode)}"></svg><div><b>${esc(p.barcode)}</b></div></div>
    </article>`;
  }).join('');
  const hiddenCount=Math.max(0,items.length-3);
  list.innerHTML=`<div class="wheel-prize-items">${cards}</div>${hiddenCount?`<button class="wheel-prizes-toggle" type="button" aria-expanded="false"><span>Показать ещё ${hiddenCount}</span><i>⌄</i></button>`:''}`;
  const toggle=list.querySelector('.wheel-prizes-toggle');
  if(toggle)toggle.addEventListener('click',()=>{
    const expanded=list.classList.toggle('is-expanded');
    toggle.setAttribute('aria-expanded',String(expanded));
    toggle.querySelector('span').textContent=expanded?'Свернуть':`Показать ещё ${hiddenCount}`;
    toggle.querySelector('i').textContent=expanded?'⌃':'⌄';
  });
  if(window.JsBarcode)list.querySelectorAll('[data-barcode]').forEach(svg=>JsBarcode(svg,svg.dataset.barcode,{format:'CODE128',height:52,displayValue:false,margin:3}));
}

async function spin(){
  if(spinning||!currentUser||!currentConfig)return;
  spinning=true;const btn=document.getElementById('wheelSpinBtn');syncWheelButtons(true);vibrate(35);
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
    document.querySelector('.wheel-game-card')?.classList.add('is-spinning');

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
    document.querySelector('.wheel-game-card')?.classList.remove('is-spinning');
    vibrate([35,35,70]);
    setTimeout(()=>wheel.classList.remove('is-finished'),450);
    const claimHours=Number(currentConfig.claimHours||48);
    const spinAt=Date.now();
    await runTransaction(db,async tx=>{
      const sref=stateRef(currentUser.uid),ss=await tx.get(sref),cfg=await tx.get(CONFIG_REF);
      const live=cfg.exists()?cfg.data():currentConfig;
      const lastData=ss.exists()?ss.data():{};
      const last=lastData.lastSpinAt?.toMillis?lastData.lastSpinAt.toMillis():0;
      const interval=Number(live.intervalHours||48)*3600000;
      const liveNext=lastData.nextAvailableAt?.toMillis?.()||last+interval;
      if(Date.now()<liveNext)throw new Error('Играть пока рано.');
      const readyKey=String(spinAt);
      tx.set(sref,{
        lastSpinAt:serverTimestamp(),lastSpinClientAt:spinAt,
        nextAvailableAt:Timestamp.fromMillis(spinAt+interval),
        readyNotificationKey:readyKey,readyNotificationSent:false,
        lastResult:result.noPrize?'none':result.productId||'',updatedAt:serverTimestamp()
      },{merge:true});
      if(!result.noPrize){
        const pref=doc(collection(db,'autostyle_wheel_prizes'));
        const prizeBarcode=barcode();
        tx.set(pref,{
          userId:currentUser.uid,userEmail:currentUser.email||'',
          productId:result.productId||'',productCode:result.code||'',
          productName:result.name||'Приз',productImage:result.image||'',
          barcode:prizeBarcode,status:'active',
          createdAt:serverTimestamp(),
          expiresAt:Timestamp.fromMillis(spinAt+claimHours*3600000)
        });
        tx.set(notificationRef(`wheel-win-${currentUser.uid}-${pref.id}`),{
          audience:'user',userId:currentUser.uid,uid:currentUser.uid,userEmail:currentUser.email||'',
          type:'wheel_win',title:'🎉 Поздравляем с выигрышем!',
          text:`Вы выиграли: ${result.name||'Приз'}. Покажите штрихкод сотруднику AutoStyle, чтобы получить подарок.`,
          html:`<p>Вы выиграли: <b>${esc(result.name||'Приз')}</b>.</p><p>Покажите штрихкод сотруднику AutoStyle, чтобы получить подарок.</p>`,
          link:'profile.html#wheel',createdAt:serverTimestamp(),createdBy:'wheel-system',prizeId:pref.id
        });
      }
    });
    showWheelResult(result);
    await refreshWheel();
  }catch(e){
    showWheelResult({noPrize:true,name:e.message||String(e)});
    await refreshWheel();
  }
  finally{spinning=false}
}
addTab();
onAuthStateChanged(auth,u=>{currentUser=u;if(u)refreshWheel();else clearAvailabilityTimer()});
