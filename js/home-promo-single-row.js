/* AutoStyle home promo autoplay. Presentation only; Firestore/admin data stays unchanged. */
(function(){
  'use strict';

  var timer=0;
  var resumeTimer=0;
  var activeRoot=null;

  function cards(root){return root ? Array.from(root.querySelectorAll('.home-mini-promo-card')) : [];}

  function currentIndex(root,list){
    if(!root||!list.length) return 0;
    var left=root.scrollLeft;
    var best=0;
    var distance=Infinity;
    list.forEach(function(card,index){
      var d=Math.abs(card.offsetLeft-left);
      if(d<distance){distance=d;best=index;}
    });
    return best;
  }

  function scrollNext(){
    var root=activeRoot;
    var list=cards(root);
    if(!root||list.length<2||document.hidden) return;
    var next=(currentIndex(root,list)+1)%list.length;
    root.scrollTo({left:list[next].offsetLeft,behavior:'smooth'});
  }

  function start(){
    window.clearInterval(timer);
    if(!activeRoot||cards(activeRoot).length<2) return;
    timer=window.setInterval(scrollNext,5200);
  }

  function pauseAndResume(){
    window.clearInterval(timer);
    window.clearTimeout(resumeTimer);
    resumeTimer=window.setTimeout(start,6500);
  }

  function init(root){
    if(!root||root.dataset.singlePromoReady==='1') return;
    root.dataset.singlePromoReady='1';
    activeRoot=root;
    root.addEventListener('pointerdown',pauseAndResume,{passive:true});
    root.addEventListener('wheel',pauseAndResume,{passive:true});
    root.addEventListener('touchstart',pauseAndResume,{passive:true});
    root.addEventListener('mouseenter',function(){window.clearInterval(timer);});
    root.addEventListener('mouseleave',start);
    start();
  }

  function scan(){
    var root=document.getElementById('banners');
    if(root&&root.querySelector('.home-mini-promo-card')) init(root);
  }

  document.addEventListener('DOMContentLoaded',scan);
  window.addEventListener('load',scan,{once:true});
  document.addEventListener('visibilitychange',function(){if(document.hidden) window.clearInterval(timer); else start();});

  var observer=new MutationObserver(scan);
  observer.observe(document.documentElement,{childList:true,subtree:true});
})();
