(function(){
  if(!('serviceWorker' in navigator)) return;
  window.addEventListener('load',function(){
    navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).then(function(registration){
      return registration.update().catch(function(){});
    }).catch(function(error){
      console.warn('AutoStyle cache worker:',error);
    });
  },{once:true});
})();

(function(){
  var KEY='as_mobile_boot_recovery';
  var started=Date.now();

  function installNativeScrollStyle(){
    var style=document.getElementById('as-mobile-viewport-lock');
    if(!style){
      style=document.createElement('style');
      style.id='as-mobile-viewport-lock';
      document.head.appendChild(style);
    }
    style.textContent=[
      'html,body.mobile-page{width:100%!important;max-width:100%!important;height:auto!important;min-height:100%!important;max-height:none!important;overflow-y:auto!important;overflow-x:hidden!important;position:static!important;touch-action:pan-x pan-y!important;overscroll-behavior-y:auto!important}',
      'body.mobile-page .m-shell{width:100%!important;max-width:520px!important;margin-left:auto!important;margin-right:auto!important;overflow-x:clip!important;overflow-y:visible!important;transform:none!important}',
      'body.mobile-page .m-content{width:100%!important;max-width:100%!important;overflow-x:clip!important;overflow-y:visible!important;transform:none!important}',
      'body.mobile-page .m-carousel,body.mobile-page .m-promo-row,body.mobile-page .m-home-products,body.mobile-page [data-horizontal-scroll]{touch-action:pan-x!important}',
      'body.mobile-page img,body.mobile-page video,body.mobile-page canvas{max-width:100%!important}',
      'body.mobile-page .m-bottom-nav{max-width:520px!important;margin-left:auto!important;margin-right:auto!important}'
    ].join('');
  }

  function removeLegacyLocks(){
    var root=document.documentElement;
    var body=document.body;
    if(!body) return;
    installNativeScrollStyle();
    root.style.setProperty('overflow-y','auto','important');
    root.style.setProperty('overflow-x','hidden','important');
    root.style.setProperty('height','auto','important');
    root.style.setProperty('max-height','none','important');
    body.style.setProperty('position','static','important');
    body.style.setProperty('overflow-y','auto','important');
    body.style.setProperty('overflow-x','hidden','important');
    body.style.setProperty('height','auto','important');
    body.style.setProperty('max-height','none','important');
    body.style.setProperty('touch-action','pan-x pan-y','important');
    body.style.setProperty('overscroll-behavior-y','auto','important');

    [
      'modal-open','no-scroll','scroll-lock','scroll-locked',
      'overflow-hidden','as-scroll-lock','as-scroll-locked'
    ].forEach(function(name){ body.classList.remove(name); });

    [
      '.as-mobile-install-card','.as-install-home-card',
      '.pwa-install-banner','.pwa-install-card','.pwa-install-overlay',
      '.install-banner','.install-overlay',
      '[data-as-install-overlay]','[data-install-overlay]'
    ].forEach(function(selector){
      body.querySelectorAll(selector).forEach(function(node){ node.remove(); });
    });
  }

  function resetHorizontalPosition(){
    if(window.scrollX!==0) window.scrollTo(0,window.scrollY||0);
    document.documentElement.scrollLeft=0;
    if(document.body) document.body.scrollLeft=0;
  }

  installNativeScrollStyle();
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',removeLegacyLocks,{once:true});
  }else{
    removeLegacyLocks();
  }

  function reveal(){
    removeLegacyLocks();
    var loader=document.getElementById('mLoader');
    if(loader){
      loader.style.opacity='0';
      loader.style.pointerEvents='none';
      setTimeout(function(){ if(loader&&loader.parentNode) loader.parentNode.removeChild(loader); },220);
    }
    document.documentElement.classList.add('m-app-visible');
    if(document.body){
      document.body.style.visibility='visible';
      document.body.style.opacity='1';
    }
    resetHorizontalPosition();
  }

  setTimeout(reveal,4500);

  window.addEventListener('error',function(event){
    var message=String(event.message||'')+' '+String(event.filename||'');
    if(!/mobile-app|firebase|data-cache|module/i.test(message)) return;
    reveal();

    var last=Number(sessionStorage.getItem(KEY)||0);
    if(Date.now()-last<30000) return;
    sessionStorage.setItem(KEY,String(Date.now()));

    if('caches' in window){
      caches.keys().then(function(keys){
        return Promise.all(keys.filter(function(key){return /autostyle|mobile|github/i.test(key);}).map(function(key){return caches.delete(key);}));
      }).catch(function(){});
    }
  },true);

  window.addEventListener('unhandledrejection',function(){ reveal(); });
  window.addEventListener('pageshow',function(){
    installNativeScrollStyle();
    removeLegacyLocks();
    resetHorizontalPosition();
    if(Date.now()-started>3000) reveal();
  });
  window.addEventListener('resize',function(){
    installNativeScrollStyle();
    removeLegacyLocks();
    resetHorizontalPosition();
  },{passive:true});
  window.addEventListener('orientationchange',function(){
    setTimeout(function(){
      installNativeScrollStyle();
      removeLegacyLocks();
      resetHorizontalPosition();
    },80);
  },{passive:true});
})();