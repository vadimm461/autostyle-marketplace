(function(){
  var bootScriptUrl = document.currentScript && document.currentScript.src;

  function mountMobileNotificationButton(){
    var row = document.querySelector('.m-top .m-row');
    if(!row || document.getElementById('asMobileHeaderNotifications')) return;

    var button = document.createElement('a');
    button.id = 'asMobileHeaderNotifications';
    button.className = 'as-mobile-header-notifications';
    button.href = 'mobile-notifications.html?__as_notify=20260802-notifications-header';
    button.setAttribute('aria-label','Уведомления');
    button.title = 'Уведомления';
    button.innerHTML = '<span class="as-mobile-notify-icon" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" focusable="false"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"></path><path d="M10 21h4"></path></svg>' +
      '</span><b class="as-mobile-notify-badge" data-as-header-notify-badge data-count="0"></b>';

    var spacer = row.querySelector('.m-head-spacer');
    if(spacer) spacer.insertAdjacentElement('afterend', button);
    else row.appendChild(button);

    if(!document.getElementById('as-mobile-notifications-boot-style')){
      var style = document.createElement('style');
      style.id = 'as-mobile-notifications-boot-style';
      style.textContent = 'body.mobile-page .m-top .m-row{position:relative!important;z-index:2!important}' +
        'body.mobile-page .as-mobile-header-notifications{position:relative!important;z-index:3!important;flex:0 0 42px!important;width:42px!important;height:42px!important;display:grid!important;place-items:center!important;margin:0!important;border:1px solid rgba(40,225,26,.42)!important;border-radius:15px!important;background:rgba(255,255,255,.10)!important;color:#fff!important;text-decoration:none!important;-webkit-tap-highlight-color:transparent!important}' +
        'body.mobile-page .as-mobile-notify-icon,body.mobile-page .as-mobile-notify-icon svg{width:22px!important;height:22px!important;display:block!important}' +
        'body.mobile-page .as-mobile-notify-icon svg{fill:none!important;stroke:currentColor!important;stroke-linecap:round!important;stroke-linejoin:round!important;stroke-width:2!important}' +
        'body.mobile-page .as-mobile-notify-badge{position:absolute!important;top:-6px!important;right:-6px!important;min-width:19px!important;height:19px!important;padding:0 5px!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;border:2px solid #10141b!important;border-radius:999px!important;background:#28e11a!important;color:#061006!important;font-size:10px!important;line-height:15px!important;font-weight:950!important}' +
        'body.mobile-page .as-mobile-notify-badge[data-count="0"]:empty{display:none!important}';
      document.head.appendChild(style);
    }
  }

  function loadNotificationModuleWhenNeeded(){
    if(document.querySelector('script[src*="js/notifications.js"]')) return;
    var moduleUrl = bootScriptUrl
      ? new URL('notifications.js?v=20260802-notifications-header',bootScriptUrl).href
      : './js/notifications.js?v=20260802-notifications-header';
    import(moduleUrl).catch(function(error){
      console.warn('AutoStyle mobile notification data:',error);
    });
  }

  function boot(){
    mountMobileNotificationButton();
    loadNotificationModuleWhenNeeded();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();

(function(){
  if(!('serviceWorker' in navigator)) return;
  window.addEventListener('load',function(){
    navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'})
      .then(function(registration){ return registration.update().catch(function(){}); })
      .catch(function(error){
        console.warn('AutoStyle cache worker:',error);
      });
  },{once:true});
})();

(function(){
  var KEY='as_mobile_boot_recovery';
  var started=Date.now();

  function restoreNativeVerticalScroll(){
    if(document.getElementById('as-mobile-native-scroll-fix')) return;
    var style=document.createElement('style');
    style.id='as-mobile-native-scroll-fix';
    style.textContent='\
      html{height:auto!important;overflow-x:hidden!important;overflow-y:auto!important;touch-action:pan-x pan-y!important}\
      body.mobile-page{height:auto!important;min-height:100dvh!important;max-height:none!important;overflow-x:hidden!important;overflow-y:auto!important;-webkit-overflow-scrolling:touch!important;touch-action:pan-x pan-y!important;overscroll-behavior-y:auto!important}\
      body.mobile-page .m-shell{height:auto!important;min-height:100dvh!important;max-height:none!important;overflow:visible!important}\
      body.mobile-page .m-content{height:auto!important;min-height:0!important;max-height:none!important;overflow:visible!important}\
      body.mobile-page .m-top,body.mobile-page .m-bottom-nav{touch-action:manipulation!important}\
    ';
    (document.head||document.documentElement).appendChild(style);
  }

  function preventGesture(event){
    event.preventDefault();
  }

  function lockMobileViewport(){
    if(document.getElementById('as-mobile-viewport-lock')) return;
    var style=document.createElement('style');
    style.id='as-mobile-viewport-lock';
    style.textContent='\
      html,body{width:100%!important;max-width:100%!important;overflow-x:hidden!important;overscroll-behavior-x:none!important}\
      body.mobile-page{position:relative!important;margin:0!important;left:0!important;right:0!important}\
      body.mobile-page .m-shell{width:100%!important;max-width:520px!important;margin-left:auto!important;margin-right:auto!important;overflow-x:hidden!important;transform:none!important}\
      body.mobile-page .m-top{width:100%!important;max-width:520px!important;left:0!important;right:0!important;margin-left:auto!important;margin-right:auto!important;transform:none!important}\
      body.mobile-page .m-content{width:100%!important;max-width:100%!important;overflow-x:hidden!important}\
      body.mobile-page img,body.mobile-page video,body.mobile-page canvas{max-width:100%!important}\
      body.mobile-page .m-bottom-nav{max-width:520px!important;margin-left:auto!important;margin-right:auto!important}\
    ';
    document.head.appendChild(style);
  }

  function resetHorizontalPosition(){
    if(window.scrollX!==0) window.scrollTo(0,window.scrollY||0);
    document.documentElement.scrollLeft=0;
    if(document.body) document.body.scrollLeft=0;
  }

  lockMobileViewport();
  restoreNativeVerticalScroll();
  resetHorizontalPosition();

  document.addEventListener('gesturestart',preventGesture,{passive:false});
  document.addEventListener('gesturechange',preventGesture,{passive:false});
  document.addEventListener('gestureend',preventGesture,{passive:false});

  function reveal(){
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
    var text=String(event.message||'')+' '+String(event.filename||'');
    if(!/mobile-app|firebase|data-cache|module/i.test(text)) return;
    reveal();

    var last=Number(sessionStorage.getItem(KEY)||0);
    if(Date.now()-last<30000) return;
    sessionStorage.setItem(KEY,String(Date.now()));

  },true);

  window.addEventListener('unhandledrejection',function(){
    reveal();
  });

  window.addEventListener('pageshow',function(){
    lockMobileViewport();
    resetHorizontalPosition();
    if(Date.now()-started>3000) reveal();
  });

  window.addEventListener('resize',resetHorizontalPosition,{passive:true});
  window.addEventListener('orientationchange',function(){setTimeout(resetHorizontalPosition,80);},{passive:true});
})();
