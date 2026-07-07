(function(){
  'use strict';

  // Плавный pull-to-refresh для мобильной версии.
  // Не цепляет горизонтальные свайпы каруселей и не дёргает поиск/шапку.
  const TRIGGER = 150;
  const MAX_PULL = 92;
  const START_MAX_Y = 2;
  const MAX_START_Y = 112;
  const MIN_SHOW_DY = 34;
  const VERTICAL_RATIO = 1.75;

  let startX = 0;
  let startY = 0;
  let pulling = false;
  let lockedHorizontal = false;
  let distance = 0;
  let busy = false;
  let indicator;

  function atTop(){
    return (window.scrollY || document.documentElement.scrollTop || 0) <= START_MAX_Y;
  }

  function isInsideHorizontalScroller(target){
    return !!target?.closest?.('.m-promo-row,.m-carousel,.m-home-products,[data-horizontal-scroll]');
  }

  function indicatorEl(){
    if(indicator) return indicator;
    indicator = document.createElement('div');
    indicator.className = 'm-pull-refresh';
    indicator.innerHTML = '<span>↓</span><b>Потяните вниз</b>';
    document.body.appendChild(indicator);
    return indicator;
  }

  function setText(text){
    const b = indicatorEl().querySelector('b');
    if(b) b.textContent = text;
  }

  function setOffset(px){
    const offset = Math.max(0, Math.min(MAX_PULL, px));
    document.body.style.setProperty('--as-pull-offset', offset + 'px');
  }

  function show(text, state){
    const el = indicatorEl();
    el.classList.add('active');
    el.classList.toggle('ready', state === 'ready');
    el.classList.toggle('refreshing', state === 'refreshing');
    setText(text);
  }

  function reset(){
    pulling = false;
    lockedHorizontal = false;
    distance = 0;
    document.body.classList.remove('m-pull-active', 'm-pull-refreshing');
    document.body.style.removeProperty('--as-pull-offset');
    const el = indicatorEl();
    el.classList.remove('active', 'ready', 'refreshing');
    setText('Потяните вниз');
  }

  async function refresh(){
    if(busy) return;
    busy = true;
    document.body.classList.add('m-pull-refreshing');
    setOffset(64);
    show('Обновляем...', 'refreshing');

    try{
      if(window.AutoStyleMobilePageCache) window.AutoStyleMobilePageCache.clearCurrent?.();
      if(typeof window.autostyleMobileRefresh === 'function') {
        await window.autostyleMobileRefresh('pull-refresh');
        show('Обновлено', 'ready');
        setTimeout(reset, 520);
      } else {
        document.body.classList.add('m-page-soft-reload');
        setTimeout(() => location.reload(), 220);
      }
    } finally {
      setTimeout(() => { busy = false; }, 620);
    }
  }

  document.addEventListener('touchstart', e => {
    if(!atTop() || busy || isInsideHorizontalScroller(e.target)) return;
    const t = e.touches && e.touches[0];
    if(!t || t.clientY > MAX_START_Y) return;
    startX = t.clientX;
    startY = t.clientY;
    pulling = true;
    lockedHorizontal = false;
    distance = 0;
  }, { passive:true });

  document.addEventListener('touchmove', e => {
    if(!pulling || busy) return;
    const t = e.touches && e.touches[0];
    if(!t) return reset();

    const dx = Math.abs(t.clientX - startX);
    const dy = t.clientY - startY;
    if(dy <= 0) return reset();

    if(dx > 14 && dx >= dy * .72){
      lockedHorizontal = true;
      return reset();
    }
    if(lockedHorizontal || dy < MIN_SHOW_DY || dy < dx * VERTICAL_RATIO) return;

    distance = dy;
    const visual = Math.min(MAX_PULL, Math.pow(distance, .82));
    document.body.classList.add('m-pull-active');
    setOffset(visual);
    show(distance > TRIGGER ? 'Отпустите для обновления' : 'Потяните вниз', distance > TRIGGER ? 'ready' : 'pull');
  }, { passive:true });

  document.addEventListener('touchend', () => {
    if(!pulling) return;
    const shouldRefresh = !lockedHorizontal && distance > TRIGGER;
    if(shouldRefresh) refresh();
    else reset();
  }, { passive:true });

  document.addEventListener('touchcancel', reset, { passive:true });
})();
