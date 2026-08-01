(function () {
  'use strict';

  var CARD_SELECTOR = '.as-mobile-install-card, .as-install-home-card';
  var LEGACY_MARKERS = [
    'AutoStyle как приложение',
    'Быстрый запуск магазина с экрана телефона.',
    'Добавьте магазин на экран телефона для быстрого запуска.'
  ];

  function removeLegacyCards() {
    if (!document.querySelectorAll) return;
    document.querySelectorAll(CARD_SELECTOR).forEach(function (card) {
      card.remove();
    });
    document.querySelectorAll('[data-install-dismiss]').forEach(function (node) {
      var card = node.closest && node.closest(CARD_SELECTOR);
      if (card) card.remove();
      else node.remove();
    });
  }

  function clearLegacySnapshots() {
    [window.localStorage, window.sessionStorage].forEach(function (store) {
      try {
        Object.keys(store).forEach(function (key) {
          if (key.indexOf('as_mobile_page_cache:') !== 0) return;
          var value = store.getItem(key) || '';
          if (LEGACY_MARKERS.some(function (marker) { return value.indexOf(marker) !== -1; })) {
            store.removeItem(key);
          }
        });
      } catch (_) {}
    });
  }

  function start() {
    clearLegacySnapshots();
    removeLegacyCards();

    if (document.documentElement && window.MutationObserver) {
      new MutationObserver(removeLegacyCards).observe(document.documentElement, {
        childList: true,
        subtree: true
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();