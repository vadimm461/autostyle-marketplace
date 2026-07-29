(function(){
  'use strict';

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function(){
      navigator.serviceWorker.register('./service-worker.js', { scope:'./', updateViaCache:'none' })
        .then(function(registration){ return registration.update().catch(function(){}); })
        .catch(function(error){ console.warn('AutoStyle mobile cache worker:', error); });
    }, { once:true });
  }

  const VERSION = '20260729-global-nav-unified';
  const MAX_AGE = 1000 * 60 * 3;
  const page = document.body?.dataset?.page || location.pathname.split('/').pop().replace('.html','') || 'mobile';
  const profilePages = new Set(['profile','profile-data','orders','notifications','discount-card','feedback']);
  const sensitivePage = profilePages.has(page);
  const storage = sensitivePage ? sessionStorage : localStorage;
  const keyBase = 'as_mobile_page_cache:' + VERSION + ':' + location.pathname.split('/').pop() + location.search;
  const scrollKey = keyBase + ':scroll';
  const skip = new Set(['cart']);
  const contentSelector = '.m-content';

  const NAV_ICONS = {
    home:'<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V21h13V10.5"/><path d="M9.5 21v-6h5v6"/></svg>',
    catalog:'<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14"/></svg>',
    fav:'<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.8 4.9a5.5 5.5 0 0 0-7.8 0L12 5.9l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.3 1-1a5.5 5.5 0 0 0 0-7.8Z"/></svg>',
    cart:'<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 2-1.6L21 7H6"/><circle cx="9.5" cy="20" r="1.2"/><circle cx="17.5" cy="20" r="1.2"/></svg>',
    profile:'<svg viewBox="0 0 24 24" width="29" height="29" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="7.5" r="3.5"/><path d="M5.5 21v-2.2a6.5 6.5 0 0 1 13 0V21"/></svg>'
  };

  function now(){ return Date.now(); }
  function canCache(){ return !skip.has(page) && !!document.querySelector(contentSelector); }
  function read(){
    try { return JSON.parse(storage.getItem(keyBase) || 'null'); } catch(e){ return null; }
  }
  function write(){
    if(!canCache()) return;
    const node = document.querySelector(contentSelector);
    if(!node || !node.innerHTML.trim()) return;
    const html = node.innerHTML;
    if(html.length < 30 || html.includes('m-loader') || html.includes('Загружаем...')) return;
    try{
      storage.setItem(keyBase, JSON.stringify({ t: now(), page, title: document.title, html }));
      storage.setItem(scrollKey, String(window.scrollY || 0));
    }catch(e){
      Object.keys(storage).filter(k=>k.startsWith('as_mobile_page_cache:')).slice(0,20).forEach(k=>storage.removeItem(k));
    }
  }
  function restore(){
    if(!canCache()) return;
    const data = read();
    if(!data || !data.html || (now() - Number(data.t||0)) > MAX_AGE) return;
    const node = document.querySelector(contentSelector);
    if(!node) return;
    const hasUsefulContent = node.textContent.trim().length > 20 && !node.querySelector('#mHero,#mHomeDynamic,#mCatalogGrid,#mCartList,#mProduct,#mProfileBox');
    if(!hasUsefulContent){
      node.classList.add('m-cache-restored');
      node.innerHTML = data.html;
      document.documentElement.classList.add('as-mobile-cache-visible');
      const loader = document.getElementById('mLoader');
      if(loader) loader.remove();
      const y = Number(storage.getItem(scrollKey) || 0);
      if(y > 0) setTimeout(()=>window.scrollTo(0, y), 40);
    }
  }
  function prefetchProfilePages(){
    const pages = [
      'mobile-profile-data.html',
      'mobile-discount-card.html',
      'mobile-orders.html',
      'mobile-notifications.html',
      'mobile-feedback.html'
    ];
    const current = location.pathname.split('/').pop();
    pages.filter(url=>url !== current).forEach(url=>{
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.as = 'document';
      link.href = url;
      document.head.appendChild(link);
    });
  }
  function warmOnTouch(){
    document.addEventListener('touchstart', event=>{
      const anchor = event.target.closest('.m-profile-inner-nav a[href]');
      if(!anchor) return;
      const href = anchor.getAttribute('href');
      if(!href) return;
      fetch(href, { credentials:'same-origin', cache:'force-cache' }).catch(()=>{});
    }, { passive:true });
  }
  function unifyBottomNavigation(){
    const nav = document.querySelector('.m-bottom-inner');
    if(!nav) return;
    const items = [
      ['home','Главная'],
      ['catalog','Каталог'],
      ['fav','Избранное'],
      ['cart','Корзина'],
      ['profile','Профиль']
    ];
    const links = nav.querySelectorAll(':scope > a');
    links.forEach((link,index)=>{
      const item = items[index];
      if(!item) return;
      const key = item[0];
      if(link.dataset.asUnifiedIcon === key) return;
      const label = link.querySelector('span');
      Array.from(link.childNodes).forEach(node=>{
        if(node.nodeType === Node.TEXT_NODE) node.remove();
        if(node.nodeType === Node.ELEMENT_NODE && node.classList?.contains('as-nav-icon')) node.remove();
      });
      const icon = document.createElement('span');
      icon.className = 'as-nav-icon';
      icon.setAttribute('aria-hidden','true');
      icon.innerHTML = NAV_ICONS[key];
      link.insertBefore(icon, label || link.firstChild);
      link.dataset.asUnifiedIcon = key;
      link.style.display = 'flex';
      link.style.flexDirection = 'column';
      link.style.alignItems = 'center';
      link.style.justifyContent = 'center';
      link.style.gap = '3px';
      icon.style.display = 'grid';
      icon.style.placeItems = 'center';
      icon.style.lineHeight = '0';
    });
  }
  function watchBottomNavigation(){
    unifyBottomNavigation();
    const nav = document.querySelector('.m-bottom-inner');
    if(!nav) return;
    new MutationObserver(unifyBottomNavigation).observe(nav,{childList:true,subtree:false});
  }
  function debounce(fn, wait){ let t=0; return ()=>{ clearTimeout(t); t=setTimeout(fn, wait); }; }
  const saveSoon = debounce(write, 300);
  window.AutoStyleMobilePageCache = {
    save: write,
    restore,
    clear(){
      [localStorage, sessionStorage].forEach(store=>Object.keys(store).filter(k=>k.startsWith('as_mobile_page_cache:')).forEach(k=>store.removeItem(k)));
    },
    clearCurrent(){ storage.removeItem(keyBase); storage.removeItem(scrollKey); },
    key: keyBase
  };
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', restore, { once:true });
  else restore();
  window.addEventListener('autostyle-mobile-rendered', saveSoon);
  window.addEventListener('beforeunload', write);
  window.addEventListener('pagehide', write);
  document.addEventListener('visibilitychange', ()=>{ if(document.hidden) write(); });
  const startObserve = ()=>{
    const node = document.querySelector(contentSelector);
    if(!node || !canCache()) return;
    new MutationObserver(saveSoon).observe(node, { childList:true, subtree:true, characterData:true });
  };
  const startFastProfileNavigation = ()=>{
    if(profilePages.has(page)){
      prefetchProfilePages();
      warmOnTouch();
    }
  };
  const start = ()=>{
    startObserve();
    startFastProfileNavigation();
    watchBottomNavigation();
  };
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})();