(function(){
  var KEY='as_mobile_boot_recovery';
  var started=Date.now();
  var touchStartX=0;
  var touchStartY=0;

  function preventGesture(event){
    event.preventDefault();
  }

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
  }

  // No loader is allowed to cover the page longer than 4.5 seconds.
  setTimeout(reveal,4500);

  // Recover once from a stale service worker/cache after a long idle period.
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
    if(Date.now()-started>3000) reveal();
  });
})();
