import { db, COLLECTIONS } from './firebase.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const cart = JSON.parse(localStorage.getItem('cart') || '[]');
const cartCount = document.querySelector('#cartCount');
if (cartCount) cartCount.textContent = cart.length;

const input = document.querySelector('#siteSearch');
const btn = document.querySelector('#siteSearchBtn');

function goSearch() {
  const q = encodeURIComponent((input?.value || '').trim());
  location.href = q ? `catalog.html?search=${q}` : 'catalog.html';
}

if (btn) btn.onclick = goSearch;
if (input) input.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    goSearch();
  }
});

const pageMap = {
  'contacts.html': 'contacts',
  'about.html': 'about',
  'installment.html': 'installment',
  'certificates.html': 'certificates'
};

function paragraphsToHtml(value) {
  return String(value || '')
    .split(/\n{2,}/)
    .map(block => `<p>${block.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

async function loadEditablePage() {
  const file = location.pathname.split('/').pop() || 'index.html';
  const key = pageMap[file];
  if (!key) return;

  try {
    const snap = await getDoc(doc(db, COLLECTIONS.pages, key));
    if (!snap.exists()) return;

    const data = snap.data();
    const main = document.querySelector('main.page-simple');
    if (!main) return;

    if (data.title) {
      document.title = `${data.title} — AutoStyle`;
      const h1 = main.querySelector('h1');
      if (h1) h1.textContent = data.title;
    }

    if (data.content) {
      const target = main.querySelector('.info-card') || main.querySelector('.info-grid') || main;
      target.innerHTML = data.content.includes('<')
        ? data.content
        : paragraphsToHtml(data.content);
    }
  } catch (error) {
    console.warn('Не удалось загрузить редактируемую страницу', error);
  }
}

loadEditablePage();
