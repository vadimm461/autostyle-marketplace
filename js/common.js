// AutoStyle common mobile/search/cart/account
export function fmtPrice(n){ return new Intl.NumberFormat('ru-RU').format(Number(n||0)) + ' ₽'; }
export function productTitle(p){ return p.title || p.name || 'Товар'; }
export function productImage(p){ return p.image || p.imageUrl || p.photo || ''; }
export function productStock(p){ return Number(p.stock ?? p.quantity ?? p.count ?? 0); }
export function stockText(p){ const s=productStock(p); if(s>10)return 'В наличии больше 10'; if(s>0)return 'В наличии меньше 10'; return 'Нет в наличии'; }
export function oldPrice(p){ return Number(p.oldPrice || p.priceBefore || p.compareAtPrice || 0); }
export function discountPercent(p){ const m=Number(p.discountPercent || p.discount || 0); if(m>0)return m; const old=oldPrice(p), price=Number(p.price||0); return old>price&&price>0?Math.round((old-price)/old*100):0; }
export function priceHtml(p, cls=''){ const price=Number(p.price||0), old=oldPrice(p), d=discountPercent(p); return `<div class="${cls}price-wrap">${old>price&&old>0?`<span class="${cls}oldprice old-price">${fmtPrice(old)}</span>`:''}<span class="${cls}price price">${fmtPrice(price)}</span>${d>0?`<span class="${cls}discount discount-badge">-${d}%</span>`:''}</div>`; }
export function cart(){ return JSON.parse(localStorage.getItem('cart')||'[]'); }
export function setCart(c){ localStorage.setItem('cart', JSON.stringify(c)); updateCartCount(); }
export function addToCart(id){ const c=cart(); c.push(id); setCart(c); }
export function updateCartCount(){ document.querySelectorAll('#cartCount,.cartCount').forEach(x=>x.textContent=cart().length); document.querySelector('#asCartBtn')?.lastChild && null; }

export function initMobileUi(){
  updateCartCount();
  let lastY=window.scrollY||0;
  function onScroll(){ if(innerWidth>820)return; const y=scrollY||0; if(y>180&&y>lastY+4)document.body.classList.add('as-scroll-down'); if(y<lastY-4||y<80)document.body.classList.remove('as-scroll-down'); lastY=y; }
  addEventListener('scroll', onScroll, {passive:true});
  if(!document.querySelector('.as-bottom-nav')){
    const nav=document.createElement('nav'); nav.className='as-bottom-nav';
    const p=location.pathname;
    nav.innerHTML=`<a href="index.html" class="${p.includes('index')||p.endsWith('/')?'active':''}"><span>⌂</span>Главная</a><a href="catalog.html" class="${p.includes('catalog')?'active':''}"><span>▦</span>Каталог</a><button type="button" id="asProfileBtn"><span>●</span>Профиль</button><button type="button" id="asCartBtn"><span>🛒</span>Корзина <b class="cartCount">${cart().length}</b></button>`;
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
  document.querySelectorAll('[data-cart]').forEach(btn=>btn.onclick=e=>{e.preventDefault();e.stopPropagation();addToCart(btn.dataset.cart);btn.textContent='Добавлено';setTimeout(()=>btn.textContent='В корзину',800);});
}

export function setupSearch(){
  const topInput=document.querySelector('.search input');
  const topBtn=document.querySelector('.search button');
  const go=()=>{const q=encodeURIComponent((topInput?.value||'').trim()); location.href=q?`catalog.html?search=${q}`:'catalog.html';};
  if(topBtn)topBtn.onclick=go;
  if(topInput)topInput.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();go();}});
}
