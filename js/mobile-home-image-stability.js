(function(){
  'use strict';

  if(document.body && document.body.dataset.page && document.body.dataset.page !== 'home') return;

  const CACHE_KEY = 'as_mobile_home_image_urls_v1';
  const TARGET_IDS = new Set(['mHomeDynamic','mHero','mHomePromoMount']);
  const nativeDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');

  // Не заменяем одинаковую разметку повторно. Это сохраняет уже декодированные
  // изображения при pageshow/focus/visibilitychange и убирает мигание карточек.
  if(nativeDescriptor && nativeDescriptor.get && nativeDescriptor.set && nativeDescriptor.configurable){
    Object.defineProperty(Element.prototype, 'innerHTML', {
      configurable:true,
      enumerable:nativeDescriptor.enumerable,
      get:nativeDescriptor.get,
      set:function(value){
        const html = String(value == null ? '' : value);
        if(TARGET_IDS.has(this.id) && this.dataset.asStableHtml === html) return;
        nativeDescriptor.set.call(this, value);
        if(TARGET_IDS.has(this.id)) this.dataset.asStableHtml = html;
      }
    });
  }

  function validUrl(value){
    const url = String(value || '').trim();
    return /^(https?:\/\/|\/|\.\/|assets\/|images\/|img\/|uploads\/)/i.test(url) ? url : '';
  }

  function preload(url, priority){
    if(!url || document.head.querySelector('link[data-as-home-preload="'+CSS.escape(url)+'"]')) return;
    const link = document.createElement('link');
    link.rel = priority ? 'preload' : 'prefetch';
    link.as = 'image';
    link.href = url;
    link.dataset.asHomePreload = url;
    document.head.appendChild(link);
  }

  try{
    const saved = JSON.parse(localStorage.getItem(CACHE_KEY) || '[]');
    saved.slice(0, 8).forEach((url, index) => preload(validUrl(url), index < 4));
  }catch(_){ }

  function tuneImages(root){
    if(!root || !root.querySelectorAll) return;
    const images = Array.from(root.querySelectorAll('#mHero img, #mHomeDynamic .m-card-img img, #mHomeDynamic .m-promo-card img'));
    const urls = [];

    images.forEach((image, index) => {
      const url = validUrl(image.currentSrc || image.src || image.getAttribute('src'));
      if(url) urls.push(url);
      image.decoding = 'async';
      if(index < 6){
        image.loading = 'eager';
        image.fetchPriority = index < 3 ? 'high' : 'auto';
      }else{
        image.loading = 'lazy';
        image.fetchPriority = 'low';
      }
      if(image.complete && image.naturalWidth > 0) image.classList.add('as-image-ready');
      else image.addEventListener('load', () => image.classList.add('as-image-ready'), {once:true});
    });

    if(urls.length){
      const unique = Array.from(new Set(urls)).slice(0, 30);
      try{ localStorage.setItem(CACHE_KEY, JSON.stringify(unique)); }catch(_){ }
      unique.slice(0, 8).forEach((url, index) => preload(url, index < 4));
    }
  }

  const style = document.createElement('style');
  style.textContent = `
    body[data-page="home"] .m-card-img img,
    body[data-page="home"] .m-hero img,
    body[data-page="home"] .m-promo-card img{
      animation:none!important;
      transition:none!important;
      opacity:1!important;
      visibility:visible!important;
    }
    body[data-page="home"] .m-card-img{background:#fff!important;}
  `;
  document.head.appendChild(style);

  const start = () => {
    tuneImages(document);
    const observer = new MutationObserver(records => {
      let needsTune = false;
      for(const record of records){
        if(record.target && record.target.closest && record.target.closest('#mHomeDynamic,#mHero,#mHomePromoMount')){
          needsTune = true;
          break;
        }
        for(const node of record.addedNodes){
          if(node.nodeType === 1 && (node.matches?.('#mHomeDynamic,#mHero,#mHomePromoMount,#mHomeDynamic *,#mHero *,#mHomePromoMount *') || node.querySelector?.('#mHomeDynamic,#mHero,#mHomePromoMount'))){
            needsTune = true;
            break;
          }
        }
        if(needsTune) break;
      }
      if(needsTune) requestAnimationFrame(() => tuneImages(document));
    });
    observer.observe(document.documentElement, {childList:true, subtree:true});
  };

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
  else start();
})();
