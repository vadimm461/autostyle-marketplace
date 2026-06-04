import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';

import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

import { getStorage } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';

const firebaseConfig = {
  apiKey: 'AIzaSyBZ-AW6XoMR14KmBtlz2q06Z0jPGXnWMTw',
  authDomain: 'auto-style-4dbb7.firebaseapp.com',
  projectId: 'auto-style-4dbb7',

  /* ВАЖНО */
  storageBucket: 'auto-style-4dbb7.firebasestorage.app',

  messagingSenderId: '217023127803',
  appId: '1:217023127803:web:502ebd5d1981c8aeb0905e'
};

export const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

export const db = getFirestore(app);

export const storage = getStorage(app);

export const COLLECTIONS = {
  users: 'autostyle_users',
  products: 'autostyle_products',
  categories: 'autostyle_categories',
  banners: 'autostyle_banners',
  settings: 'autostyle_settings',
  pages: 'autostyle_pages',
  media: 'autostyle_media',
  homeBlocks: 'autostyle_home_blocks',
  promoCards: 'autostyle_promo_cards',
  orders: 'autostyle_orders'
};
