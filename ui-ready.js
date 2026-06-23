(function(){
  function setupCatalogMenu(){
    const menu=document.querySelector('.catalog-menu');
    const btn=document.querySelector('.catalog-btn');
    const popup=document.querySelector('.catalog-popup,.mega-catalog,.catalog-dropdown');
    if(!menu||!btn||!popup)return;

    // ВАЖНО: без overlay и без переноса popup в body.
    // Меню остается внутри .catalog-menu, как в HTML.
    function close(){
      menu.classList.remove('open');
      popup.classList.remove('active');
      document.body.classList.remove('catalog-open');
    }
    function open(){
      menu.classList.add('open');
      popup.classList.add('active');
      document.body.classList.add('catalog-open');
    }
    btn.addEventListener('click',function(e){
      e.preventDefault();
      e.stopPropagation();
      popup.classList.contains('active') ? close() : open();
    });
    popup.addEventListener('click',function(e){ e.stopPropagation(); });
    document.addEventListener('click',function(e){
      if(!menu.contains(e.target)) close();
    });
    document.addEventListener('keydown',function(e){
      if(e.key==='Escape') close();
    });
  }

  function setupBottomNav(){
    if(document.querySelector('.app-bottom-nav'))return;
    const nav=document.createElement('nav');
    nav.className='app-bottom-nav';
    nav.innerHTML=`<a href="index.html"><span class="app-ico">⌂</span><span>Главная</span></a><button type="button" data-open-catalog><span class="app-ico">☰</span><span>Каталог</span></button><a href="catalog.html"><span class="app-ico">🔎</span><span>Поиск</span></a><a href="favorites.html"><span class="app-ico">♡</span><span>Избранное</span></a><a href="cart.html"><span class="app-ico">🛒</span><span>Корзина</span></a>`;
    document.body.appendChild(nav);
    nav.querySelector('[data-open-catalog]').onclick=function(){document.querySelector('.catalog-btn')?.click();};
  }

  document.addEventListener('DOMContentLoaded',function(){
    setupCatalogMenu();
    setupBottomNav();
  });
})();
