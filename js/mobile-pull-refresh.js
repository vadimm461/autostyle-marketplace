(function(){
  'use strict';
  // Pull-to-refresh стал менее чувствительным:
  // срабатывает только от верхнего края, только при явном вертикальном жесте вниз.
  const TRIGGER = 165;
  const START_MAX_Y = 1;
  const MIN_SHOW_DY = 58;
  const MAX_START_Y = 96;
  const VERTICAL_RATIO = 2.15;
  let startX = 0, startY = 0;
  let pulling = false;
  let lockedHorizontal = false;
  let distance = 0;
  let busy = false;
  let indicator;

  function isInsideHorizontalScroller(target){
    return !!target?.closest?.('.m-promo-row,.m-carousel,.m-home-products,[data-horizontal-scroll]');
  }
  function atTop(){ return (window.scrollY || document.documentElement.scrollTop || 0) <= START_MAX_Y; }
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
    const b = x.querySelector('b');
    if(b) b.textContent = text;
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
      if(window.AutoStyleMobilePageCache) window.AutoStyleMobilePageCache.clearCurrent?.();
      if(typeof window.autostyleMobileRefresh === 'function') await window.autostyleMobileRefresh('pull-refresh');
      else location.reload();
      setState('Обновлено', true);
      setTimeout(reset, 650);
    }finally{ busy = false; }
  }

  document.addEventListener('touchstart', e=>{
    if(!atTop() || busy || isInsideHorizontalScroller(e.target)) return;
    const t = e.touches && e.touches[0];
    if(!t || t.clientY > MAX_START_Y) return;
    startX = t.clientX;
    startY = t.clientY;
    pulling = true;
    lockedHorizontal = false;
    distance = 0;
  }, { passive:true });

  document.addEventListener('touchmove', e=>{
    if(!pulling || busy) return;
    const t = e.touches && e.touches[0];
    if(!t) return reset();
    const dx = Math.abs(t.clientX - startX);
    const dy = t.clientY - startY;
    if(dy <= 0) return reset();

    // Любой ранний боковой жест блокирует pull-refresh.
    if(dx > 14 && dx >= dy * 0.75){
      lockedHorizontal = true;
      return reset();
    }
    if(lockedHorizontal) return;

    // Показываем индикатор только когда жест явно вертикальный.
    if(dy < MIN_SHOW_DY || dy < dx * VERTICAL_RATIO) return;
    distance = dy;
    const ready = distance > TRIGGER;
    setState(ready ? 'Отпустите для обновления' : 'Потяните вниз для обновления', true);
    el().style.transform = `translate(-50%, ${Math.min(distance / 3.4, 70)}px)`;
  }, { passive:true });

  document.addEventListener('touchend', ()=>{
    if(!pulling) return;
    const should = !lockedHorizontal && distance > TRIGGER;
    if(should) refresh(); else reset();
  }, { passive:true });
  document.addEventListener('touchcancel', reset, { passive:true });
})();
