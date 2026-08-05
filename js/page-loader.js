(function () {
  'use strict';

  var loaderId = 'asPageLoader';
  var hideTimer = 0;
  var safetyTimer = 0;
  var boundsFrame = 0;
  var dataPages = new Set([
    '',
    'index.html',
    'catalog.html',
    'product.html',
    'cart.html',
    'favorites.html',
    'profile.html'
  ]);

  function currentPage() {
    return String(window.location.pathname.split('/').pop() || '').toLowerCase();
  }

  function syncBounds() {
    var root = document.documentElement;
    var header = document.querySelector('header.topbar, .topbar');
    var top = 0;

    if (header) {
      var headerRect = header.getBoundingClientRect();
      top = Math.max(0, Math.round(headerRect.bottom));
    }

    var bottom = 0;
    var bottomNav = document.querySelector('.app-bottom-nav');
    if (bottomNav) {
      var navRect = bottomNav.getBoundingClientRect();
      if (navRect.top < window.innerHeight && navRect.bottom > 0) {
        bottom = Math.max(0, Math.round(window.innerHeight - navRect.top));
      }
    }

    root.style.setProperty('--as-loader-top', top + 'px');
    root.style.setProperty('--as-loader-bottom', bottom + 'px');
  }

  function scheduleBoundsSync() {
    window.cancelAnimationFrame(boundsFrame);
    boundsFrame = window.requestAnimationFrame(syncBounds);
  }

  function create() {
    var existing = document.getElementById(loaderId);
    if (existing) return existing;
    if (!document.body) return null;

    var loader = document.createElement('div');
    loader.id = loaderId;
    loader.className = 'as-page-loader';
    loader.setAttribute('role', 'status');
    loader.setAttribute('aria-live', 'polite');
    loader.setAttribute('aria-label', 'Загрузка AutoStyle');
    loader.innerHTML =
      '<div class="as-loader-card">' +
        '<img class="as-loader-logo" src="assets/autostyle-logo-header-clean@2x.png" width="720" height="158" alt="">' +
        '<span class="as-loader-line" aria-hidden="true"><i></i></span>' +
        '<span class="as-loader-text">Загружаем актуальные данные</span>' +
      '</div>';

    document.body.classList.add('as-loading');
    document.body.prepend(loader);
    syncBounds();
    scheduleBoundsSync();
    return loader;
  }

  function remove(loader) {
    if (!loader || !loader.parentNode) return;
    loader.parentNode.removeChild(loader);
  }

  function hide() {
    window.clearTimeout(safetyTimer);
    window.clearTimeout(hideTimer);
    document.body && document.body.classList.remove('as-loading');

    var loader = document.getElementById(loaderId);
    if (!loader || loader.classList.contains('is-leaving')) return;

    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        loader.classList.add('is-leaving');
        hideTimer = window.setTimeout(function () { remove(loader); }, 220);
      });
    });
  }

  function show() {
    window.clearTimeout(hideTimer);
    var loader = create();
    if (!loader) return;
    loader.classList.remove('is-leaving');
    document.body.classList.add('as-loading');
    scheduleBoundsSync();
    window.clearTimeout(safetyTimer);
    // Never let a Firebase/network failure leave the site blocked.
    safetyTimer = window.setTimeout(hide, 10000);
  }

  window.AutoStyleLoader = {
    hide: hide,
    show: show,
    isActive: function () { return Boolean(document.getElementById(loaderId)); }
  };

  if (dataPages.has(currentPage())) show();

  document.addEventListener('DOMContentLoaded', scheduleBoundsSync, { once: true });
  window.addEventListener('resize', scheduleBoundsSync, { passive: true });

  // Back/forward cache already contains a rendered page, so no loader is needed.
  window.addEventListener('pageshow', function (event) {
    if (event.persisted) hide();
  });
})();