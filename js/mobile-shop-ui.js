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

/* AutoStyle: плавающая иконка колеса фортуны 50×50 */
(function initFloatingFortuneWheel(){
  if (window.__asFloatingWheelLoaded) return;
  window.__asFloatingWheelLoaded = true;

  const start = () => {
    if (document.getElementById('asFloatingWheel')) return;

    const style = document.createElement('style');
    style.id = 'as-floating-wheel-style';
    style.textContent = `
      #asFloatingWheel{
        position:fixed;
        left:0;
        top:0;
        z-index:850;
        width:50px;
        height:50px;
        display:grid;
        place-items:center;
        border:3px solid #111827;
        border-radius:50%;
        background:
          conic-gradient(
            #2be31d 0 12.5%,
            #2563eb 12.5% 25%,
            #facc15 25% 37.5%,
            #ef4444 37.5% 50%,
            #8b5cf6 50% 62.5%,
            #14b8a6 62.5% 75%,
            #f97316 75% 87.5%,
            #22c55e 87.5% 100%
          );
        box-shadow:0 8px 22px rgba(15,23,42,.24);
        text-decoration:none;
        cursor:pointer;
        user-select:none;
        -webkit-tap-highlight-color:transparent;
        will-change:transform;
        transform:translate3d(0,0,0);
        transition:box-shadow .18s ease,filter .18s ease;
      }

      #asFloatingWheel::before{
        content:"";
        width:18px;
        height:18px;
        border:3px solid #fff;
        border-radius:50%;
        background:#111827;
        box-shadow:0 2px 7px rgba(0,0,0,.24);
      }

      #asFloatingWheel::after{
        content:"";
        position:absolute;
        top:-7px;
        width:0;
        height:0;
        border-left:6px solid transparent;
        border-right:6px solid transparent;
        border-top:10px solid #111827;
      }

      #asFloatingWheel:hover,
      #asFloatingWheel:focus-visible{
        filter:brightness(1.08);
        box-shadow:0 11px 28px rgba(15,23,42,.31);
        outline:none;
      }

      #asFloatingWheel span{
        position:absolute;
        right:-5px;
        bottom:-4px;
        min-width:18px;
        height:18px;
        display:grid;
        place-items:center;
        padding:0 4px;
        border:2px solid #fff;
        border-radius:999px;
        background:#111827;
        color:#2be31d;
        font-size:9px;
        line-height:1;
        font-weight:1000;
      }

      @media(max-width:760px){
        #asFloatingWheel{
          width:46px;
          height:46px;
          z-index:780;
        }
      }

      @media(prefers-reduced-motion:reduce){
        #asFloatingWheel{
          left:auto !important;
          right:16px !important;
          top:auto !important;
          bottom:82px !important;
          transform:none !important;
        }
      }
    `;
    document.head.appendChild(style);

    const link = document.createElement('a');
    link.id = 'asFloatingWheel';
    link.href = location.pathname.includes('/staff-tools/')
      ? '../profile.html#wheel'
      : 'profile.html#wheel';
    link.setAttribute('aria-label', 'Открыть колесо фортуны');
    link.title = 'Колесо фортуны';
    link.innerHTML = '<span>GO</span>';
    document.body.appendChild(link);

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const size = 50;
    const margin = 14;
    let x = Math.max(margin, window.innerWidth - size - 90);
    let y = Math.max(margin + 80, window.innerHeight * 0.62);
    let vx = -0.018;
    let vy = 0.014;
    let paused = false;
    let last = performance.now();

    const clamp = () => {
      const maxX = Math.max(margin, window.innerWidth - size - margin);
      const maxY = Math.max(margin + 70, window.innerHeight - size - margin);
      x = Math.min(Math.max(x, margin), maxX);
      y = Math.min(Math.max(y, margin + 70), maxY);
    };

    const frame = (now) => {
      const dt = Math.min(40, now - last);
      last = now;

      if (!paused && document.visibilityState === 'visible') {
        x += vx * dt;
        y += vy * dt;

        const maxX = Math.max(margin, window.innerWidth - size - margin);
        const minY = margin + 70;
        const maxY = Math.max(minY, window.innerHeight - size - margin);

        if (x <= margin || x >= maxX) {
          vx *= -1;
          x = Math.min(Math.max(x, margin), maxX);
        }

        if (y <= minY || y >= maxY) {
          vy *= -1;
          y = Math.min(Math.max(y, minY), maxY);
        }

        link.style.transform = `translate3d(${x}px,${y}px,0) rotate(${now / 110}deg)`;
      }

      requestAnimationFrame(frame);
    };

    link.addEventListener('mouseenter', () => { paused = true; });
    link.addEventListener('mouseleave', () => {
      paused = false;
      last = performance.now();
    });
    link.addEventListener('focus', () => { paused = true; });
    link.addEventListener('blur', () => {
      paused = false;
      last = performance.now();
    });

    window.addEventListener('resize', clamp, { passive:true });
    document.addEventListener('visibilitychange', () => {
      last = performance.now();
    });

    clamp();
    requestAnimationFrame(frame);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once:true });
  } else {
    start();
  }
})();
