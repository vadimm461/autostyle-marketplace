/* AutoStyle Mobile performance helpers. No Firebase/cart/auth mutations. */
(function(){
  'use strict';

  var loaderReleased=false;
  var loaderShownAt=performance.now();
  var isWarm=sessionStorage.getItem('as_mobile_splash_seen')==='1';
  var pageName=document.body&&document.body.dataset?String(document.body.dataset.page||''):'';
  var isProfilePage=pageName.indexOf('profile')===0;
  var MIN_SPLASH=isProfilePage?0:(isWarm?0:180);
  var MAX_SPLASH=isProfilePage?450:1400;
  var PROFILE_CACHE_KEY='as_mobile_profile_html_v1';

  if(isWarm) document.documentElement.classList.add('as-mobile-warm');

  function markImage(img){
    if(!img) return;
    if(img.complete && img.naturalWidth){img.classList.add('as-img-ready');return;}
    img.addEventListener('load',function(){img.classList.add('as-img-ready');},{once:true});
    img.addEventListener('error',function(){img.classList.add('as-img-ready');},{once:true});
  }

  function scanImages(root){(root||document).querySelectorAll('img').forEach(markImage);}

  function arrangeCardBadges(root){
    var scope=root&&root.querySelectorAll?root:document;
    var cards=[];
    if(scope.matches&&scope.matches('.m-card')) cards.push(scope);
    scope.querySelectorAll('.m-card').forEach(function(card){cards.push(card);});

    cards.forEach(function(card){
      var installment=card.querySelector('.m-installment');
      if(!installment||installment.closest('.as-card-badges')) return;
      var rail=card.querySelector('.as-card-badges');
      if(!rail){
        rail=document.createElement('div');
        rail.className='as-card-badges';
        card.insertBefore(rail,card.firstChild);
      }
      var discount=card.querySelector('.m-discount');
      if(discount&&!discount.closest('.as-card-badges')) rail.appendChild(discount);
      installment.classList.add('as-installment-top');
      rail.appendChild(installment);
    });
  }

  function restoreProfileShell(){
    if(!isProfilePage) return;
    var box=document.getElementById('mProfileBox');
    if(!box) return;
    try{
      var cached=sessionStorage.getItem(PROFILE_CACHE_KEY);
      if(cached){box.innerHTML=cached;box.setAttribute('data-as-cached','1');return;}
    }catch(e){}
    if(!box.innerHTML.trim()) box.innerHTML='<div class="m-empty" style="min-height:220px;display:grid;place-items:center">Загружаем профиль...</div>';
  }

  function cacheProfileShell(){
    if(!isProfilePage) return;
    var box=document.getElementById('mProfileBox');
    if(!box||!box.innerHTML.trim()||box.querySelector('.m-auth-unified')||box.textContent.indexOf('Загружаем профиль')!==-1) return;
    try{sessionStorage.setItem(PROFILE_CACHE_KEY,box.innerHTML);}catch(e){}
  }

  function primePersistentChrome(){
    var nav=document.querySelector('.m-bottom-inner');
    if(!nav||nav.children.length) return;
    var active={home:'home',catalog:'catalog',favorites:'fav',fav:'fav',cart:'cart',profile:'profile'}[pageName]||'';
    nav.innerHTML='\
      <a class="'+(active==='home'?'active':'')+'" href="mobile.html">⌂<span>Главная</span></a>\
      <a class="'+(active==='catalog'?'active':'')+'" href="mobile-catalog.html">☰<span>Каталог</span></a>\
      <a class="'+(active==='fav'?'active':'')+'" href="mobile-favorites.html">♡<span>Избранное <b id="mFavCount">0</b></span></a>\
      <a class="'+(active==='cart'?'active':'')+'" href="mobile-cart.html">🛒<span>Корзина <b id="mCartCount">0</b></span></a>\
      <a class="'+(active==='profile'?'active':'')+'" href="mobile-profile.html">👤<span>Профиль</span></a>';
  }

  function injectMobileNavStyles(){
    if(document.getElementById('as-mobile-nav-fixed-style')) return;
    var style=document.createElement('style');
    style.id='as-mobile-nav-fixed-style';
    style.textContent='\
      html{background:#f3f5f7}\
      html.as-mobile-warm .m-loader{display:none!important}\
      body.mobile-page{padding-bottom:calc(92px + env(safe-area-inset-bottom))!important}\
      body.mobile-page .m-top,body.mobile-page .m-bottom-nav{opacity:1!important;visibility:visible!important;transform:none!important;transition:none!important}\
      body.mobile-page .m-bottom-nav{\
        position:fixed!important;\
        left:max(10px,env(safe-area-inset-left))!important;\
        right:max(10px,env(safe-area-inset-right))!important;\
        bottom:max(6px,env(safe-area-inset-bottom))!important;\
        z-index:9999!important;\
        display:block!important;\
        pointer-events:none!important;\
        background:transparent!important;\
        border:0!important;\
        box-shadow:none!important;\
        padding:0!important\
      }\
      body.mobile-page .m-bottom-nav::before{display:none!important}\
      body.mobile-page .m-bottom-inner{\
        pointer-events:auto!important;\
        background:rgba(8,12,18,.76)!important;\
        border:1px solid rgba(255,255,255,.12)!important;\
        border-radius:28px!important;\
        -webkit-backdrop-filter:blur(24px) saturate(165%)!important;\
        backdrop-filter:blur(24px) saturate(165%)!important;\
        box-shadow:0 14px 40px rgba(0,0,0,.30),inset 0 1px 0 rgba(255,255,255,.10)!important;\
        overflow:hidden!important\
      }\
      body.mobile-page .m-bottom-inner::before{background:linear-gradient(120deg,rgba(255,255,255,.10),transparent 38%,rgba(255,255,255,.04))!important}\
      body.mobile-page .m-bottom-inner a{color:rgba(255,255,255,.72)!important;text-shadow:none!important;background:transparent!important;transition:background .18s ease,color .18s ease,transform .12s ease!important}\
      body.mobile-page .m-bottom-inner a:active{transform:scale(.94)!important}\
      body.mobile-page .m-bottom-inner a.active{color:#28e11a!important;background:rgba(255,255,255,.08)!important;border-color:rgba(40,225,26,.24)!important;box-shadow:inset 0 0 0 1px rgba(40,225,26,.10)!important}\
      body.mobile-page.as-page-leaving .m-content{opacity:.35;transform:translateX(-7px)}\
      body.mobile-page.as-page-enter .m-content{animation:asMobilePageIn .16s ease both}\
      body.mobile-page .m-content{transition:opacity .12s ease,transform .12s ease}\
      @keyframes asMobilePageIn{from{opacity:.72;transform:translateX(5px)}to{opacity:1;transform:none}}\
      @media (prefers-reduced-motion:reduce){body.mobile-page .m-content{transition:none!important;animation:none!important}}\
    ';
    document.head.appendChild(style);
  }

  function setupAppLikeNavigation(){
    document.body.classList.add('as-page-enter');
    window.setTimeout(function(){document.body.classList.remove('as-page-enter');},190);

    document.addEventListener('click',function(event){
      var anchor=event.target.closest&&event.target.closest('.m-bottom-inner a[href]');
      if(!anchor) return;
      if(event.defaultPrevented||event.button>0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey) return;
      var href=anchor.getAttribute('href')||'';
      if(!href||href.charAt(0)==='#'||anchor.target==='_blank') return;
      var targetUrl;
      try{targetUrl=new URL(href,location.href);}catch(e){return;}
      if(targetUrl.origin!==location.origin) return;
      var current=location.pathname+location.search+location.hash;
      var next=targetUrl.pathname+targetUrl.search+targetUrl.hash;
      if(current===next) return;

      event.preventDefault();
      document.querySelectorAll('.m-bottom-inner a').forEach(function(a){a.classList.remove('active');});
      anchor.classList.add('active');
      document.body.classList.add('as-page-leaving');
      try{sessionStorage.setItem('as_mobile_splash_seen','1');}catch(e){}
      window.setTimeout(function(){location.href=targetUrl.href;},55);
    },true);

    window.addEventListener('pageshow',function(){document.body.classList.remove('as-page-leaving');});
  }

  function releaseLoader(){
    if(loaderReleased) return;
    loaderReleased=true;
    var elapsed=performance.now()-loaderShownAt;
    var delay=Math.max(0,MIN_SPLASH-elapsed);
    window.setTimeout(function(){
      var loader=document.getElementById('mLoader');
      if(loader){
        loader.classList.add('as-loader-hidden');
        window.setTimeout(function(){if(loader&&loader.parentNode) loader.parentNode.removeChild(loader);},isProfilePage?80:220);
      }
      try{sessionStorage.setItem('as_mobile_splash_seen','1');}catch(e){}
      document.documentElement.classList.add('m-app-visible');
      document.dispatchEvent(new CustomEvent('autostyle:mobile-ready'));
    },delay);
  }

  function readyEnough(){scanImages(document);arrangeCardBadges(document);requestAnimationFrame(function(){requestAnimationFrame(releaseLoader);});}

  function prefetch(url){
    if(!url||!/^mobile-[\w-]+\.html|mobile\.html/.test(url.split(/[?#]/)[0])) return;
    if(document.querySelector('link[data-as-prefetch="'+url.replace(/"/g,'')+'"]')) return;
    var link=document.createElement('link');
    link.rel='prefetch';link.href=url;link.as='document';link.dataset.asPrefetch=url;
    document.head.appendChild(link);
  }

  function warmMainPages(){
    var run=function(){['mobile.html','mobile-catalog.html','mobile-favorites.html','mobile-cart.html','mobile-profile.html'].forEach(prefetch);};
    if('requestIdleCallback' in window) requestIdleCallback(run,{timeout:1200});
    else setTimeout(run,450);
  }

  injectMobileNavStyles();
  primePersistentChrome();

  document.addEventListener('DOMContentLoaded',function(){
    injectMobileNavStyles();
    primePersistentChrome();
    setupAppLikeNavigation();
    restoreProfileShell();
    if(isProfilePage||isWarm) releaseLoader();
    scanImages(document);
    arrangeCardBadges(document);
    var observer=new MutationObserver(function(records){
      records.forEach(function(record){record.addedNodes.forEach(function(node){
        if(node.nodeType!==1) return;
        if(node.tagName==='IMG') markImage(node);
        scanImages(node);
        arrangeCardBadges(node);
      });});
      cacheProfileShell();
    });
    observer.observe(document.body,{childList:true,subtree:true});
    document.addEventListener('touchstart',function(event){var anchor=event.target.closest&&event.target.closest('a[href]');if(anchor) prefetch(anchor.getAttribute('href'));},{passive:true,capture:true});
    document.addEventListener('mouseover',function(event){var anchor=event.target.closest&&event.target.closest('a[href]');if(anchor) prefetch(anchor.getAttribute('href'));},{passive:true,capture:true});
    readyEnough();
    warmMainPages();
  });

  window.addEventListener('load',function(){readyEnough();cacheProfileShell();},{once:true});
  window.addEventListener('pageshow',function(event){if(event.persisted) releaseLoader();});
  window.addEventListener('error',releaseLoader,true);
  window.addEventListener('unhandledrejection',releaseLoader);
  window.setTimeout(releaseLoader,MAX_SPLASH);
})();