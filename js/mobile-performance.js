/* AutoStyle Mobile performance helpers. No Firebase/cart/auth mutations. */
(function(){
  'use strict';

  var loaderReleased=false;
  var loaderShownAt=performance.now();
  var MIN_SPLASH=320;
  var MAX_SPLASH=2200;

  function markImage(img){
    if(!img) return;
    if(img.complete && img.naturalWidth){
      img.classList.add('as-img-ready');
      return;
    }
    img.addEventListener('load',function(){img.classList.add('as-img-ready');},{once:true});
    img.addEventListener('error',function(){img.classList.add('as-img-ready');},{once:true});
  }

  function scanImages(root){
    (root||document).querySelectorAll('img').forEach(markImage);
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
        window.setTimeout(function(){
          if(loader && loader.parentNode) loader.parentNode.removeChild(loader);
        },360);
      }
      document.documentElement.classList.add('m-app-visible');
      document.dispatchEvent(new CustomEvent('autostyle:mobile-ready'));
    },delay);
  }

  function readyEnough(){
    scanImages(document);
    requestAnimationFrame(function(){
      requestAnimationFrame(releaseLoader);
    });
  }

  function prefetch(url){
    if(!url || !/^mobile-[\w-]+\.html|mobile\.html/.test(url.split(/[?#]/)[0])) return;
    if(document.querySelector('link[data-as-prefetch="'+url.replace(/"/g,'')+'"]')) return;
    var link=document.createElement('link');
    link.rel='prefetch';
    link.href=url;
    link.as='document';
    link.dataset.asPrefetch=url;
    document.head.appendChild(link);
  }

  document.addEventListener('DOMContentLoaded',function(){
    scanImages(document);

    var observer=new MutationObserver(function(records){
      records.forEach(function(record){
        record.addedNodes.forEach(function(node){
          if(node.nodeType!==1) return;
          if(node.tagName==='IMG') markImage(node);
          scanImages(node);
        });
      });
    });
    observer.observe(document.body,{childList:true,subtree:true});

    document.addEventListener('touchstart',function(event){
      var anchor=event.target.closest && event.target.closest('a[href]');
      if(anchor) prefetch(anchor.getAttribute('href'));
    },{passive:true,capture:true});

    document.addEventListener('mouseover',function(event){
      var anchor=event.target.closest && event.target.closest('a[href]');
      if(anchor) prefetch(anchor.getAttribute('href'));
    },{passive:true,capture:true});

    readyEnough();
  });

  window.addEventListener('load',readyEnough,{once:true});
  window.addEventListener('pageshow',function(event){
    if(event.persisted) releaseLoader();
  });
  window.addEventListener('error',releaseLoader,true);
  window.addEventListener('unhandledrejection',releaseLoader);
  window.setTimeout(releaseLoader,MAX_SPLASH);
})();
