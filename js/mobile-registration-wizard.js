import { auth, db, COLLECTIONS } from './firebase.js';
import { doc, setDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

const $=s=>document.querySelector(s);
let installed=false;

async function savePendingCar(user){
  if(!user) return;
  const raw=localStorage.getItem('asPendingCarProfile');
  if(!raw) return;
  try{
    const data=JSON.parse(raw);
    await setDoc(doc(db,COLLECTIONS.users||'autostyle_users',user.uid),data,{merge:true});
    localStorage.removeItem('asPendingCarProfile');
  }catch(e){console.warn('pending car profile',e);}
}
onAuthStateChanged(auth,savePendingCar);

function install(){
  if(installed) return true;
  const button=$('#pRegister');
  const box=button?.closest('.m-auth-box');
  if(!box) return false;
  installed=true;

  document.querySelectorAll('.m-auth-box').forEach(el=>{
    if(el!==box && /Вход по SMS|SMS-код|Получить SMS/i.test(el.textContent||'')) el.remove();
  });

  box.outerHTML=`<div class="m-auth-box m-reg-wizard">
    <div class="m-reg-progress-head"><b id="mRegStepText">Шаг 1 из 6</b><small>Регистрация</small></div>
    <div class="m-reg-progress"><i id="mRegProgressBar"></i></div>
    <section class="m-reg-step active"><span>👋</span><h2>Как вас зовут?</h2><input id="pRegName" class="m-input" placeholder="Ваше имя" required></section>
    <section class="m-reg-step"><span>🚗</span><h2>Марка автомобиля</h2><input id="pRegCarBrand" class="m-input" placeholder="Например, Volkswagen" required></section>
    <section class="m-reg-step"><span>📅</span><h2>Год автомобиля</h2><input id="pRegCarYear" class="m-input" type="number" min="1950" max="2030" placeholder="Например, 2018" required></section>
    <section class="m-reg-step"><span>🏁</span><h2>Модель автомобиля</h2><input id="pRegCarModel" class="m-input" placeholder="Например, Octavia" required></section>
    <section class="m-reg-step"><span>🔐</span><h2>Придумайте пароль</h2><input id="pRegPass" class="m-input" type="password" minlength="6" placeholder="Пароль" required><input id="pRegPass2" class="m-input" type="password" minlength="6" placeholder="Повторите пароль" required></section>
    <section class="m-reg-step"><span>✉️</span><h2>Укажите Email</h2><input id="pRegEmail" class="m-input" type="email" placeholder="name@example.com" required><p>На почту придёт письмо подтверждения.</p></section>
    <div class="m-reg-actions"><button id="mRegBack" class="m-btn" type="button" hidden>Назад</button><button id="pRegister" class="m-primary" type="button">Продолжить</button></div>
  </div>`;

  let step=0;
  const steps=[...document.querySelectorAll('.m-reg-step')];
  const draw=()=>{
    steps.forEach((el,i)=>el.classList.toggle('active',i===step));
    $('#mRegStepText').textContent=`Шаг ${step+1} из ${steps.length}`;
    $('#mRegProgressBar').style.width=`${((step+1)/steps.length)*100}%`;
    $('#mRegBack').hidden=step===0;
    $('#pRegister').textContent=step===steps.length-1?'Создать аккаунт':'Продолжить';
  };
  const originalRegister=button.onclick;
  $('#pRegister').onclick=async()=>{
    for(const input of steps[step].querySelectorAll('input[required]')){
      if(!input.checkValidity()){input.reportValidity();return;}
    }
    if(step===4&&$('#pRegPass').value!==$('#pRegPass2').value){alert('Пароли не совпадают.');return;}
    if(step<steps.length-1){step++;draw();return;}
    localStorage.setItem('asPendingCarProfile',JSON.stringify({
      carBrand:$('#pRegCarBrand').value.trim(),
      carYear:$('#pRegCarYear').value.trim(),
      carModel:$('#pRegCarModel').value.trim(),
      car:[$('#pRegCarBrand').value.trim(),$('#pRegCarModel').value.trim(),$('#pRegCarYear').value.trim()].filter(Boolean).join(' ')
    }));
    // Existing mobile-app handler was attached to the old button before replacement.
    // Recreate the same registration through its existing page fields by dispatching a custom event.
    window.dispatchEvent(new CustomEvent('as-mobile-register-request'));
  };
  $('#mRegBack').onclick=()=>{if(step>0){step--;draw();}};
  draw();
  return true;
}

const observer=new MutationObserver(()=>{if(install())observer.disconnect();});
observer.observe(document.documentElement,{childList:true,subtree:true});
install();

import { createUserWithEmailAndPassword, updateProfile, sendEmailVerification } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
window.addEventListener('as-mobile-register-request',async()=>{
  const button=$('#pRegister');
  try{
    button.disabled=true; button.textContent='Создаём...';
    const result=await createUserWithEmailAndPassword(auth,$('#pRegEmail').value.trim(),$('#pRegPass').value);
    await updateProfile(result.user,{displayName:$('#pRegName').value.trim()});
    await setDoc(doc(db,COLLECTIONS.users||'autostyle_users',result.user.uid),{
      uid:result.user.uid,name:$('#pRegName').value.trim(),email:$('#pRegEmail').value.trim(),
      phone:'',role:'user',emailVerified:false
    },{merge:true});
    await savePendingCar(result.user);
    await sendEmailVerification(result.user);
    alert('Аккаунт создан. Проверьте почту и подтвердите Email.');
    location.reload();
  }catch(e){
    button.disabled=false; button.textContent='Создать аккаунт';
    alert('Ошибка регистрации: '+(e?.message||e));
  }
});
