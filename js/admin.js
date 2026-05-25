import { db } from './firebase.js';
import { collection, addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
const form = document.getElementById('productForm');
if(form){form.addEventListener('submit', async e=>{e.preventDefault();await addDoc(collection(db,'products'),{title:title.value,price:Number(price.value),category:category.value,description:description.value,imageUrl:imageUrl.value,createdAt:serverTimestamp(),inStock:true});alert('Товар сохранён');form.reset();});}
