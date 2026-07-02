// AutoStyle catalog menu: real dropdown, without overlay and without moving DOM nodes
(function(){
  function setupCatalogMenu(){
    const menu = document.querySelector('.catalog-menu');
    const btn = menu?.querySelector('.catalog-btn');
    const popup = menu?.querySelector('.catalog-popup,.mega-catalog,.catalog-dropdown');
    if(!menu || !btn || !popup || menu.dataset.realMenuReady === '1') return;
    menu.dataset.realMenuReady = '1';

    function close(){
      menu.classList.remove('open');
      popup.classList.remove('active');
      document.body.classList.remove('catalog-open');
      document.querySelector('.page-dim')?.classList.remove('active');
    }
    function open(){
      menu.classList.add('open');
      popup.classList.add('active');
      document.body.classList.add('catalog-open');
      document.querySelector('.page-dim')?.classList.add('active');
    }
    btn.addEventListener('click', function(e){
      e.preventDefault();
      e.stopPropagation();
      menu.classList.contains('open') ? close() : open();
    });
    popup.addEventListener('click', function(e){ e.stopPropagation(); });
    document.querySelector('.page-dim')?.addEventListener('click', close);
    document.addEventListener('click', function(e){ if(!menu.contains(e.target)) close(); });
    document.addEventListener('keydown', function(e){ if(e.key === 'Escape') close(); });
  }

  function setupBottomNav(){
    if(document.querySelector('.app-bottom-nav')) return;
    const nav=document.createElement('nav');
    nav.className='app-bottom-nav';
    nav.innerHTML=`<a href="index.html"><span class="app-ico">⌂</span><span>Главная</span></a><button type="button" data-open-catalog><span class="app-ico">☰</span><span>Каталог</span></button><a href="catalog.html"><span class="app-ico">🔎</span><span>Поиск</span></a><a href="favorites.html"><span class="app-ico">♡</span><span>Избранное</span></a><a href="cart.html"><span class="app-ico">🛒</span><span>Корзина</span></a>`;
    document.body.appendChild(nav);
    nav.querySelector('[data-open-catalog]')?.addEventListener('click',()=>document.querySelector('.catalog-btn')?.click());
  }

  document.addEventListener('DOMContentLoaded',()=>{ setupCatalogMenu(); setupBottomNav(); });
})();

// AutoStyle: catalog button must be a normal link when there is no real dropdown menu.
(function(){
  document.addEventListener('click', function(e){
    const btn = e.target.closest('a.catalog-btn[href]');
    if(!btn) return;
    if(btn.closest('.catalog-menu')) return;
    const href = btn.getAttribute('href') || 'catalog.html';
    if(!/catalog\.html/i.test(href)) return;
    if(location.pathname.split('/').pop() === 'catalog.html' && (!btn.search || btn.search === location.search)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    window.location.href = href;
  }, true);
})();
