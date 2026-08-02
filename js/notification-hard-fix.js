(function(){
  'use strict';

  // This file is deliberately standalone and loaded with a new URL on both
  // notification pages. It repairs pages that were opened from an older
  // three-day cache before the notification sanitizer was available.
  const VERSION = '20260730-notification-detail-v19';

  try {
    const file = (location.pathname.split('/').pop() || '').toLowerCase();
    if (file === 'notifications.html' || file === 'mobile-notifications.html') {
      window.__AS_NOTIFICATION_LAYOUT = file === 'mobile-notifications.html' ? 'mobile' : 'desktop';
      document.documentElement.setAttribute('data-as-notification-page', window.__AS_NOTIFICATION_LAYOUT);
    }
  } catch (_) {}

  function cleanBody(body){
    if (!body) return;
    body.dataset.asNotificationHardClean = '1';

    body.querySelectorAll('script,style,link,meta,base,iframe,object,embed,form,input,button,select,textarea,option,video,audio,canvas,svg').forEach(node => node.remove());
    body.querySelectorAll('*').forEach(node => {
      [...node.attributes].forEach(attribute => {
        const name = attribute.name.toLowerCase();
        if (name.startsWith('on')) node.removeAttribute(attribute.name);
      });
      if (node.hasAttribute('style')) {
        node.style.removeProperty('position');
        node.style.removeProperty('inset');
        node.style.removeProperty('top');
        node.style.removeProperty('right');
        node.style.removeProperty('bottom');
        node.style.removeProperty('left');
        node.style.removeProperty('z-index');
        node.style.removeProperty('pointer-events');
        node.style.removeProperty('transform');
      }
    });
  }

  function cleanNotificationBodies(){
    document.querySelectorAll('.as-notify-detail-body,.m-notification-body').forEach(cleanBody);
  }

  function removeBlockingLoaders(){
    document.getElementById('mLoader')?.remove();
    document.getElementById('asPageLoader')?.remove();
    document.body?.classList.remove('as-loading');
  }

  function clearStaleInteractionLocks(){
    const body = document.body;
    document.documentElement?.classList.remove('page-locked');
    body?.classList.remove('page-locked', 'popup-open', 'modal-open', 'catalog-open');
    if (body) body.style.removeProperty('pointer-events');

    document.querySelectorAll(
      '.as-alert-backdrop:not(.show), .modal:not(.open):not(.show), ' +
      '.page-dim:not(.active), .catalog-overlay:not(.active), ' +
      '.catalog-popup:not(.active), .mega-catalog:not(.active), .catalog-dropdown:not(.active)'
    ).forEach(node => {
      node.style.setProperty('display', 'none', 'important');
      node.style.setProperty('pointer-events', 'none', 'important');
    });
  }

  function neutralizeUnexpectedViewportLayers(){
    // Notification HTML is user-authored content. If an older cached render
    // or an unsupported element still creates a fixed/absolute layer, it must
    // never sit above the shared header or navigation.
    const width = window.innerWidth || document.documentElement.clientWidth || 0;
    const height = window.innerHeight || document.documentElement.clientHeight || 0;
    if (!width || !height) return;
    document.body?.querySelectorAll('*').forEach(node => {
      if (node.matches(
        'header.topbar, .m-top, .m-bottom-nav, .m-bottom-inner, ' +
        '.as-notify-dropdown, .as-account-popup, .as-alert-backdrop.show, ' +
        '#asHeaderNotifyDropdown'
      )) return;
      const style = getComputedStyle(node);
      if (!['fixed', 'absolute'].includes(style.position) || style.display === 'none' || style.visibility === 'hidden') return;
      const rect = node.getBoundingClientRect();
      const coversViewport = rect.width >= width * 0.85 && rect.height >= height * 0.65 && rect.left <= width * 0.15 && rect.top <= height * 0.35;
      if (!coversViewport) return;
      node.style.setProperty('display', 'none', 'important');
      node.style.setProperty('pointer-events', 'none', 'important');
    });
  }

  function bindSearchFallback(){
    document.querySelectorAll('.search,.m-search').forEach(form => {
      if (form.dataset.asNotificationSearchReady === '1') return;
      form.dataset.asNotificationSearchReady = '1';
      const input = form.querySelector('input');
      const go = event => {
        event?.preventDefault();
        const query = String(input?.value || '').trim();
        const mobile = window.__AS_NOTIFICATION_LAYOUT === 'mobile' || document.body?.classList.contains('mobile-page');
        const target = mobile ? 'mobile-catalog.html' : 'catalog.html';
        location.href = query ? `${target}?search=${encodeURIComponent(query)}` : target;
      };
      form.addEventListener('submit', go);
      form.querySelector('button')?.addEventListener('click', go);
    });
  }

  function installGuardStyle(){
    if (document.getElementById('as-notification-hard-fix-style')) return;
    const style = document.createElement('style');
    style.id = 'as-notification-hard-fix-style';
    style.textContent = `
      html[data-as-notification-page] #notificationsPage,
      html[data-as-notification-page] #mMobileNotifications,
      html[data-as-notification-page] .m-content{position:relative!important;z-index:1!important;pointer-events:auto!important}
      html[data-as-notification-page] .as-notify-detail-body *,
      html[data-as-notification-page] .m-notification-body *{position:static!important;inset:auto!important;top:auto!important;right:auto!important;bottom:auto!important;left:auto!important;z-index:auto!important;transform:none!important;pointer-events:auto!important;max-width:100%!important}
      html[data-as-notification-page] .as-notify-back,
      html[data-as-notification-page] .as-notify-link,
      html[data-as-notification-page] .m-notification-back,
      html[data-as-notification-page] .m-notification-action a{position:relative!important;z-index:4!important;pointer-events:auto!important;touch-action:manipulation!important}
      html[data-as-notification-page] .m-top{z-index:100!important;pointer-events:auto!important}
      html[data-as-notification-page] .m-bottom-inner,
      html[data-as-notification-page] .m-bottom-inner a{position:relative!important;z-index:101!important;pointer-events:auto!important}
      html[data-as-notification-page] .as-alert-backdrop:not(.show),
      html[data-as-notification-page] .modal:not(.open):not(.show),
      html[data-as-notification-page] .page-dim{pointer-events:none!important;display:none!important}
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function start(){
    installGuardStyle();
    removeBlockingLoaders();
    clearStaleInteractionLocks();
    bindSearchFallback();
    cleanNotificationBodies();
    neutralizeUnexpectedViewportLayers();
    if (document.body && !window.__AS_NOTIFICATION_HARD_OBSERVER) {
      window.__AS_NOTIFICATION_HARD_OBSERVER = new MutationObserver(() => {
        cleanNotificationBodies();
        clearStaleInteractionLocks();
        neutralizeUnexpectedViewportLayers();
      });
      window.__AS_NOTIFICATION_HARD_OBSERVER.observe(document.body, { childList:true, subtree:true });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
  window.addEventListener('pageshow', start, { passive:true });
  document.addEventListener('click', clearStaleInteractionLocks, true);
  window.addEventListener('load', removeBlockingLoaders, { once:true, passive:true });

  // Force the current worker to be checked even when the notification page
  // itself came from an older page cache.
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(`./sw.js?as=${VERSION}`, { scope:'./', updateViaCache:'none' })
        .then(registration => registration.update().catch(() => {}))
        .catch(() => {});
    }, { once:true });
  }
})();
