
(function () {
  'use strict';

  var deferredPrompt = null;
  var activeTab = 'ios';

  function qs(selector) {
    return document.querySelector(selector);
  }

  function isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function isAndroid() {
    return /android/i.test(navigator.userAgent);
  }

  function selectTab(tabName) {
    activeTab = tabName;
    document.querySelectorAll('[data-install-tab]').forEach(function (button) {
      var selected = button.getAttribute('data-install-tab') === tabName;
      button.setAttribute('aria-selected', selected ? 'true' : 'false');
    });
    document.querySelectorAll('[data-install-panel]').forEach(function (panel) {
      panel.hidden = panel.getAttribute('data-install-panel') !== tabName;
    });
  }

  function updateInstallButton() {
    var button = qs('#asPrimaryInstall');
    var status = qs('#asInstallStatus');
    if (!button) return;

    if (deferredPrompt) {
      button.textContent = 'Установить приложение';
      button.dataset.mode = 'native';
      if (status) status.textContent = 'Браузер готов предложить установку AutoStyle.';
      return;
    }

    if (isIOS()) {
      button.textContent = 'Как установить на iPhone';
      button.dataset.mode = 'ios';
      if (status) status.textContent = 'На iPhone установка выполняется через меню «Поделиться» в Safari.';
      return;
    }

    if (isAndroid()) {
      button.textContent = 'Показать инструкцию Android';
      button.dataset.mode = 'android';
      if (status) status.textContent = 'Если кнопка установки не появилась, используйте меню Chrome ⋮.';
      return;
    }

    button.textContent = 'Показать QR-код';
    button.dataset.mode = 'qr';
    if (status) status.textContent = 'Откройте QR-код камерой телефона, чтобы перейти на auto-style.md.';
  }

  async function requestInstall() {
    var button = qs('#asPrimaryInstall');
    var status = qs('#asInstallStatus');
    var mode = button && button.dataset.mode;

    if (mode === 'native' && deferredPrompt) {
      deferredPrompt.prompt();
      var choice = await deferredPrompt.userChoice;
      deferredPrompt = null;
      if (status) {
        status.textContent = choice && choice.outcome === 'accepted'
          ? 'AutoStyle добавляется на главный экран.'
          : 'Установка отменена. Инструкцию можно открыть ниже.';
      }
      updateInstallButton();
      return;
    }

    if (mode === 'ios') {
      selectTab('ios');
      qs('#asInstallGuide')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    if (mode === 'android') {
      selectTab('android');
      qs('#asInstallGuide')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    selectTab('qr');
    qs('#asInstallGuide')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var defaultTab = isAndroid() ? 'android' : (isIOS() ? 'ios' : 'qr');
    selectTab(defaultTab);
    updateInstallButton();

    document.querySelectorAll('[data-install-tab]').forEach(function (button) {
      button.addEventListener('click', function () {
        selectTab(button.getAttribute('data-install-tab'));
      });
    });

    var primary = qs('#asPrimaryInstall');
    if (primary) primary.addEventListener('click', requestInstall);

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' })
          .then(function (registration) { return registration.update().catch(function () {}); })
          .catch(function () {});
      }, { once: true });
    }
  });

  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault();
    deferredPrompt = event;
    updateInstallButton();
  });

  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    var status = qs('#asInstallStatus');
    if (status) status.textContent = 'Готово — AutoStyle установлено на устройство.';
    updateInstallButton();
  });
})();
