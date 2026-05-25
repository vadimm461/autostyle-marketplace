import { auth } from './firebase.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
const msg=document.getElementById('message');
const login=document.getElementById('loginForm');
const reg=document.getElementById('registerForm');
if(login)login.addEventListener('submit',async e=>{e.preventDefault();try{await signInWithEmailAndPassword(auth,email.value,password.value);location.href='admin.html'}catch(err){msg.textContent=err.message}});
if(reg)reg.addEventListener('submit',async e=>{e.preventDefault();try{await createUserWithEmailAndPassword(auth,email.value,password.value);location.href='admin.html'}catch(err){msg.textContent=err.message}});
