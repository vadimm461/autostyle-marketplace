// AutoStyle hard page lock + anti horizontal shift

(function () {
  let savedScrollY = 0;

  function lockPage(type) {
    savedScrollY = window.scrollY || document.documentElement.scrollTop || 0;

    document.documentElement.classList.add('page-locked');
    document.body.classList.add('page-locked', type || 'popup-open');
    document.body.style.top = '-' + savedScrollY + 'px';
  }

  function unlockPage() {
    document.documentElement.classList.remove('page-locked');
    document.body.classList.remove('page-locked', 'popup-open', 'modal-open', 'catalog-open');
    document.body.style.top = '';
    window.scrollTo(0, savedScrollY || 0);
  }

  function resetHorizontal() {
    if (window.scrollX !== 0) window.scrollTo(0, window.scrollY);
    document.documentElement.scrollLeft = 0;
    document.body.scrollLeft = 0;
  }

  window.addEventListener('scroll', resetHorizontal, { passive: true });
  window.addEventListener('resize', resetHorizontal);

  document.addEventListener('click', function (e) {
    const tab = e.target.closest('.product-tab');
    if (tab) {
      setTimeout(resetHorizontal, 0);
      setTimeout(resetHorizontal, 80);
      setTimeout(resetHorizontal, 250);
    }
  });

  document.addEventListener('DOMContentLoaded', function () {
    resetHorizontal();

    const btn = document.querySelector('.catalog-btn');
    const menu = document.querySelector('.catalog-menu');
    const dim = document.querySelector('.page-dim');
    const modal = document.querySelector('#authModal');
    const openAuth = document.querySelector('#openAuth');
    const closeAuth = document.querySelector('#closeAuth');

    let catalogOpen = false;

    function openCatalog() {
      catalogOpen = true;
      document.body.classList.add('catalog-open');
      lockPage('catalog-open');
    }

    function closeCatalog() {
      catalogOpen = false;
      document.body.classList.remove('catalog-open');
      unlockPage();
    }

    if (btn && menu) {
      btn.addEventListener('click', function (e) {
        if (window.innerWidth <= 820) {
          e.preventDefault();
          catalogOpen ? closeCatalog() : openCatalog();
        }
      });
    }

    if (openAuth) {
      openAuth.addEventListener('click', function () {
        lockPage('modal-open');
      });
    }

    if (closeAuth) {
      closeAuth.addEventListener('click', function () {
        unlockPage();
      });
    }

    if (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target === modal) unlockPage();
      });
    }

    if (dim) {
      dim.addEventListener('click', function () {
        closeCatalog();
        document.querySelectorAll('.modal.open').forEach(function (m) {
          m.classList.remove('open');
        });
        unlockPage();
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeCatalog();
        unlockPage();
      }
    });
  });
})();
