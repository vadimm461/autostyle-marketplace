import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';

const firebaseConfig = {
  apiKey: "PASTE_YOUR_API_KEY",
  authDomain: "auto-style-4dbb7.firebaseapp.com",
  databaseURL: "https://auto-style-4dbb7-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "auto-style-4dbb7",
  storageBucket: "auto-style-4dbb7.firebasestorage.app",
  messagingSenderId: "PASTE_YOUR_SENDER_ID",
  appId: "PASTE_YOUR_APP_ID"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export const COLLECTIONS = {
  products: 'autostyle_products',
  categories: 'autostyle_categories',
  banners: 'autostyle_banners',
  users: 'autostyle_users',
  orders: 'autostyle_orders',
  pages: 'autostyle_pages',
  settings: 'autostyle_settings'
};
