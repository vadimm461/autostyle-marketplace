import { auth, db } from './firebase.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { doc, setDoc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const authBtn = document.getElementById('authBtn');
const modal = document.getElementById('authModal');
const closeAuth = document.getElementById('closeAuth');
const loginTab = document.getElementById('loginTab');
const registerTab = document.getElementById('registerTab');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const msg = document.getElementById('authMsg');
const userChip = document.getElementById('userChip');
const setMsg = t => { if(msg) msg.textContent = t; };

function openAuth(){ modal?.classList.add('show'); setMsg(''); }
function close(){ modal?.classList.remove('show'); }
function mode(m){
  loginForm?.classList.toggle('hide', m!=='login'); registerForm?.classList.toggle('hide', m!=='register');
  loginTab?.classList.toggle('active', m==='login'); registerTab?.classList.toggle('active', m==='register'); setMsg('');
}
authBtn?.addEventListener('click', async()=>{ if(auth.currentUser){ await signOut(auth); location.reload(); } else openAuth(); });
closeAuth?.addEventListener('click', close); modal?.addEventListener('click',e=>{ if(e.target===modal) close(); });
loginTab?.addEventListener('click',()=>mode('login')); registerTab?.addEventListener('click',()=>mode('register'));

registerForm?.addEventListener('submit', async e=>{
  e.preventDefault();
  const name = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  try{
    setMsg('Создаём аккаунт...');
    const res = await createUserWithEmailAndPassword(auth,email,password);
    await setDoc(doc(db,'users',res.user.uid),{name,email,role:'user',createdAt:new Date().toISOString()});
    await sendEmailVerification(res.user);
    await signOut(auth);
    setMsg('Мы отправили письмо подтверждения. Проверьте почту и папку Спам, потом войдите.');
    mode('login');
  }catch(err){
    if(err.code==='auth/email-already-in-use') setMsg('Этот email уже зарегистрирован. Войдите в аккаунт.');
    else setMsg('Ошибка: '+err.message);
  }
});
loginForm?.addEventListener('submit', async e=>{
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  try{
    setMsg('Входим...');
    const res = await signInWithEmailAndPassword(auth,email,password);
    await res.user.reload();
    if(!res.user.emailVerified){ await signOut(auth); setMsg('Сначала подтвердите email. Проверьте почту и папку Спам.'); return; }
    close(); location.reload();
  }catch(err){ setMsg('Ошибка входа: '+err.message); }
});

onAuthStateChanged(auth, async user=>{
  if(!authBtn) return;
  if(user){
    let label = user.email;
    try{ const s = await getDoc(doc(db,'users',user.uid)); if(s.exists() && s.data().name) label = s.data().name; }catch(e){}
    if(userChip) userChip.textContent = label;
    authBtn.textContent = 'Выйти';
  }else{ if(userChip) userChip.textContent=''; authBtn.textContent='Войти'; }
});
