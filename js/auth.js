import { auth } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { loginEmail, registerEmail, resetPassword, getAuthErrorMessage, ensureUserProfile } from './auth-core.js';
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
    <form id="registerForm" class="auth-mode-panel" data-auth-panel="register">
      <div class="auth-form-grid">
        <label class="field">Имя<input id="regName" autocomplete="name" required></label>
        <label class="field field-wide">Email<input id="regEmail" type="email" autocomplete="email" required></label>
        <label class="field">Пароль<input id="regPass" type="password" autocomplete="new-password" minlength="6" required></label>
        <label class="field">Повтор пароля<input id="regPass2" type="password" autocomplete="new-password" minlength="6" required></label>
      </div>
      <label class="auth-show-pass"><input id="showRegPass" type="checkbox"> Показать пароль</label>
      <button class="primary" style="width:100%;margin-top:10px">Создать аккаунт</button>
      <p class="muted" style="margin-top:10px">После регистрации придёт письмо подтверждения. Откройте его и активируйте аккаунт.</p>
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
  $('#registerForm')?.addEventListener('submit', async e=>{e.preventDefault();try{const p1=$('#regPass').value,p2=$('#regPass2').value;if(p1!==p2){say('Пароли не совпадают.',false);return;}say('Создаём аккаунт...');await registerEmail($('#regName').value.trim(),$('#regEmail').value.trim(),p1);say('Аккаунт создан. Проверьте письмо подтверждения и активируйте аккаунт.');}catch(err){say('Ошибка регистрации: '+(err.message||err),false)}});
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
