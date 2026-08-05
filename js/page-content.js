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

function setState(root, state) {
  root.dataset.pageState = state;
  root.setAttribute('aria-busy', state === 'loading' ? 'true' : 'false');
}

function renderLoadError(root) {
  renderText(
    root.querySelector('[data-page-content]'),
    'Не удалось загрузить актуальные данные. Обновите страницу.'
  );
}

async function applyPage(key, root, firebase) {
  if (!root) return;
  setState(root, 'loading');

  try {
    const { db, collectionName, doc, getDoc } = firebase;
    const snap = await getDoc(doc(db, collectionName, key));
    if (!snap.exists()) {
      renderText(
        root.querySelector('[data-page-content]'),
        'Информация пока не заполнена.'
      );
      setState(root, 'empty');
      return;
    }

    const data = snap.data();
    const title = root.querySelector('[data-page-title]');
    if (title && data.title) title.textContent = data.title;
    renderText(root.querySelector('[data-page-content]'), data.content);
    setState(root, 'ready');
  } catch (error) {
    console.warn(`Не удалось загрузить страницу ${key}`, error);
    renderLoadError(root);
    setState(root, 'error');
  }
}

const pageRoots = Array.from(document.querySelectorAll('[data-admin-page]'));
pageRoots.forEach(root => setState(root, 'loading'));

Promise.all([
  import('./firebase.js'),
  import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js')
]).then(([firebaseModule, firestoreModule]) => {
  const firebase = {
    db: firebaseModule.db,
    collectionName: firebaseModule.COLLECTIONS.pages || 'autostyle_pages',
    doc: firestoreModule.doc,
    getDoc: firestoreModule.getDoc
  };

  return Promise.all(pageRoots.map(root =>
    applyPage(root.dataset.adminPage, root, firebase)
  ));
}).catch(error => {
  console.warn('Не удалось подключить загрузку информационных страниц', error);
  pageRoots.forEach(root => {
    renderLoadError(root);
    setState(root, 'error');
  });
});
