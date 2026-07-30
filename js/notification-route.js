(function(){
  'use strict';

  // Notifications have two complete layouts. Keep the route consistent with
  // the viewport even when an old notification contains a mobile URL.
  const file = (location.pathname.split('/').pop() || '').toLowerCase();
  if (file !== 'notifications.html' && file !== 'mobile-notifications.html') return;

  let forceDesktop = false;
  let forceMobile = false;
  try {
    forceDesktop = sessionStorage.getItem('as_force_desktop') === '1';
    forceMobile = sessionStorage.getItem('as_force_mobile') === '1';
  } catch (_) {}

  const mobileViewport = !forceDesktop && (
    (window.matchMedia && window.matchMedia('(max-width: 768px)').matches) ||
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '')
  );

  if (file === 'notifications.html' && mobileViewport) {
    location.replace('mobile-notifications.html' + location.search + location.hash);
    return;
  }

  if (file === 'mobile-notifications.html' && !mobileViewport && !forceMobile) {
    location.replace('notifications.html' + location.search + location.hash);
  }
})();
