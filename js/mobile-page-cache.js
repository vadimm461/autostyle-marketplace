(function(){
  'use strict';

  // На мобильных страницах mobile-redirect.js не подключается, поэтому Service Worker
  // регистрируем здесь. updateViaCache:none заставляет Safari проверять свежий worker.
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function(){
      navigator.serviceWorker.register('./service-worker.js', { scope:'./', updateViaCache:'none' })
        .then(function(registration){ return registration.update().catch(function(){}); })
        .catch(function(error){ console.warn('AutoStyle mobile cache worker:', error); });
    }, { once:true });
  }

  // Один общий модуль для плавной жидкой капли нижнего меню на всех мобильных страницах.
  if (!document.querySelector('script[data-as-liquid-nav]')) {
    const liquidNav = document.createElement('script');
    liquidNav.src = './js/mobile-liquid-nav.js?v=20260729-2';
    liquidNav.defer = true;
    liquidNav.dataset.asLiquidNav = '1';
    document.head.appendChild(liquidNav);
  }

  const VERSION = '20260729-mobile-cache-v3';
  const MAX_AGE = 1000 * 60;
  const page = document.body?.dataset?.page || location.pathname.split('/').pop().replace('.html','') || 'mobile';
  const keyBase = 'as_mobile_page_cache:' + VERSION + ':' + location.pathname.split('/').pop() + location.search;
  const scrollKey = keyBase + ':scroll';
  const skip = new Set(['profile','profile-data','cart','orders','notifications','discount-card']);
  const contentSelector = '.m-content';
  function now(){ return Date.now(); }
  function canCache(){ return !skip.has(page) && !!document.querySelector(contentSelector); }
  function read(){
    try { return JSON.parse(localStorage.getItem(keyBase) || 'null'); } catch(e){ return null; }
  }
  function write(){
    if(!canCache()) return;
    const node = document.querySelector(contentSelector);
    if(!node || !node.innerHTML.trim()) return;
    const html = node.innerHTML;
    if(html.length < 30 || html.includes('m-loader')) return;
    try{
      localStorage.setItem(keyBase, JSON.stringify({ t: now(), page, title: document.title, html }));
      localStorage.setItem(scrollKey, String(window.scrollY || 0));
    }catch(e){
      Object.keys(localStorage).filter(k=>k.startsWith('as_mobile_page_cache:')).slice(0,20).forEach(k=>localStorage.removeItem(k));
    }
  }
  function restore(){
    if(!canCache()) return;
    const data = read();
    if(!data || !data.html || (now() - Number(data.t||0)) > MAX_AGE) return;
    const node = document.querySelector(contentSelector);
    if(!node) return;
    const hasUsefulContent = node.textContent.trim().length > 20 && !node.querySelector('#mHero,#mHomeDynamic,#mCatalogGrid,#mCartList,#mProduct');
    if(!hasUsefulContent){
      node.classList.add('m-cache-restored');
      node.innerHTML = data.html;
      document.documentElement.classList.add('as-mobile-cache-visible');
      const loader = document.getElementById('mLoader');
      if(loader) loader.remove();
      const y = Number(localStorage.getItem(scrollKey) || 0);
      if(y > 0) setTimeout(()=>window.scrollTo(0, y), 40);
    }
  }
  function debounce(fn, wait){ let t=0; return ()=>{ clearTimeout(t); t=setTimeout(fn, wait); }; }
  const saveSoon = debounce(write, 450);
  window.AutoStyleMobilePageCache = {
    save: write,
    restore,
    clear(){ Object.keys(localStorage).filter(k=>k.startsWith('as_mobile_page_cache:')).forEach(k=>localStorage.removeItem(k)); },
    clearCurrent(){ localStorage.removeItem(keyBase); localStorage.removeItem(scrollKey); },
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
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startObserve, { once:true });
  else startObserve();
})();