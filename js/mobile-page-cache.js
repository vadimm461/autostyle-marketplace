(function(){
  'use strict';

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function(){
      navigator.serviceWorker.register('./service-worker.js', { scope:'./', updateViaCache:'none' })
        .then(function(registration){ return registration.update().catch(function(){}); })
        .catch(function(error){ console.warn('AutoStyle mobile cache worker:', error); });
    }, { once:true });
  }

  const VERSION = '20260729-nav-duplicate-renderer-removed';
  const MAX_AGE = 1000 * 60 * 3;
  const page = document.body?.dataset?.page || location.pathname.split('/').pop().replace('.html','') || 'mobile';
  const profilePages = new Set(['profile','profile-data','orders','notifications','discount-card','feedback']);
  const sensitivePage = profilePages.has(page);
  const storage = sensitivePage ? sessionStorage : localStorage;
  const keyBase = 'as_mobile_page_cache:' + VERSION + ':' + location.pathname.split('/').pop() + location.search;
  const scrollKey = keyBase + ':scroll';
  const skip = new Set(['cart']);
  const contentSelector = '.m-content';

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
  };
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})();