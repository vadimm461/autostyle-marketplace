import { auth, db } from './firebase.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { doc, setDoc, getDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const msg = document.querySelector('#msg');
const show = t => { if(msg) msg.textContent=t; };

const reg = document.querySelector('#registerForm');
if(reg){
  reg.onsubmit = async e => {
    e.preventDefault();
    const name = reg.name.value.trim();
    const email = reg.email.value.trim();
    const pass = reg.password.value;
    try{
      const cred = await createUserWithEmailAndPassword(auth,email,pass);
      await updateProfile(cred.user,{displayName:name});
      await setDoc(doc(db,'users',cred.user.uid),{name,email,role:'user',createdAt:serverTimestamp()});
      location.href='index.html';
    }catch(err){ show(err.message); }
  };
}

const login = document.querySelector('#loginForm');
if(login){
  login.onsubmit = async e => {
    e.preventDefault();
    try{
      const cred = await signInWithEmailAndPassword(auth,login.email.value.trim(),login.password.value);
      const userDoc = await getDoc(doc(db,'users',cred.user.uid));
      const role = userDoc.exists()?userDoc.data().role:'user';
      location.href = role === 'admin' ? 'admin.html' : 'index.html';
    }catch(err){ show(err.message); }
  };
}

const profile = document.querySelector('#profileBox');
if(profile){
  onAuthStateChanged(auth, async user => {
    if(!user){ location.href='login.html'; return; }
    const snap = await getDoc(doc(db,'users',user.uid));
    const role = snap.exists()?snap.data().role:'user';
    profile.innerHTML = `<h1>Личный кабинет</h1><p class="muted">${user.email}</p><div class="banner"><b>Статус:</b> ${role}</div><p class="muted">Здесь позже можно добавить заказы, избранное и историю покупок.</p>${role==='admin'?'<a class="btn primary" href="admin.html">Открыть админ-панель</a>':''}`;
  });
}
