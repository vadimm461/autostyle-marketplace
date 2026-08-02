(function(){
  let lastY = window.scrollY || 0;

  function onScroll(){
    if (window.innerWidth > 820) return;
    const y = window.scrollY || 0;
    if (y > 160 && y > lastY) document.body.classList.add('header-compact');
    else if (y < lastY || y < 80) document.body.classList.remove('header-compact');
    lastY = y;
  }

  function addBottomNav(){
    if (document.querySelector('.mobile-bottom-nav')) return;
    const cartCount = document.querySelector('#cartCount')?.textContent || '0';
    const nav = document.createElement('nav');
    nav.className = 'mobile-bottom-nav';
    nav.innerHTML = `
      <a href="index.html" class="${location.pathname.includes('index') || location.pathname.endsWith('/') ? 'active' : ''}"><span>⌂</span>Главная</a>
      <a href="catalog.html" class="${location.pathname.includes('catalog') ? 'active' : ''}"><span>▦</span>Каталог</a>
      <button type="button" id="mobileProfileBtn"><span>●</span>Профиль</button>
      <button type="button" id="mobileCartBtn"><span>🛒</span>Корзина ${cartCount}</button>
    `;
    document.body.appendChild(nav);

    document.querySelector('#mobileProfileBtn')?.addEventListener('click', () => {
      const account = document.querySelector('#openAuth, #accountBtn');
      if (account) account.click();
    });
    document.querySelector('#mobileCartBtn')?.addEventListener('click', () => location.href = 'cart.html');
  }

  document.addEventListener('DOMContentLoaded', () => {
    addBottomNav();
    onScroll();
  });

  window.addEventListener('scroll', onScroll, { passive:true });
})();
