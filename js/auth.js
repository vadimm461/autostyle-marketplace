import { auth } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { loginEmail, registerEmail, resetPassword, getAuthErrorMessage, ensureUserProfile } from './auth-core.js';
const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);
function showModal(){ $('#authModal')?.classList.add('open'); $('#authModal')?.classList.add('show'); }
function hideModal(){ $('#authModal')?.classList.remove('open'); $('#authModal')?.classList.remove('show'); }
function say(t, ok=true){ const m=$('#authMsg')||$('#authFullMsg'); if(m){m.textContent=t||'';m.classList.toggle('error',!ok);m.classList.toggle('ok',ok);} }

let regStep=0;
function drawRegStep(){
  const steps=$$('.as-reg-step');
  steps.forEach((el,i)=>el.classList.toggle('active',i===regStep));
  $('#asRegProgressBar') && ($('#asRegProgressBar').style.width=`${((regStep+1)/steps.length)*100}%`);
  $('#asRegStepCount') && ($('#asRegStepCount').textContent=`Шаг ${regStep+1} из ${steps.length}`);
  $('#asRegBack') && ($('#asRegBack').hidden=regStep===0);
  $('#asRegNext') && ($('#asRegNext').textContent=regStep===steps.length-1?'Создать аккаунт':'Продолжить');
}
function validateRegStep(){
  const step=$$('.as-reg-step')[regStep];
  for(const input of step?.querySelectorAll('input[required]')||[]){
    if(!input.checkValidity()){input.reportValidity();return false;}
  }
  if(regStep===2){
    const y=Number($('#regCarYear').value), max=new Date().getFullYear()+1;
    if(y<1950||y>max){say(`Укажите год от 1950 до ${max}`,false);return false;}
  }
  if(regStep===4&&$('#regPass').value!==$('#regPass2').value){say('Пароли не совпадают.',false);return false;}
  say(''); return true;
}
function setMode(mode){
  $$('.auth-choice').forEach(b=>b.classList.toggle('active', b.dataset.authMode===mode));
  $$('.auth-mode-panel').forEach(p=>p.classList.toggle('active', p.dataset.authPanel===mode));
  say('');
  if(mode==='register'){regStep=0;drawRegStep();}
}
function renderAuthModal(){
  const modal=$('#authModal'); if(!modal || modal.dataset.cleanAuth==='1') return;
  modal.dataset.cleanAuth='1';
  modal.innerHTML=`<div class="modal-card auth-clean">
    <button id="closeAuth" class="modal-close" type="button">×</button>
    <h2 class="auth-modal-title">Аккаунт AutoStyle</h2>
    <p class="muted auth-modal-sub">Войдите в аккаунт или создайте новый профиль.</p>
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
      <div class="as-reg-progress-head"><span id="asRegStepCount">Шаг 1 из 6</span><small>Регистрация</small></div>
      <div class="as-reg-progress"><i id="asRegProgressBar"></i></div>
      <section class="as-reg-step active"><div class="as-reg-icon">👋</div><h3>Как вас зовут?</h3><input id="regName" class="as-reg-main-input" placeholder="Ваше имя" minlength="2" required></section>
      <section class="as-reg-step"><div class="as-reg-icon">🚗</div><h3>Марка автомобиля</h3><input id="regCarBrand" class="as-reg-main-input" placeholder="Например, Volkswagen" required></section>
      <section class="as-reg-step"><div class="as-reg-icon">📅</div><h3>Год автомобиля</h3><input id="regCarYear" class="as-reg-main-input" type="number" min="1950" max="2030" placeholder="Например, 2018" required></section>
      <section class="as-reg-step"><div class="as-reg-icon">🏁</div><h3>Модель автомобиля</h3><input id="regCarModel" class="as-reg-main-input" placeholder="Например, Octavia" required></section>
      <section class="as-reg-step"><div class="as-reg-icon">🔐</div><h3>Придумайте пароль</h3><input id="regPass" class="as-reg-main-input" type="password" minlength="6" placeholder="Пароль" required><input id="regPass2" class="as-reg-main-input" type="password" minlength="6" placeholder="Повторите пароль" required><label class="auth-show-pass"><input id="showRegPass" type="checkbox"> Показать пароль</label></section>
      <section class="as-reg-step"><div class="as-reg-icon">✉️</div><h3>Последний шаг — Email</h3><input id="regEmail" class="as-reg-main-input" type="email" placeholder="name@example.com" required><p class="muted">На почту придёт письмо подтверждения.</p></section>
      <div class="as-reg-actions"><button id="asRegBack" class="as-reg-back" type="button" hidden>Назад</button><button id="asRegNext" class="primary as-reg-next" type="button">Продолжить</button></div>
    </form>
    <p id="authFullMsg" class="auth-msg"></p>
  </div>`;
}
function bindAuth(){
  renderAuthModal();
  $('#authOpen')?.addEventListener('click',showModal); $('#authBtn')?.addEventListener('click',showModal); $('#openLoginPage')?.addEventListener('click',showModal); $('#openRegisterPage')?.addEventListener('click',()=>{showModal();setMode('register')}); $('#closeAuth')?.addEventListener('click',hideModal); $$('[data-close="authModal"]').forEach(b=>b.addEventListener('click',hideModal));
  $$('.auth-choice').forEach(btn=>btn.addEventListener('click',()=>setMode(btn.dataset.authMode)));
  $('#loginForm')?.addEventListener('submit', async e=>{e.preventDefault();try{say('Входим...');await loginEmail($('#loginEmail').value.trim(),$('#loginPass').value);hideModal();location.href='profile.html'}catch(err){say(getAuthErrorMessage(err),false)}});

  $('#showLoginPass')?.addEventListener('change', e=>{ const p=$('#loginPass'); if(p) p.type=e.target.checked?'text':'password'; });
  $('#showRegPass')?.addEventListener('change', e=>{ ['#regPass','#regPass2'].forEach(sel=>{ const p=$(sel); if(p) p.type=e.target.checked?'text':'password'; }); });
  $('#forgotPassword')?.addEventListener('click', async()=>{ try{ const email=$('#loginEmail')?.value?.trim(); await resetPassword(email); say('Ссылка для восстановления пароля отправлена на почту.'); }catch(err){ say(err?.message || 'Введите почту, чтобы восстановить пароль', false); } });
  $('#asRegNext')?.addEventListener('click',async()=>{
    if(!validateRegStep()) return;
    const steps=$$('.as-reg-step');
    if(regStep<steps.length-1){regStep++;drawRegStep();return;}
    try{
      const carBrand=$('#regCarBrand').value.trim(), carYear=$('#regCarYear').value.trim(), carModel=$('#regCarModel').value.trim();
      localStorage.setItem('asPendingCarProfile',JSON.stringify({carBrand,carYear,carModel,car:[carBrand,carModel,carYear].filter(Boolean).join(' ')}));
      say('Создаём аккаунт...');
      await registerEmail($('#regName').value.trim(),$('#regEmail').value.trim(),$('#regPass').value,'');
      say('Аккаунт создан. Проверьте почту и подтвердите Email.');
    }catch(err){say('Ошибка регистрации: '+(err.message||err),false);}
  });
  $('#asRegBack')?.addEventListener('click',()=>{if(regStep>0){regStep--;drawRegStep();}});
}
bindAuth();
onAuthStateChanged(auth, async u => {
  document.body.classList.toggle('as-authenticated', !!u);
  document.body.classList.add('as-auth-ready');

  if (u) {
    await ensureUserProfile(u);
    const t = $('#authText');
    if (t) t.textContent = 'Профиль';
    const ue = $('#userEmail');
    if (ue) ue.textContent = u.email || u.phoneNumber || u.displayName || 'Пользователь';
  } else {
    const t = $('#authText');
    if (t) t.textContent = 'Войти';
    const ue = $('#userEmail');
    if (ue) ue.textContent = '';
  }
});
