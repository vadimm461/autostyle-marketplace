import { auth } from './firebase.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { loginEmail, registerEmail, signInService, sendSmsCode, confirmSmsCode, ensureUserProfile } from './auth-core.js';
const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);
function showModal(){ $('#authModal')?.classList.add('open'); $('#authModal')?.classList.add('show'); }
function hideModal(){ $('#authModal')?.classList.remove('open'); $('#authModal')?.classList.remove('show'); }
function say(t){ const m=$('#authMsg')||$('#authFullMsg'); if(m)m.textContent=t||''; }
function enhance(){
 const modal=$('#authModal'); if(!modal) return;
 if(!modal.querySelector('[data-auth-service]')){
   const box=document.createElement('div'); box.className='auth-upgrade'; box.innerHTML=`<div class="auth-services"><button class="auth-service" type="button" data-auth-service="google">G Google</button><button class="auth-service" type="button" data-auth-service="facebook">f Facebook</button><button class="auth-service" type="button" data-auth-service="apple"> Apple</button></div><div class="auth-divider">или</div><div class="auth-sms"><b>Вход / регистрация по SMS</b><div class="auth-sms-row"><input id="phoneLogin" placeholder="Телефон: +373..."><button class="secondary" type="button" id="sendSmsCode">Получить код</button></div><div class="auth-sms-row" style="margin-top:8px"><input id="smsCode" placeholder="Код из SMS"><button class="primary" type="button" id="confirmSmsCode">Подтвердить</button></div><div id="recaptcha-container"></div></div><p id="authFullMsg" class="auth-msg"></p>`;
   const h=modal.querySelector('h2'); h?.insertAdjacentElement('afterend', box);
 }
}
enhance();
$('#authOpen')?.addEventListener('click',showModal); $('#authBtn')?.addEventListener('click',showModal); $('#openLoginPage')?.addEventListener('click',showModal); $('#closeAuth')?.addEventListener('click',hideModal); $$('[data-close="authModal"]').forEach(b=>b.addEventListener('click',hideModal));
$$('.tab').forEach(t=>t.onclick=()=>{$$('.tab').forEach(x=>x.classList.remove('active'));t.classList.add('active'); const login=$('#loginForm')||$('#modalLogin'), reg=$('#registerForm')||$('#modalRegister'); if(login)login.style.display=t.dataset.tab?.includes('login')||t.dataset.tab==='login'?'block':'none'; if(reg)reg.style.display=t.dataset.tab?.includes('register')||t.dataset.tab==='register'?'block':'none';});
const loginForm=$('#loginForm')||$('#modalLogin'); const regForm=$('#registerForm')||$('#modalRegister');
loginForm&&(loginForm.onsubmit=async e=>{e.preventDefault();try{say('Входим...');await loginEmail(($('#loginEmail')||{}).value.trim(),($('#loginPass')||$('#loginPassword')).value);hideModal();location.href='profile.html'}catch(err){say('Ошибка входа: '+(err.message||err))}});
regForm&&(regForm.onsubmit=async e=>{e.preventDefault();try{say('Создаём аккаунт...');await registerEmail($('#regName').value.trim(),$('#regEmail').value.trim(),($('#regPass')||$('#regPassword')).value);say('Аккаунт создан. Проверьте письмо подтверждения на почте.')}catch(err){say('Ошибка регистрации: '+(err.message||err))}});
$$('[data-auth-service]').forEach(b=>b.onclick=async()=>{try{say('Открываем сервис входа...');await signInService(b.dataset.authService);hideModal();location.href='profile.html'}catch(err){say('Ошибка сервиса: '+(err.message||err))}});
$('#sendSmsCode')&&($('#sendSmsCode').onclick=async()=>{try{say('Отправляем SMS...');await sendSmsCode($('#phoneLogin').value.trim());say('Код отправлен. Введите его ниже.')}catch(err){say('Ошибка SMS: '+(err.message||err))}});
$('#confirmSmsCode')&&($('#confirmSmsCode').onclick=async()=>{try{say('Проверяем код...');await confirmSmsCode($('#smsCode').value.trim());hideModal();location.href='profile.html'}catch(err){say('Ошибка подтверждения: '+(err.message||err))}});
onAuthStateChanged(auth,async u=>{ if(u){await ensureUserProfile(u); const t=$('#authText'); if(t)t.textContent='Профиль'; const ue=$('#userEmail'); if(ue)ue.textContent=u.email||u.phoneNumber||u.displayName||'Пользователь';} });
