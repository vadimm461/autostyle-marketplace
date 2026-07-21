import { getUserCart, saveUserCart, addToUserCart as addToUserCartRemote, cartQtyCount as userCartQtyCount } from './user-cart.js';
// AutoStyle common mobile/search/cart/account

function ensureProductImageFit(){
  if (document.getElementById('as-product-image-fit-fix')) return;
  const style = document.createElement('style');
  style.id = 'as-product-image-fit-fix';
  style.textContent = `
    .product-img,
    .product-photo,
    .catalog-photo,
    .catalog-card-photo,
    .home-photo,
    .favorite-photo,
    .favorite-card-photo,
    .recent-photo,
    .similar-photo,
    .related-photo,
    .quick-product-img,
    .m-card-img,
    .m-photo,
    .m-search-thumb,
    .product-card .product-photo,
    .product-card [class$="-photo"],
    .product-main-image,
    .product-image,
    .product-gallery-main,
    .product-photo-main,
    .product-media,
    .product-hero-image{
      display:flex !important;
      align-items:center !important;
      justify-content:center !important;
      overflow:hidden !important;
      background:#fff !important;
      background-color:#fff !important;
      isolation:isolate !important;
    }

    .product-img img,
    .product-photo img,
    .catalog-photo img,
    .catalog-card-photo img,
    .home-photo img,
    .favorite-photo img,
    .favorite-card-photo img,
    .recent-photo img,
    .similar-photo img,
    .related-photo img,
    .quick-product-img img,
    .m-card-img img,
    .m-photo img,
    .m-search-thumb img,
    .product-card .product-photo img,
    .product-card [class$="-photo"] img,
    .product-main-image img,
    .product-image img,
    .product-gallery-main img,
    .product-photo-main img,
    .product-media img,
    .product-hero-image img,
    .product-page img.product-img,
    .product-page .product-img img,
    .product-detail img,
    .product-details img{
      width:100% !important;
      height:100% !important;
      max-width:100% !important;
      max-height:100% !important;
      object-fit:contain !important;
      object-position:center center !important;
      display:block !important;
      background:#fff !important;
    }
  `;
  document.head.appendChild(style);
}
ensureProductImageFit();
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureProductImageFit);
else ensureProductImageFit();

export function fmtPrice(n){ return new Intl.NumberFormat('ru-RU').format(Number(n||0)) + ' ₽'; }
export function productTitle(p){ return p.title || p.name || 'Товар'; }
export function productImage(p){
  const first = (...values) => {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (Array.isArray(value)) { const found = first(...value); if (found) return found; }
      if (value && typeof value === 'object') {
        const found = first(value.url, value.src, value.href, value.downloadURL, value.image, value.imageUrl, value.photo, value.photoUrl);
        if (found) return found;
      }
    }
    return '';
  };
  return first(p?.image, p?.imageUrl, p?.photo, p?.photoUrl, p?.img, p?.picture, p?.pictureUrl, p?.mainImage, p?.mainImageUrl, p?.thumbnail, p?.thumb, p?.images, p?.photos, p?.pictures, p?.gallery);
}
export function productStock(p){ return Number(p.stock ?? p.quantity ?? p.count ?? 0); }
export function stockText(p){ const s=productStock(p); if(s>10)return 'В наличии больше 10'; if(s>0)return 'В наличии меньше 10'; return 'Нет в наличии'; }
export function rawOldPrice(p){ return Number(p.oldPrice || p.priceOld || p.priceBefore || p.compareAtPrice || 0); }
export function oldPrice(p){ const op=rawOldPrice(p), price=Number(p.price||0); return op>price?op:0; }
export function discountPercent(p){ const m=Number(p.discountPercent || p.discount || p.discount_percent || p.salePercent || 0), rawOld=rawOldPrice(p), old=oldPrice(p), price=Number(p.price||0); if(m>0)return m; return old>price&&price>0?Math.round((old-price)/old*100):0; }
export function priceHtml(p, cls=''){ const price=Number(p.price||0), old=oldPrice(p), d=discountPercent(p); return `<div class="${cls}price-wrap">${old>price&&old>0?`<span class="${cls}oldprice old-price">${fmtPrice(old)}</span>`:''}<span class="${cls}price price">${fmtPrice(price)}</span>${d>0?`<span class="${cls}discount discount-badge">-${d}%</span>`:''}</div>`; }
export async function cart(){ return await getUserCart(); }
export async function setCart(c){ await saveUserCart(c); updateCartCount(); }
export async function addToCart(id){ await addToUserCartRemote(id); updateCartCount(); }
export function cartQtyCount(rows = []){ return userCartQtyCount(rows); }
export async function updateCartCount(){ const rows = await getUserCart(); const count = userCartQtyCount(rows); document.querySelectorAll('#cartCount,.cartCount').forEach(x=>x.textContent=String(count)); window.dispatchEvent(new Event('autostyle-cart-updated')); document.querySelector('#asCartBtn')?.lastChild && null; }

