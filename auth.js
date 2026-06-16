import { auth } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { loginEmail, registerEmail, sendSmsCode, confirmSmsCode, ensureUserProfile } from './auth-core.js';
const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);
function showModal(){ $('#authModal')?.classList.add('open'); $('#authModal')?.classList.add('show'); }
function hideModal(){ $('#authModal')?.classList.remove('open'); $('#authModal')?.classList.remove('show'); }
function say(t, ok=true){ const m=$('#authMsg')||$('#authFullMsg'); if(m){m.textContent=t||'';m.classList.toggle('error',!ok);m.classList.toggle('ok',ok);} }
function setMode(mode){
  $$('.auth-choice').forEach(b=>b.classList.toggle('active', b.dataset.authMode===mode));
  $$('.auth-mode-panel').forEach(p=>p.classList.toggle('active', p.dataset.authPanel===mode));
  say('');
}
function renderAuthModal(){
  const modal=$('#authModal'); if(!modal || modal.dataset.cleanAuth==='1') return;
  modal.dataset.cleanAuth='1';
  modal.innerHTML=`<div class="modal-card auth-clean">
    <button id="closeAuth" class="modal-close" type="button">×</button>
    <h2 class="auth-modal-title">Аккаунт AutoStyle</h2>
    <p class="muted auth-modal-sub">Выберите действие: вход отдельно, регистрация отдельно.</p>
    <div class="auth-choice-grid">
      <button class="auth-choice active" data-auth-mode="login-email" type="button">✉️ Войти по почте</button>
      <button class="auth-choice" data-auth-mode="login-phone" type="button">📱 Войти по телефону</button>
      <button class="auth-choice" data-auth-mode="register" type="button">➕ Регистрация</button>
      <button class="auth-choice" data-auth-mode="help" type="button">ℹ️ Что нужно?</button>
    </div>
    <form id="loginForm" class="auth-mode-panel active" data-auth-panel="login-email">
      <label class="field field-wide">Email<input id="loginEmail" type="email" autocomplete="email" required></label>
      <label class="field field-wide">Пароль<input id="loginPass" type="password" autocomplete="current-password" required></label>
      <button class="primary" style="width:100%">Войти по почте</button>
    </form>
    <div class="auth-mode-panel" data-auth-panel="login-phone">
      <label class="field field-wide">Телефон<input id="phoneLogin" autocomplete="tel" placeholder="+373..." required></label>
      <button class="secondary" type="button" id="sendSmsCode" style="width:100%;margin-bottom:10px">Получить SMS-код</button>
      <label class="field field-wide">Код из SMS<input id="smsCode" inputmode="numeric" placeholder="123456"></label>
      <button class="primary" type="button" id="confirmSmsCode" style="width:100%">Войти по телефону</button>
      <div id="recaptcha-container"></div>
    </div>
    <form id="registerForm" class="auth-mode-panel" data-auth-panel="register">
      <div class="auth-form-grid">
        <label class="field">Имя<input id="regName" autocomplete="name" required></label>
        <label class="field">Телефон<input id="regPhone" autocomplete="tel" placeholder="+373..." required></label>
        <label class="field field-wide">Email<input id="regEmail" type="email" autocomplete="email" required></label>
        <label class="field">Пароль<input id="regPass" type="password" autocomplete="new-password" minlength="6" required></label>
        <label class="field">Повтор пароля<input id="regPass2" type="password" autocomplete="new-password" minlength="6" required></label>
      </div>
      <button class="primary" style="width:100%;margin-top:10px">Создать аккаунт</button>
      <p class="muted" style="margin-top:10px">После регистрации придёт письмо подтверждения. Телефон можно подтвердить SMS в профиле.</p>
    </form>
    <div class="auth-mode-panel" data-auth-panel="help"><p class="muted">Для входа можно использовать e-mail и пароль или номер телефона с SMS. Для регистрации указываются имя, e-mail, телефон и пароль.</p></div>
    <p id="authFullMsg" class="auth-msg"></p>
  </div>`;
}
function bindAuth(){
  renderAuthModal();
  $('#authOpen')?.addEventListener('click',showModal); $('#authBtn')?.addEventListener('click',showModal); $('#openLoginPage')?.addEventListener('click',showModal); $('#openRegisterPage')?.addEventListener('click',()=>{showModal();setMode('register')}); $('#closeAuth')?.addEventListener('click',hideModal); $$('[data-close="authModal"]').forEach(b=>b.addEventListener('click',hideModal));
  $$('.auth-choice').forEach(btn=>btn.addEventListener('click',()=>setMode(btn.dataset.authMode)));
  $('#loginForm')?.addEventListener('submit', async e=>{e.preventDefault();try{say('Входим...');await loginEmail($('#loginEmail').value.trim(),$('#loginPass').value);hideModal();location.href='profile.html'}catch(err){say((err.message||err),false)}});
  $('#registerForm')?.addEventListener('submit', async e=>{e.preventDefault();try{const p1=$('#regPass').value,p2=$('#regPass2').value;if(p1!==p2){say('Пароли не совпадают.',false);return;}say('Создаём аккаунт...');await registerEmail($('#regName').value.trim(),$('#regEmail').value.trim(),p1,$('#regPhone').value.trim());say('Аккаунт создан. Мы отправили письмо подтверждения. Перейдите на почту и активируйте аккаунт. Если письма нет — проверьте папку «Спам».');}catch(err){say('Ошибка регистрации: '+(err.message||err),false)}});
  $('#sendSmsCode')?.addEventListener('click', async()=>{try{say('Отправляем SMS...');await sendSmsCode($('#phoneLogin').value.trim());say('Код отправлен. Введите его ниже.')}catch(err){say('Ошибка SMS: '+(err.message||err),false)}});
  $('#confirmSmsCode')?.addEventListener('click', async()=>{try{say('Проверяем код...');await confirmSmsCode($('#smsCode').value.trim());hideModal();location.href='profile.html'}catch(err){say('Ошибка подтверждения: '+(err.message||err),false)}});
}
bindAuth();
onAuthStateChanged(auth,async u=>{ if(u){await ensureUserProfile(u); const t=$('#authText'); if(t)t.textContent='Профиль'; const ue=$('#userEmail'); if(ue)ue.textContent=u.email||u.phoneNumber||u.displayName||'Пользователь';} });
