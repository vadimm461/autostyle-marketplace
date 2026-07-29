(function(){
  'use strict';

  const ICONS = {
    catalog: 'menu', menu: 'menu', search: 'search', account: 'user', profile: 'user', user: 'user',
    notify: 'bell', notifications: 'bell', favorites: 'heart', favorite: 'heart', cart: 'cart',
    home: 'home', close: 'close', orders: 'package', card: 'card', photo: 'image', settings: 'settings'
  };

  function icon(name, cls){
    const s = document.createElement('span');
    s.className = cls || 'as-file-icon';
    s.setAttribute('aria-hidden','true');
    s.dataset.icon = name;
    s.style.setProperty('--as-icon-url', 'url("assets/icons/' + name + '.svg")');
    return s;
  }

  function cleanText(el){
    return (el.textContent || '')
      .replace(/[☰⌂▦●♡♥❤❤️🔔👤🛒🔍📦🎁⚙️🌐🖼️🗂️🧾×]/g,'')
      .replace(/\s+/g,' ')
      .trim();
  }

  function classify(el){
    const t = cleanText(el).toLowerCase();
    const href = (el.getAttribute('href') || '').toLowerCase();
    const id = (el.id || '').toLowerCase();
    const cls = (el.className || '').toString().toLowerCase();
    if (cls.includes('catalog') || t.includes('каталог')) return 'menu';
    if (id.includes('search') || cls.includes('search') || t === 'найти') return 'search';
    if (id.includes('notify') || cls.includes('notify') || t.includes('уведом')) return 'bell';
    if (href.includes('favorite') || t.includes('избран')) return 'heart';
    if (href.includes('cart') || id.includes('cart') || t.includes('корзин')) return 'cart';
    if (href.includes('profile') || id.includes('account') || id.includes('auth') || t.includes('аккаунт') || t.includes('профиль')) return 'user';
    if (t.includes('скидоч')) return 'card';
    if (t.includes('заказ')) return 'package';
    return '';
  }

  function setIcon(el, name){
    if (!name) return;
    const oldText = cleanText(el) || (name === 'menu' ? 'Каталог' : '');
    const badges = Array.from(el.querySelectorAll('b, .as-head-badge, .as-nav-count, [data-as-cart-count], [data-as-fav-count], [data-as-notify-count]'));
    el.querySelectorAll('.as-head-icon,.as-nav-icon,.as-file-icon,.as-ico').forEach(n => n.remove());
    const span = icon(name, el.classList.contains('as-nav-icon-btn') ? 'as-nav-icon as-file-icon' : 'as-head-icon as-file-icon');
    el.insertBefore(span, el.firstChild);
    const labelClass = el.classList.contains('as-nav-icon-btn') ? '' : 'as-head-label';
    if (!el.querySelector('.as-head-label') && oldText && el.tagName !== 'INPUT') {
      const label = document.createElement('span');
      if (labelClass) label.className = labelClass;
      label.textContent = oldText;
      el.appendChild(label);
    }
    badges.forEach(b => el.appendChild(b));
  }

  function fixHeader(){
    document.querySelectorAll('header a, header button, .header a, .header button, .site-header a, .site-header button, .topbar a, .topbar button, .main-header a, .main-header button').forEach(el => {
      if (el.closest('form') && !classify(el)) return;
      const name = classify(el);
      if (name) setIcon(el, name);
    });
  }

  function fixAccountMenus(){
    document.querySelectorAll('.as-account-menu-link, #accountDrop a, .drop a, .account-menu a').forEach(el => {
      const name = classify(el);
      if (name) setIcon(el, name);
    });
  }

  function fixProductIcons(){
    document.querySelectorAll('.fav-btn, .product-fav-btn, .related-fav').forEach(el => setIcon(el, 'heart'));
  }

  function forceDarkProfileBottomNav(){
    if (!document.body || !document.body.classList.contains('mobile-page')) return;
    const nav = document.querySelector('.m-bottom-nav');
    const inner = nav && nav.querySelector('.m-bottom-inner');
    if (!nav || !inner) return;

    nav.style.setProperty('background', 'linear-gradient(180deg,rgba(13,18,26,.94),rgba(5,8,14,.92))', 'important');
    nav.style.setProperty('background-color', '#090d14', 'important');
    nav.style.setProperty('border', '1px solid rgba(255,255,255,.13)', 'important');
    nav.style.setProperty('box-shadow', '0 18px 48px rgba(0,0,0,.30), inset 0 1px 0 rgba(255,255,255,.12)', 'important');
    nav.style.setProperty('-webkit-backdrop-filter', 'blur(24px) saturate(170%)', 'important');
    nav.style.setProperty('backdrop-filter', 'blur(24px) saturate(170%)', 'important');

    inner.style.setProperty('background', 'transparent', 'important');
    inner.querySelectorAll(':scope > a').forEach(link => {
      link.style.setProperty('background', link.classList.contains('active') ? 'rgba(40,225,26,.13)' : 'transparent', 'important');
      link.style.setProperty('box-shadow', link.classList.contains('active') ? 'inset 0 0 0 1px rgba(40,225,26,.16),0 6px 18px rgba(0,0,0,.14)' : 'none', 'important');
      link.style.setProperty('color', link.classList.contains('active') ? '#62f257' : 'rgba(255,255,255,.72)', 'important');
    });

    inner.querySelectorAll('.as-liquid-drop').forEach(el => el.remove());
  }

  function init(){
    fixHeader();
    fixAccountMenus();
    fixProductIcons();
    forceDarkProfileBottomNav();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.addEventListener('load', () => { init(); setTimeout(init, 250); setTimeout(init, 1000); }, {once:true});
  document.addEventListener('click', () => setTimeout(init, 80), true);
  const mo = new MutationObserver(() => {
    clearTimeout(window.__asMinimalFileIconsTimer);
    window.__asMinimalFileIconsTimer = setTimeout(init, 80);
  });
  mo.observe(document.documentElement, {childList:true, subtree:true, attributes:true, attributeFilter:['class','style']});
})();