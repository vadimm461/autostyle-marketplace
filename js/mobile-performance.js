/* AutoStyle Mobile performance helpers. No Firebase/cart/auth mutations. */
(function(){
  'use strict';

  var loaderReleased=false;
  var loaderShownAt=performance.now();
  var isWarm=sessionStorage.getItem('as_mobile_splash_seen')==='1';
  var MIN_SPLASH=isWarm?520:1150;
  var MAX_SPLASH=2600;

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

  function releaseLoader(){
    if(loaderReleased) return;
    loaderReleased=true;
    var elapsed=performance.now()-loaderShownAt;
    var delay=Math.max(0,MIN_SPLASH-elapsed);
    window.setTimeout(function(){
      var loader=document.getElementById('mLoader');
      if(loader){
        loader.classList.add('as-loader-hidden');
        window.setTimeout(function(){if(loader&&loader.parentNode) loader.parentNode.removeChild(loader);},380);
      }
      try{sessionStorage.setItem('as_mobile_splash_seen','1');}catch(e){}
      document.documentElement.classList.add('m-app-visible');
      document.dispatchEvent(new CustomEvent('autostyle:mobile-ready'));
    },delay);
  }

  function readyEnough(){
    scanImages(document);
    arrangeCardBadges(document);
    requestAnimationFrame(function(){requestAnimationFrame(releaseLoader);});
  }

  function prefetch(url){
    if(!url||!/^mobile-[\w-]+\.html|mobile\.html/.test(url.split(/[?#]/)[0])) return;
    if(document.querySelector('link[data-as-prefetch="'+url.replace(/"/g,'')+'"]')) return;
    var link=document.createElement('link');
    link.rel='prefetch';link.href=url;link.as='document';link.dataset.asPrefetch=url;
    document.head.appendChild(link);
  }

  document.addEventListener('DOMContentLoaded',function(){
    scanImages(document);
    arrangeCardBadges(document);
    var observer=new MutationObserver(function(records){
      records.forEach(function(record){record.addedNodes.forEach(function(node){
        if(node.nodeType!==1) return;
        if(node.tagName==='IMG') markImage(node);
        scanImages(node);
        arrangeCardBadges(node);
      });});
    });
    observer.observe(document.body,{childList:true,subtree:true});
    document.addEventListener('touchstart',function(event){var anchor=event.target.closest&&event.target.closest('a[href]');if(anchor) prefetch(anchor.getAttribute('href'));},{passive:true,capture:true});
    document.addEventListener('mouseover',function(event){var anchor=event.target.closest&&event.target.closest('a[href]');if(anchor) prefetch(anchor.getAttribute('href'));},{passive:true,capture:true});
    readyEnough();
  });

  window.addEventListener('load',readyEnough,{once:true});
  window.addEventListener('pageshow',function(event){if(event.persisted) releaseLoader();});
  window.addEventListener('error',releaseLoader,true);
  window.addEventListener('unhandledrejection',releaseLoader);
  window.setTimeout(releaseLoader,MAX_SPLASH);
})();