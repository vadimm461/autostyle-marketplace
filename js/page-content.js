import { db, COLLECTIONS } from './firebase.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

function renderText(container, value) {
  if (!container) return;
  container.replaceChildren();
  if (!String(value || '').trim()) return;
  String(value).split(/\n+/).map(line => line.trim()).filter(Boolean).forEach(line => {
    const paragraph = document.createElement('p');
    paragraph.textContent = line;
    container.appendChild(paragraph);
  });
}

async function applyPage(key, root) {
  if (!root) return;
  try {
    const snap = await getDoc(doc(db, COLLECTIONS.pages || 'autostyle_pages', key));
    if (!snap.exists()) return;
    const data = snap.data();
    const title = root.querySelector('[data-page-title]');
    if (title && data.title) title.textContent = data.title;
    renderText(root.querySelector('[data-page-content]'), data.content);
  } catch (error) {
    console.warn(`Не удалось загрузить страницу ${key}`, error);
  }
}

document.querySelectorAll('[data-admin-page]').forEach(root => applyPage(root.dataset.adminPage, root));
