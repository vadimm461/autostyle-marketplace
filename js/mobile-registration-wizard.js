import { auth, db, COLLECTIONS } from './firebase.js';
import { createUserWithEmailAndPassword, updateProfile, sendEmailVerification } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { doc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const $=s=>document.querySelector(s);
let installed=false;

function installRegistrationWizard(){
  if(installed) return true;
  const registerButton=$('#pRegister');
  const registerBox=registerButton?.closest('.m-auth-box');
  if(!registerBox) return false;

  installed=true;

  // Удаляем отдельный блок входа по SMS, телефон остаётся только полем профиля.
  document.querySelectorAll('.m-auth-box').forEach(box=>{
    if(box!==registerBox && /Вход по SMS|SMS-код|Получить SMS/i.test(box.textContent||'')) box.remove();
  });

  registerBox.outerHTML=`<div class="m-auth-box m-reg-wizard">
    <div class="m-reg-progress-head"><b id="mRegStepText">Шаг 1 из 6</b><small>Регистрация</small></div>
    <div class="m-reg-progress"><i id="mRegProgressBar"></i></div>

    <section class="m-reg-step active"><span>👋</span><h2>Как вас зовут?</h2><input id="pRegName" class="m-input" placeholder="Ваше имя" minlength="2" required></section>
    <section class="m-reg-step"><span>🚗</span><h2>Марка автомобиля</h2><input id="pRegCarBrand" class="m-input" placeholder="Например, Volkswagen" required></section>
    <section class="m-reg-step"><span>📅</span><h2>Год автомобиля</h2><input id="pRegCarYear" class="m-input" type="number" inputmode="numeric" min="1950" max="2030" placeholder="Например, 2018" required></section>
    <section class="m-reg-step"><span>🏁</span><h2>Модель автомобиля</h2><input id="pRegCarModel" class="m-input" placeholder="Например, Octavia" required></section>
    <section class="m-reg-step"><span>🔐</span><h2>Придумайте пароль</h2><input id="pRegPass" class="m-input" type="password" minlength="6" placeholder="Минимум 6 символов" required><input id="pRegPass2" class="m-input" type="password" minlength="6" placeholder="Повторите пароль" required></section>
    <section class="m-reg-step"><span>✉️</span><h2>Укажите Email</h2><input id="pRegEmail" class="m-input" type="email" placeholder="name@example.com" required><p>На почту придёт письмо подтверждения.</p></section>

    <div class="m-reg-actions"><button id="mRegBack" class="m-btn" type="button" hidden>Назад</button><button id="mRegNext" class="m-primary" type="button">Продолжить</button></div>
  </div>`;

  let step=0;
  const steps=[...document.querySelectorAll('.m-reg-step')];

  const draw=()=>{
    steps.forEach((el,i)=>el.classList.toggle('active',i===step));
    $('#mRegStepText').textContent=`Шаг ${step+1} из ${steps.length}`;
    $('#mRegProgressBar').style.width=`${((step+1)/steps.length)*100}%`;
    $('#mRegBack').hidden=step===0;
    $('#mRegNext').textContent=step===steps.length-1?'Создать аккаунт':'Продолжить';
    setTimeout(()=>steps[step]?.querySelector('input')?.focus(),20);
  };

  const validate=()=>{
    for(const input of steps[step].querySelectorAll('input[required]')){
      if(!input.checkValidity()){input.reportValidity();return false;}
    }
    if(step===2){
      const year=Number($('#pRegCarYear').value);
      const max=new Date().getFullYear()+1;
      if(year<1950||year>max){alert(`Укажите год от 1950 до ${max}.`);return false;}
    }
    if(step===4&&$('#pRegPass').value!==$('#pRegPass2').value){
      alert('Пароли не совпадают.');return false;
    }
    return true;
  };

  $('#mRegNext').onclick=async()=>{
    if(!validate()) return;
    if(step<steps.length-1){step++;draw();return;}

    const button=$('#mRegNext');
    button.disabled=true;
    button.textContent='Создаём...';

    try{
      const name=$('#pRegName').value.trim();
      const carBrand=$('#pRegCarBrand').value.trim();
      const carYear=$('#pRegCarYear').value.trim();
      const carModel=$('#pRegCarModel').value.trim();
      const email=$('#pRegEmail').value.trim();

      const result=await createUserWithEmailAndPassword(auth,email,$('#pRegPass').value);
      await updateProfile(result.user,{displayName:name});

      await setDoc(doc(db,COLLECTIONS.users||'autostyle_users',result.user.uid),{
        uid:result.user.uid,
        name,email,
        carBrand,carYear,carModel,
        car:[carBrand,carModel,carYear].filter(Boolean).join(' '),
        phone:'',
        role:'user',
        emailVerified:false,
        updatedAt:new Date().toISOString(),
        createdAt:new Date().toISOString(),
        createdAtServer:serverTimestamp()
      },{merge:true});

      await sendEmailVerification(result.user);
      alert('Аккаунт создан. Проверьте почту и подтвердите Email.');
      location.reload();
    }catch(error){
      button.disabled=false;
      button.textContent='Создать аккаунт';
      alert('Ошибка регистрации: '+(error?.message||error));
    }
  };

  $('#mRegBack').onclick=()=>{if(step>0){step--;draw();}};
  steps.forEach(section=>section.querySelectorAll('input').forEach(input=>{
    input.addEventListener('keydown',event=>{
      if(event.key==='Enter'){event.preventDefault();$('#mRegNext').click();}
    });
  }));
  draw();
  return true;
}

const observer=new MutationObserver(()=>{
  if(installRegistrationWizard()) observer.disconnect();
});
observer.observe(document.documentElement,{childList:true,subtree:true});
installRegistrationWizard();
