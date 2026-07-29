(function(){
  if(!('serviceWorker' in navigator)) return;
  window.addEventListener('load',function(){
    navigator.serviceWorker.register('./service-worker.js',{scope:'./'}).catch(function(error){
      console.warn('AutoStyle cache worker:',error);
    });
  },{once:true});
})();

(function(){
  var KEY='as_mobile_boot_recovery';
  var started=Date.now();
  var touchStartX=0;
  var touchStartY=0;

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
  resetHorizontalPosition();

  function scrollableParent(target){
    var node=target;
    while(node&&node!==document.body&&node!==document.documentElement){
      var style=window.getComputedStyle(node);
      var overflowY=style.overflowY;
      if((overflowY==='auto'||overflowY==='scroll')&&node.scrollHeight>node.clientHeight) return node;
      node=node.parentElement;
    }
    return null;
  }

  document.addEventListener('gesturestart',preventGesture,{passive:false});
  document.addEventListener('gesturechange',preventGesture,{passive:false});
  document.addEventListener('gestureend',preventGesture,{passive:false});
  document.addEventListener('touchstart',function(event){
    if(!event.touches||event.touches.length!==1) return;
    touchStartX=event.touches[0].clientX;
    touchStartY=event.touches[0].clientY;
  },{passive:true,capture:true});
  document.addEventListener('touchmove',function(event){
    if(!event.touches) return;
    if(event.touches.length>1){
      event.preventDefault();
      return;
    }
    var touch=event.touches[0];
    var dx=touch.clientX-touchStartX;
    var dy=touch.clientY-touchStartY;
    if(Math.abs(dx)>Math.abs(dy)&&Math.abs(dx)>8){
      resetHorizontalPosition();
    }
    if(dy<=0||Math.abs(dy)<=Math.abs(dx)) return;
    var scroller=scrollableParent(event.target);
    if(scroller&&scroller.scrollTop>0) return;
    var pageTop=(window.scrollY||document.documentElement.scrollTop||0)<=0;
    if(pageTop) event.preventDefault();
  },{passive:false,capture:true});

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

    if('caches' in window){
      caches.keys().then(function(keys){
        return Promise.all(keys.filter(function(k){return /autostyle|mobile|github/i.test(k);}).map(function(k){return caches.delete(k);}));
      }).catch(function(){});
    }
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