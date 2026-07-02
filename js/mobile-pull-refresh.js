(function(){
  'use strict';
  const TRIGGER = 128;          // было слишком чувствительно
  const START_MAX_Y = 2;
  const HORIZONTAL_RATIO = 1.25; // если жест больше вбок — не обновляем
  let startX = 0, startY = 0;
  let pulling = false;
  let lockedHorizontal = false;
  let distance = 0;
  let busy = false;
  let indicator;

  function isInsideHorizontalScroller(target){
    return !!target?.closest?.('.m-promo-row,.m-carousel,.m-home-products,[data-horizontal-scroll]');
  }
  function el(){
    if(indicator) return indicator;
    indicator = document.createElement('div');
    indicator.className = 'm-pull-refresh';
    indicator.innerHTML = '<span>↓</span><b>Потяните вниз для обновления</b>';
    document.body.appendChild(indicator);
    return indicator;
  }
  function setState(text, active){
    const x = el();
    x.classList.toggle('active', !!active);
    x.querySelector('b').textContent = text;
  }
  function reset(){
    pulling = false;
    lockedHorizontal = false;
    distance = 0;
    const x = el();
    x.style.transform = '';
    setState('Потяните вниз для обновления', false);
  }
  async function refresh(){
    if(busy) return;
    busy = true;
    setState('Обновляем...', true);
    try{
      if(window.AutoStyleMobilePageCache) window.AutoStyleMobilePageCache.clear();
      if(typeof window.autostyleMobileRefresh === 'function') await window.autostyleMobileRefresh('pull-refresh');
      else location.reload();
      setState('Обновлено', true);
      setTimeout(reset, 650);
    }finally{ busy = false; }
  }

  document.addEventListener('touchstart', e=>{
    if(window.scrollY > START_MAX_Y || busy || isInsideHorizontalScroller(e.target)) return;
    const t = e.touches[0];
    startX = t.clientX;
    startY = t.clientY;
    pulling = true;
    lockedHorizontal = false;
    distance = 0;
  }, { passive:true });

  document.addEventListener('touchmove', e=>{
    if(!pulling || busy) return;
    const t = e.touches[0];
    const dx = Math.abs(t.clientX - startX);
    const dy = t.clientY - startY;
    if(dy < 0) return reset();
    if(dx > 18 && dx > dy * HORIZONTAL_RATIO){
      lockedHorizontal = true;
      return reset();
    }
    if(lockedHorizontal || dy < 22) return;
    distance = dy;
    const ready = distance > TRIGGER;
    setState(ready ? 'Отпустите для обновления' : 'Потяните вниз для обновления', true);
    el().style.transform = `translate(-50%, ${Math.min(distance / 3, 64)}px)`;
  }, { passive:true });

  document.addEventListener('touchend', ()=>{
    if(!pulling) return;
    const should = !lockedHorizontal && distance > TRIGGER;
    if(should) refresh(); else reset();
  }, { passive:true });
})();
