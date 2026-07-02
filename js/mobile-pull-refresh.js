(function(){
  'use strict';
  let startY = 0;
  let pulling = false;
  let distance = 0;
  let busy = false;
  let indicator;
  function el(){
    if(indicator) return indicator;
    indicator = document.createElement('div');
    indicator.className = 'm-pull-refresh';
    indicator.innerHTML = '<span>↓</span><b>Потяните для обновления</b>';
    document.body.appendChild(indicator);
    return indicator;
  }
  function setState(text, active){
    const x = el();
    x.classList.toggle('active', !!active);
    x.querySelector('b').textContent = text;
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
      setTimeout(()=>setState('Потяните для обновления', false), 600);
    }finally{ busy = false; }
  }
  document.addEventListener('touchstart', e=>{
    if(window.scrollY > 2 || busy) return;
    startY = e.touches[0].clientY;
    pulling = true;
    distance = 0;
  }, { passive:true });
  document.addEventListener('touchmove', e=>{
    if(!pulling || busy) return;
    distance = e.touches[0].clientY - startY;
    if(distance < 0) return;
    const ready = distance > 78;
    setState(ready ? 'Отпустите для обновления' : 'Потяните для обновления', true);
    el().style.transform = `translate(-50%, ${Math.min(distance/2, 58)}px)`;
  }, { passive:true });
  document.addEventListener('touchend', ()=>{
    if(!pulling) return;
    pulling = false;
    const should = distance > 78;
    distance = 0;
    if(should) refresh();
    else {
      const x = el();
      x.style.transform = '';
      setState('Потяните для обновления', false);
    }
  }, { passive:true });
})();
