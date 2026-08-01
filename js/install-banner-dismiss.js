(function () {
  'use strict';

  var STORAGE_KEY = 'autostyle-install-banner-dismissed-v1';
  var SELECTOR = '.as-mobile-install-card, .as-install-home-card';

  function readDismissed() {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch (_) {
      return false;
    }
  }

  function hide(card) {
    card.hidden = true;
    card.setAttribute('aria-hidden', 'true');
  }

  function ensureDismissButton(card) {
    var dismiss = card.querySelector('[data-install-dismiss]');
    var primary = card.querySelector('.as-mobile-install-button, .as-install-home-button');
    if (!primary) return null;

    if (!dismiss) {
      dismiss = document.createElement('button');
      dismiss.type = 'button';
      dismiss.className = card.classList.contains('as-mobile-install-card')
        ? 'as-mobile-install-dismiss'
        : 'as-install-home-dismiss';
      dismiss.dataset.installDismiss = '1';
      dismiss.textContent = 'Больше не показывать';
    }

    var actions = primary.parentElement;
    var expectedClass = card.classList.contains('as-mobile-install-card')
      ? 'as-mobile-install-actions'
      : 'as-install-home-actions';
    if (!actions || !actions.classList.contains(expectedClass)) {
      actions = document.createElement('div');
      actions.className = expectedClass;
      primary.parentNode.insertBefore(actions, primary);
      actions.appendChild(primary);
    }
    if (dismiss.parentElement !== actions) actions.appendChild(dismiss);
    return dismiss;
  }

  function init() {
    var cards = Array.prototype.slice.call(document.querySelectorAll(SELECTOR));
    if (!cards.length) return;

    if (readDismissed()) {
      cards.forEach(hide);
      return;
    }

    cards.forEach(function (card) {
      var dismiss = ensureDismissButton(card);
      if (!dismiss) return;

      dismiss.addEventListener('click', function () {
        try {
          localStorage.setItem(STORAGE_KEY, '1');
        } catch (_) {}
        cards.forEach(hide);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
