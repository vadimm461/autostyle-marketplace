(function(){
  'use strict';

  // The two notification pages are explicit layouts. Do not redirect based on
  // viewport width here: a desktop URL must stay desktop and a mobile URL must
  // stay mobile. The old viewport redirect was the reason desktop opened the
  // mobile page on some browsers/PWA windows.
  const file = (location.pathname.split('/').pop() || '').toLowerCase();
  if (file !== 'notifications.html' && file !== 'mobile-notifications.html') return;

  window.__AS_NOTIFICATION_LAYOUT = file === 'mobile-notifications.html' ? 'mobile' : 'desktop';
  document.documentElement.setAttribute('data-as-notification-page', window.__AS_NOTIFICATION_LAYOUT);
})();
