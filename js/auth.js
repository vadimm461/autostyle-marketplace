
import { auth, db } from './firebase.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { doc, setDoc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const $ = (s)=>document.querySelector(s);
const authModal = $('#authModal');
const authOpen = $('#authOpen');
const authText = $('#authText');
const authMsg = $('#authMsg');

authOpen?.addEventListener('click', ()=> authModal.classList.add('open'));
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$('#'+b.dataset.close).classList.remove('open'));
document.querySelectorAll('.tab').forEach(btn=>btn.onclick=()=>{
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.pane').forEach(x=>x.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(btn.dataset.tab).classList.add('active');
});

function message(t){ if(authMsg) authMsg.textContent=t; }
async function roleOf(user){ const s=await getDoc(doc(db,'users',user.uid)); return s.exists()?s.data().role:'user'; }

$('#modalRegister')?.addEventListener('submit', async e=>{
  e.preventDefault();
  const name=$('#regName').value.trim(), email=$('#regEmail').value.trim(), password=$('#regPassword').value;
  try{
    message('Создаём аккаунт...');
    const r=await createUserWithEmailAndPassword(auth,email,password);
    await setDoc(doc(db,'users',r.user.uid),{name,email,role:'user',createdAt:new Date().toISOString()});
    await sendEmailVerification(r.user);
    message('Аккаунт создан. Подтвердите email по ссылке в письме, затем войдите.');
  }catch(err){ message(err.code==='auth/email-already-in-use'?'Этот email уже зарегистрирован.':('Ошибка: '+err.message));}
});
$('#modalLogin')?.addEventListener('submit', async e=>{
  e.preventDefault();
  try{
    message('Выполняется вход...');
    const r=await signInWithEmailAndPassword(auth,$('#loginEmail').value.trim(),$('#loginPassword').value);
    if(!r.user.emailVerified){ message('Подтвердите email. Письмо отправлено повторно.'); await sendEmailVerification(r.user); return; }
    authModal.classList.remove('open'); message('');
  }catch(err){ message('Ошибка входа: '+err.message);}
});
$('#logoutBtn')?.addEventListener('click', async()=>{ await signOut(auth); location.href='index.html'; });

onAuthStateChanged(auth, async user=>{
  if(user){
    authText.textContent='Профиль';
    $('#authGuest')?.classList.add('hidden'); $('#authUser')?.classList.remove('hidden');
    if($('#userEmail')) $('#userEmail').textContent=user.email;
    const role=await roleOf(user).catch(()=> 'user');
    $('#adminLink')?.classList.toggle('hidden', role!=='admin');
    $('#modalAdmin')?.classList.toggle('hidden', role!=='admin');
  }else{
    authText.textContent='Войти';
    $('#authGuest')?.classList.remove('hidden'); $('#authUser')?.classList.add('hidden');
    $('#adminLink')?.classList.add('hidden');
  }
});
export { roleOf };
