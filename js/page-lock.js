// AutoStyle page lock for popups/modals/catalog

let savedScrollY = 0;

function lockPage(type = 'popup-open') {
  if (document.body.classList.contains('page-locked')) return;

  savedScrollY = window.scrollY || document.documentElement.scrollTop || 0;

  document.documentElement.classList.add('page-locked');
  document.body.classList.add('page-locked', type);
  document.body.style.top = `-${savedScrollY}px`;
}

function unlockPage() {
  document.documentElement.classList.remove('page-locked');
  document.body.classList.remove('page-locked', 'popup-open', 'modal-open', 'catalog-open');
  document.body.style.top = '';

  window.scrollTo(0, savedScrollY || 0);
}

function setupCatalogLock() {
  const menu = document.querySelector('.catalog-menu');
  const btn = document.querySelector('.catalog-btn');
  const dim = document.querySelector('.page-dim');

  if (!btn) return;

  let openedByClick = false;

  function openCatalog() {
    openedByClick = true;
    document.body.classList.add('catalog-open');
    lockPage('catalog-open');
  }

  function closeCatalog() {
    openedByClick = false;
    document.body.classList.remove('catalog-open');
    unlockPage();
  }

  btn.addEventListener('click', (e) => {
    if (window.innerWidth <= 820 && menu) {
      e.preventDefault();

      if (openedByClick) closeCatalog();
      else openCatalog();
    }
  });

  if (menu) {
    menu.addEventListener('mouseenter', () => {
      if (window.innerWidth > 820) document.body.classList.add('catalog-open');
    });

    menu.addEventListener('mouseleave', () => {
      if (window.innerWidth > 820) document.body.classList.remove('catalog-open');
    });
  }

  if (dim) {
    dim.addEventListener('click', () => {
      closeCatalog();
      closeAllModals();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeCatalog();
      closeAllModals();
    }
  });
}

function setupModalLock() {
  const modal = document.querySelector('#authModal');
  const openBtn = document.querySelector('#openAuth');
  const closeBtn = document.querySelector('#closeAuth');

  if (!modal) return;

  if (openBtn) {
    openBtn.addEventListener('click', () => {
      document.body.classList.add('modal-open');
      lockPage('modal-open');
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      document.body.classList.remove('modal-open');
      unlockPage();
    });
  }

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('open');
      document.body.classList.remove('modal-open');
      unlockPage();
    }
  });
}

function closeAllModals() {
  document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
  document.body.classList.remove('modal-open');
  unlockPage();
}

document.addEventListener('DOMContentLoaded', () => {
  setupCatalogLock();
  setupModalLock();
});
