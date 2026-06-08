(function(){
  function ready(fn){document.readyState==='loading'?document.addEventListener('DOMContentLoaded',fn):fn();}
  const parentIcons=['♧','▣','✤','◆','⚒','☼','◉','▤','▦','✽','◎'];
  const fallbackParents=['Автохимия','Аккумуляторы','Ароматизаторы','Масла и жидкости','Инструменты','Освещение','Тормозная система','Фильтры','Электроника','Крепеж и расходники','Шины и диски','Аксессуары'];
  const fallbackChildren=[['Очистители','Разные очистители'],['Антифризы','Охлаждающие жидкости'],['Полироли','Для кузова и салона'],['Смазки','Смазки и спреи'],['Присадки','Для двигателя'],['Удалители','Удаление загрязнений'],['Шампуни','Автошампуни'],['Клеи и герметики','Для любых задач']];
  function cleanHeader(){
    document.querySelectorAll('.topbar .icon-btn').forEach(btn=>{
      let t=(btn.textContent||'').replace(/^[♡❤🔔👤🛒\s]+/,'').trim();
      if(/Аккаунт/i.test(t)) btn.innerHTML='<span class="as-ico">♙</span> Аккаунт';
      if(/Уведомления/i.test(t)){let c=btn.querySelector('#notificationCount,.as-notify-count');btn.innerHTML='<span class="as-ico">♧</span> Уведомления '; if(c) btn.appendChild(c);}
      if(/Избранное/i.test(t)) btn.innerHTML='<span class="as-ico">♡</span> Избранное';
      if(/Корзина/i.test(t)){let c=btn.querySelector('#cartCount');btn.innerHTML='<span class="as-ico">🛒</span> Корзина '; if(c) btn.appendChild(c);}
    });
  }
  function enhanceMega(){
    const menu=document.querySelector('.catalog-menu'); if(!menu)return;
    const pop=menu.querySelector('.catalog-popup'); if(!pop)return;
    menu.addEventListener('click',e=>{ if(e.target.closest('.catalog-btn')){e.preventDefault();menu.classList.toggle('open');}});
    document.addEventListener('click',e=>{if(!menu.contains(e.target))menu.classList.remove('open')});
    const pb=document.getElementById('catalogParents'), cb=document.getElementById('catalogChildren'), title=document.getElementById('megaTitle');
    const hydrate=()=>{
      if(pb && !pb.querySelector('.mega-parent') && /Категорий пока нет/i.test(pb.textContent||'')){
        pb.innerHTML=fallbackParents.map((x,i)=>`<button class="mega-parent ${i?'':'active'}" type="button">${x}</button>`).join('');
      }
      if(cb && (!cb.children.length || /категорий/i.test(cb.textContent||''))){
        if(title) title.textContent='Популярные подкатегории';
        cb.innerHTML=fallbackChildren.map(x=>`<a href="catalog.html?search=${encodeURIComponent(x[0])}" class="mega-child"><div><b>${x[0]}</b><small>${x[1]}</small></div></a>`).join('')+`<a href="catalog.html" class="mega-child mega-child-all"><div><b>Скидки до 30% на автохимию</b><small>Успейте купить выгодно!</small></div></a>`;
      }
      if(title && title.textContent && !/Популярные/i.test(title.textContent)) title.textContent='Популярные подкатегории';
    };
    hydrate(); setTimeout(hydrate,500); setTimeout(hydrate,1500);
  }
  function markSections(){
    document.querySelectorAll('.section-block').forEach(s=>s.classList.remove('section-dark'));
    document.querySelectorAll('.products').forEach(p=>p.setAttribute('data-limit','5'));
  }
  function run(){cleanHeader();enhanceMega();markSections();setTimeout(()=>{cleanHeader();markSections();},1000);}
  ready(run);
})();
