import { auth } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { loginEmail, registerEmail, resetPassword, getAuthErrorMessage, ensureUserProfile } from './auth-core.js';

const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);
let regStep = 0;
const regSteps = ['name','brand','year','model','password','email'];

function showModal(){ $('#authModal')?.classList.add('open','show'); }
function hideModal(){ $('#authModal')?.classList.remove('open','show'); }
function say(t, ok=true){
  const m=$('#authMsg')||$('#authFullMsg');
  if(m){m.textContent=t||'';m.classList.toggle('error',!ok);m.classList.toggle('ok',ok);}
}
function setMode(mode){
  $$('.auth-choice').forEach(b=>b.classList.toggle('active', b.dataset.authMode===mode));
  $$('.auth-mode-panel').forEach(p=>p.classList.toggle('active', p.dataset.authPanel===mode));
  say('');
  if(mode==='register'){ regStep=0; renderRegisterStep(); }
}
function renderRegisterStep(){
  const panels = $$('.as-reg-step');
  panels.forEach((p,i)=>p.classList.toggle('active',i===regStep));
  const current = regStep + 1;
  const progress = $('#asRegProgressBar');
  if(progress) progress.style.width = `${(current/regSteps.length)*100}%`;
  const count = $('#asRegStepCount');
  if(count) count.textContent = `Шаг ${current} из ${regSteps.length}`;
  const back = $('#asRegBack');
  if(back) back.hidden = regStep===0;
  const next = $('#asRegNext');
  if(next) next.textContent = regStep===regSteps.length-1 ? 'Создать аккаунт' : 'Продолжить';
  requestAnimationFrame(()=>panels[regStep]?.querySelector('input')?.focus());
}
function currentInputValid(){
  const panel = $$('.as-reg-step')[regStep];
  const inputs = [...(panel?.querySelectorAll('input')||[])];
  for(const input of inputs){
    if(!input.checkValidity()){ input.reportValidity(); return false; }
  }
  if(regSteps[regStep]==='year'){
    const year=Number($('#regCarYear')?.value);
    const max=new Date().getFullYear()+1;
    if(year<1950 || year>max){ say(`Укажите год от 1950 до ${max}`,false); return false; }
  }
  if(regSteps[regStep]==='password'){
    if($('#regPass').value!==$('#regPass2').value){ say('Пароли не совпадают.',false); return false; }
  }
  say('');
  return true;
}
async function finishRegistration(){
  const name=$('#regName').value.trim();
  const carBrand=$('#regCarBrand').value.trim();
  const carYear=$('#regCarYear').value.trim();
  const carModel=$('#regCarModel').value.trim();
  const pass=$('#regPass').value;
  const email=$('#regEmail').value.trim();
  try{
    say('Создаём аккаунт...');
    await registerEmail(name,email,pass,{
      carBrand,carYear,carModel,
      car:[carBrand,carModel,carYear].filter(Boolean).join(' ')
    });
    say('Аккаунт создан. Письмо подтверждения отправлено на почту.');
    setTimeout(()=>{ hideModal(); location.href='profile.html'; },900);
  }catch(err){
    say('Ошибка регистрации: '+getAuthErrorMessage(err,err?.message||'Не удалось создать аккаунт'),false);
  }
}
function renderAuthModal(){
  const modal=$('#authModal'); if(!modal || modal.dataset.cleanAuth==='1') return;
  modal.dataset.cleanAuth='1';
  modal.innerHTML=`<div class="modal-card auth-clean auth-wizard-card">
    <button id="closeAuth" class="modal-close" type="button">×</button>
    <h2 class="auth-modal-title">Аккаунт AutoStyle</h2>
    <p class="muted auth-modal-sub">Войдите или создайте персональный профиль.</p>
    <div class="auth-choice-grid">
      <button class="auth-choice active" data-auth-mode="login-email" type="button">Вход</button>
      <button class="auth-choice" data-auth-mode="register" type="button">Регистрация</button>
    </div>

    <form id="loginForm" class="auth-mode-panel active" data-auth-panel="login-email">
      <label class="field field-wide">Email<input id="loginEmail" type="email" autocomplete="email" required></label>
      <label class="field field-wide">Пароль<input id="loginPass" type="password" autocomplete="current-password" required></label>
      <label class="auth-show-pass"><input id="showLoginPass" type="checkbox"> Показать пароль</label>
      <button class="primary" style="width:100%">Войти</button>
      <button id="forgotPassword" class="auth-link-btn" type="button">Забыли пароль?</button>
    </form>

    <form id="registerForm" class="auth-mode-panel as-register-wizard" data-auth-panel="register" novalidate>
      <div class="as-reg-progress-head"><span id="asRegStepCount">Шаг 1 из 6</span><small>Создание профиля</small></div>
      <div class="as-reg-progress"><i id="asRegProgressBar"></i></div>

      <section class="as-reg-step active">
        <div class="as-reg-icon">👋</div><h3>Как вас зовут?</h3><p>Имя будет отображаться в вашем профиле.</p>
        <input id="regName" class="as-reg-main-input" autocomplete="name" placeholder="Ваше имя" minlength="2" required>
      </section>
      <section class="as-reg-step">
        <div class="as-reg-icon">🚗</div><h3>Марка автомобиля</h3><p>Например: Volkswagen, BMW или Toyota.</p>
        <input id="regCarBrand" class="as-reg-main-input" autocomplete="off" placeholder="Марка авто" required>
      </section>
      <section class="as-reg-step">
        <div class="as-reg-icon">📅</div><h3>Год автомобиля</h3><p>Это поможет точнее подбирать товары.</p>
        <input id="regCarYear" class="as-reg-main-input" type="number" inputmode="numeric" min="1950" max="2030" placeholder="Например, 2018" required>
      </section>
      <section class="as-reg-step">
        <div class="as-reg-icon">🏁</div><h3>Модель автомобиля</h3><p>Например: Octavia, Golf или Camry.</p>
        <input id="regCarModel" class="as-reg-main-input" autocomplete="off" placeholder="Модель авто" required>
      </section>
      <section class="as-reg-step">
        <div class="as-reg-icon">🔐</div><h3>Придумайте пароль</h3><p>Минимум 6 символов.</p>
        <input id="regPass" class="as-reg-main-input" type="password" autocomplete="new-password" minlength="6" placeholder="Пароль" required>
        <input id="regPass2" class="as-reg-main-input" type="password" autocomplete="new-password" minlength="6" placeholder="Повторите пароль" required>
        <label class="auth-show-pass"><input id="showRegPass" type="checkbox"> Показать пароль</label>
      </section>
      <section class="as-reg-step">
        <div class="as-reg-icon">✉️</div><h3>Последний шаг — Email</h3><p>На него придёт письмо для подтверждения аккаунта.</p>
        <input id="regEmail" class="as-reg-main-input" type="email" autocomplete="email" placeholder="name@example.com" required>
      </section>

      <div class="as-reg-actions">
        <button id="asRegBack" class="as-reg-back" type="button" hidden>Назад</button>
        <button id="asRegNext" class="primary as-reg-next" type="button">Продолжить</button>
      </div>
    </form>
    <p id="authFullMsg" class="auth-msg"></p>
  </div>`;
}
function bindAuth(){
  renderAuthModal();
  $('#authOpen')?.addEventListener('click',showModal);
  $('#authBtn')?.addEventListener('click',showModal);
  $('#openLoginPage')?.addEventListener('click',showModal);
  $('#openRegisterPage')?.addEventListener('click',()=>{showModal();setMode('register')});
  $('#closeAuth')?.addEventListener('click',hideModal);
  $$('[data-close="authModal"]').forEach(b=>b.addEventListener('click',hideModal));
  $$('.auth-choice').forEach(btn=>btn.addEventListener('click',()=>setMode(btn.dataset.authMode)));

  $('#loginForm')?.addEventListener('submit',async e=>{
    e.preventDefault();
    try{ say('Входим...'); await loginEmail($('#loginEmail').value.trim(),$('#loginPass').value); hideModal(); location.href='profile.html'; }
    catch(err){ say(getAuthErrorMessage(err),false); }
  });
  $('#showLoginPass')?.addEventListener('change',e=>{ $('#loginPass').type=e.target.checked?'text':'password'; });
  $('#showRegPass')?.addEventListener('change',e=>{ ['#regPass','#regPass2'].forEach(s=>$(s).type=e.target.checked?'text':'password'); });
  $('#forgotPassword')?.addEventListener('click',async()=>{
    try{ await resetPassword($('#loginEmail')?.value?.trim()); say('Ссылка для восстановления отправлена на почту.'); }
    catch(err){ say(err?.message||'Введите почту',false); }
  });
  $('#asRegNext')?.addEventListener('click',async()=>{
    if(!currentInputValid()) return;
    if(regStep<regSteps.length-1){ regStep++; renderRegisterStep(); }
    else await finishRegistration();
  });
  $('#asRegBack')?.addEventListener('click',()=>{ if(regStep>0){regStep--;renderRegisterStep();} });
  $$('.as-reg-step input').forEach(input=>input.addEventListener('keydown',e=>{
    if(e.key==='Enter'){ e.preventDefault(); $('#asRegNext')?.click(); }
  }));
}
bindAuth();
onAuthStateChanged(auth,async u=>{
  document.body.classList.toggle('as-authenticated',!!u);
  document.body.classList.add('as-auth-ready');
  if(u){
    await ensureUserProfile(u);
    const t=$('#authText'); if(t)t.textContent='Профиль';
    const ue=$('#userEmail'); if(ue)ue.textContent=u.email||u.displayName||'Пользователь';
  }else{
    const t=$('#authText'); if(t)t.textContent='Войти';
    const ue=$('#userEmail'); if(ue)ue.textContent='';
  }
});