export function initMobileUi(){
  updateCartCount();
  let lastY=window.scrollY||0;
  function onScroll(){ if(innerWidth>820)return; const y=scrollY||0; if(y>180&&y>lastY+4)document.body.classList.add('as-scroll-down'); if(y<lastY-4||y<80)document.body.classList.remove('as-scroll-down'); lastY=y; }
  addEventListener('scroll', onScroll, {passive:true});
  if(!document.querySelector('.as-bottom-nav')){
    const nav=document.createElement('nav'); nav.className='as-bottom-nav';
    const p=location.pathname;
    nav.innerHTML=`<a href="index.html" class="${p.includes('index')||p.endsWith('/')?'active':''}"><span>⌂</span>Главная</a><a href="catalog.html" class="${p.includes('catalog')?'active':''}"><span>▦</span>Каталог</a><button type="button" id="asProfileBtn"><span>●</span>Профиль</button><button type="button" id="asCartBtn"><span>🛒</span>Корзина <b class="cartCount">0</b></button>`;
    document.body.appendChild(nav);
    nav.querySelector('#asProfileBtn').onclick=()=>document.querySelector('#accountBtn,#openAuth')?.click();
    nav.querySelector('#asCartBtn').onclick=()=>location.href='cart.html';
  }
  document.querySelector('.catalog-btn')?.addEventListener('click',e=>{ if(innerWidth<=820){e.preventDefault();e.stopPropagation();document.querySelector('.catalog-menu')?.classList.toggle('open');}});
  document.addEventListener('click',e=>{const m=document.querySelector('.catalog-menu'); if(m && !m.contains(e.target))m.classList.remove('open');});
}

export function productCard(p, type='catalog'){
  const img=productImage(p);
  return `<article class="${type}-card product-card">
    <a href="product.html?id=${p.id}" class="${type}-link product-link">
      <div class="${type}-photo product-photo">${img?`<img src="${img}" alt="${productTitle(p)}">`:'<span>Фото</span>'}</div>
      <h3>${productTitle(p)}</h3>
      <div class="${type}-cat product-cat">${p.category||''}</div>
      ${priceHtml(p, type+'-')}
      <div class="${type}-stock stock">${stockText(p)}</div>
    </a>
    ${type==='home'? '' : `<button class="cart-btn" data-cart="${p.id}" type="button">В корзину</button>`}
  </article>`;
}

export function bindCartButtons(){
  document.querySelectorAll('[data-cart]').forEach(btn=>btn.onclick=e=>{e.preventDefault();e.stopPropagation();addToCart(btn.dataset.cart).then(()=>{btn.textContent='Добавлено';setTimeout(()=>btn.textContent='В корзину',800);});});
}

export function setupSearch(){
  const topInput=document.querySelector('.search input');
  const topBtn=document.querySelector('.search button');
  const go=()=>{const q=encodeURIComponent((topInput?.value||'').trim()); location.href=q?`catalog.html?search=${q}`:'catalog.html';};
  if(topBtn)topBtn.onclick=go;
  if(topInput)topInput.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();go();}});
}


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
