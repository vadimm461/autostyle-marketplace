(function(){
  var KEY='as_mobile_boot_recovery';
  var started=Date.now();

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