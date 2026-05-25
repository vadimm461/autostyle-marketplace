import { auth, db } from './firebase.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { doc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const registerForm = document.getElementById('registerForm');
const loginForm = document.getElementById('loginForm');

if(registerForm){
  registerForm.addEventListener('submit', async e=>{
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const name = document.getElementById('name').value;
    const cred = await createUserWithEmailAndPassword(auth,email,password);
    await setDoc(doc(db,'users',cred.user.uid),{name,email,role:'user',createdAt:serverTimestamp()});
    location.href='index.html';
  });
}
if(loginForm){
  loginForm.addEventListener('submit', async e=>{
    e.preventDefault();
    await signInWithEmailAndPassword(auth,document.getElementById('email').value,document.getElementById('password').value);
    location.href='index.html';
  });
}
