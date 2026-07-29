/* AutoStyle desktop: move installment badge to image top beside discount. */
(function(){
  'use strict';
  if(window.matchMedia && !window.matchMedia('(min-width: 769px)').matches) return;

  var CARD_SELECTOR='.product-card,.catalog-card,.favorite-card,.related-card,.similar-card,.home-product-card';
  var IMAGE_SELECTOR='.product-img,.catalog-card-photo,.favorite-photo,.favorite-card-photo,.related-photo,.similar-photo,.home-photo';
  var INSTALLMENT_SELECTOR='.installment-badge,.catalog-installment-badge,[class*="installment"][class*="badge"]';
  var DISCOUNT_SELECTOR='.discount-badge,.catalog-discount-badge,.sale-badge';

  function normalizeText(text){
    return String(text||'').replace(/^\s*Рассрочка\s*/i,'').replace(/\s+в\s+мес\.?$/i,'/мес').replace(/\s+/g,' ').trim();
  }

  function processCard(card){
    if(!card || card.dataset.asInstallmentTopReady==='1') return;
    var image=card.querySelector(IMAGE_SELECTOR);
    var badge=card.querySelector(INSTALLMENT_SELECTOR);
    if(!image || !badge) return;
    var text=normalizeText(badge.textContent);
    if(!text) return;

    var wrap=image.querySelector(':scope > .as-desktop-top-badges');
    if(!wrap){
      wrap=document.createElement('div');
      wrap.className='as-desktop-top-badges';
      image.prepend(wrap);
    }

    var discount=image.querySelector(DISCOUNT_SELECTOR);
    if(discount && discount.parentElement!==wrap) wrap.appendChild(discount);

    var topBadge=document.createElement('span');
    topBadge.className='as-desktop-installment-top';
    topBadge.textContent=text;
    wrap.appendChild(topBadge);

    badge.remove();
    var badgesBox=card.querySelector('.product-badges');
    if(badgesBox && !badgesBox.textContent.trim()) badgesBox.remove();
    card.dataset.asInstallmentTopReady='1';
  }

  function scan(root){
    var scope=root&&root.querySelectorAll?root:document;
    if(scope.matches && scope.matches(CARD_SELECTOR)) processCard(scope);
    scope.querySelectorAll(CARD_SELECTOR).forEach(processCard);
  }

  function boot(){
    scan(document);
    var observer=new MutationObserver(function(records){
      records.forEach(function(record){
        record.addedNodes.forEach(function(node){
          if(node.nodeType===1) scan(node);
        });
      });
    });
    observer.observe(document.body,{childList:true,subtree:true});
    document.addEventListener('autostyle-cache-updated',function(){requestAnimationFrame(function(){scan(document);});});
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
