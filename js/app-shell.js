(function(){
  const path = location.pathname.split('/').pop() || 'index.html';
  const isAdmin = path === 'admin.html';
  if (isAdmin) return;

  const body = document.body;
  const topbar = document.querySelector('.topbar');
  const productArea = document.querySelector('#productsBlock, #catalogGrid, .catalog-results, .product-page, main');
  let ticking = false;

  function nearProducts(){
    if (!topbar || !productArea) return false;
    const rect = productArea.getBoundingClientRect();
    const passedIntoProducts = rect.top < 80;
    const stillNearContent = rect.bottom > 160;
    return window.scrollY > 120 && passedIntoProducts && stillNearContent;
  }
  function updateHeader(){
    body.classList.toggle('app-scrolling-products', nearProducts());
    ticking = false;
  }
  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(updateHeader);
      ticking = true;
    }
  }, {passive:true});
  window.addEventListener('resize', updateHeader);
  updateHeader();

  const nav = document.createElement('nav');
  nav.className = 'app-bottom-nav';
  nav.setAttribute('aria-label','Нижнее меню');
  const items = [
    ['index.html','⌂','Главная'],
    ['catalog.html','☰','Каталог'],
    ['#search','⌕','Поиск'],
    ['cart.html','🛒','Корзина'],
    ['#account','♡','Профиль']
  ];
  nav.innerHTML = items.map(([href,ico,label]) => {
    const active = (href === path) || (path === '' && href === 'index.html');
    const badge = label === 'Корзина' ? '<span class="app-badge" id="appCartBadge">0</span>' : '';
    const tag = href.startsWith('#') ? 'button type="button" data-action="'+href.slice(1)+'"' : 'a href="'+href+'"';
    return `<${tag} class="${active ? 'active' : ''}"><span class="app-ico">${ico}</span><span>${label}</span>${badge}</${href.startsWith('#') ? 'button' : 'a'}>`;
  }).join('');
  document.body.appendChild(nav);

  function syncCart(){
    let count = 0;
    try { count = JSON.parse(localStorage.getItem('cart') || '[]').length; } catch(e) {}
    document.querySelectorAll('#cartCount,#appCartBadge').forEach(el => el.textContent = count);
  }
  syncCart();
  window.addEventListener('storage', syncCart);
  document.addEventListener('click', () => setTimeout(syncCart, 80));

  nav.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'search') {
      const input = document.querySelector('.topbar .search input, #search');
      if (input) { input.focus(); input.scrollIntoView({behavior:'smooth', block:'center'}); }
      else location.href = 'catalog.html';
    }
    if (action === 'account') {
      const openAuth = document.querySelector('#openAuth,#accountBtn');
      if (openAuth) openAuth.click();
      else location.href = 'profile.html';
    }
  });

  const oldCartBtn = document.querySelector('#cartBtn');
  if (oldCartBtn && oldCartBtn.tagName === 'BUTTON') oldCartBtn.addEventListener('click', () => location.href = 'cart.html');

  const filters = document.querySelector('.catalog-filters');
  if (filters) {
    const fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'app-filter-fab';
    fab.textContent = '⚙ Фильтры';
    document.body.appendChild(fab);
    fab.addEventListener('click', () => filters.classList.toggle('app-open'));
    filters.addEventListener('change', () => { if (innerWidth <= 920) filters.classList.remove('app-open'); });
  }
})();
