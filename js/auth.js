import { auth, db } from './firebase.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { doc, setDoc, getDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
const $=s=>document.querySelector(s);
const msg=t=>{$('#msg').textContent=t};
$('#registerForm')?.addEventListener('submit',async e=>{e.preventDefault();try{const email=$('#email').value, pass=$('#password').value, name=$('#name').value;const res=await createUserWithEmailAndPassword(auth,email,pass);await setDoc(doc(db,'users',res.user.uid),{email,name,role:'user',createdAt:serverTimestamp()});location.href='index.html'}catch(err){msg('Ошибка: '+err.message)}});
$('#loginForm')?.addEventListener('submit',async e=>{e.preventDefault();try{const email=$('#email').value, pass=$('#password').value;const res=await signInWithEmailAndPassword(auth,email,pass);const snap=await getDoc(doc(db,'users',res.user.uid));const role=snap.exists()?snap.data().role:'user';location.href=role==='admin'?'admin.html':'index.html'}catch(err){msg('Ошибка: '+err.message)}});
