import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'PASTE_API_KEY_HERE',
  authDomain: 'auto-style-4dbb7.firebaseapp.com',
  projectId: 'auto-style-4dbb7',
  storageBucket: 'auto-style-4dbb7.appspot.com',
  messagingSenderId: '217023127803',
  appId: '1:217023127803:web:502ebd5d1981c8aeb0905e'
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export const COLLECTIONS = {
  users: 'autostyle_users',
  products: 'autostyle_products',
  categories: 'autostyle_categories',
  banners: 'autostyle_banners',
  settings: 'autostyle_settings'
};
