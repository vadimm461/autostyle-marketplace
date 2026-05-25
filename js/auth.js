import { auth, db } from './firebase.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { doc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
const reg=document.querySelector('#registerForm');const log=document.querySelector('#loginForm');
if(reg)reg.onsubmit=async(e)=>{e.preventDefault();const email=reg.email.value,password=reg.password.value,name=reg.name.value;const res=await createUserWithEmailAndPassword(auth,email,password);await setDoc(doc(db,'users',res.user.uid),{email,name,role:'user',createdAt:serverTimestamp()});location.href='index.html'};
if(log)log.onsubmit=async(e)=>{e.preventDefault();await signInWithEmailAndPassword(auth,log.email.value,log.password.value);location.href='index.html'};
