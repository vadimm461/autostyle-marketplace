import { db, COLLECTIONS, auth } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getProducts } from './data-cache.js';
import { addUserCartItem, getCurrentUserCart, waitUserCartReady, updateCartBadges } from './user-cart-store.js';

const $ = s => document.querySelector(s);
let favs = JSON.parse(localStorage.getItem('favorites') || '[]');
let cart = [];

function clearCartAndFavorites(){
  // Не очищаем корзину и избранное при обычной загрузке страницы или выходе.
  // Иначе гость/разлогин получает пустую корзину сразу после открытия сайта.
  localStorage.removeItem('autostyle_user');
  window.dispatchEvent(new Event('autostyle-account-cleared'));
}

const money = v => `${Number(v || 0).toLocaleString('ru-RU')} ₽`;
const stock = p => Number(p.stock ?? p.quantity ?? p.count ?? 0);
const title = p => p.title || p.name || 'Товар';
const image = p => p.image || p.imageUrl || p.photo || '';
const group = p => p.group || p.category || p.categoryName || 'Без группы';
const rawOldPrice = p => Number(p.oldPrice || p.priceOld || p.priceBefore || p.compareAtPrice || 0);
const oldPrice = p => { const op = rawOldPrice(p), pr = Number(p.price || 0); return op > pr ? op : 0; };
function discount(p){ const d=Number(p.discount||p.discountPercent||0); if(d>0)return d; const op=oldPrice(p), pr=Number(p.price||0); return op>pr&&pr>0?Math.round((op-pr)/op*100):0; }
function saveFav(){ localStorage.setItem('favorites', JSON.stringify(favs)); }
function cartQtyCount(rows = cart){ return (Array.isArray(rows)?rows:[]).reduce((sum,item)=>sum+(item&&typeof item==='object'?Math.max(1,Number(item.qty??item.quantity??item.count??1)||1):1),0); }
function updateCart(){ cart = getCurrentUserCart(); updateCartBadges(cart); }
function setupSearch(){
  const input=$('#siteSearch'), btn=$('#siteSearchBtn');
  const go=()=>{const q=encodeURIComponent((input?.value||'').trim()); location.href=q?`catalog.html?search=${q}`:'catalog.html'};
  btn&&(btn.onclick=go); input&&input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();go();}});
}
function card(p){
  const d=discount(p), op=oldPrice(p), s=stock(p), href=`product.html?id=${encodeURIComponent(p.id)}`;
  return `<article class="as-desktop-product-card catalog-card favorite-card" data-product-href="${href}">
    <div class="catalog-card-photo product-img as-card-photo">
      <a class="product-image-link" href="${href}">${d?`<span class="discount-badge">-${d}%</span>`:''}${image(p)?`<img loading="lazy" decoding="async" src="${image(p)}" alt="${title(p)}">`:'<span>Фото</span>'}</a>
    </div>
    <button class="fav-btn active" data-fav="${p.id}" type="button" aria-label="Избранное">♥</button>
    <a class="catalog-card-link product-card-link" href="${href}">
      <div class="catalog-card-body as-card-info"><h3 class="catalog-card-title product-title">${title(p)}</h3><div class="catalog-card-category product-group">${group(p)}</div></div>
      <div class="catalog-card-price-area as-card-bottom"><div class="price-row-card"><div class="catalog-card-price price-current">${money(p.price)}</div>${op?`<div class="old-price price-old">${money(op)}</div>`:''}</div><div class="catalog-card-stock as-card-stock">${s>0?'В наличии':'Нет в наличии'}</div></div>
    </a>
    <button class="catalog-cart-btn as-card-cart" data-cart="${p.id}" type="button" ${s<=0?'disabled':''} aria-label="В корзину">🛒</button>
  </article>`;
}
function bind(){
  document.querySelectorAll('[data-cart]').forEach(b=>b.onclick=async e=>{e.preventDefault(); try{ await addUserCartItem(b.dataset.cart); cart=getCurrentUserCart(); updateCart(); b.classList.add('added'); setTimeout(()=>b.classList.remove('added'),700); }catch(err){ alert(err?.message || 'Войдите в аккаунт, чтобы добавить товар в корзину'); }});
  document.querySelectorAll('[data-fav]').forEach(b=>b.onclick=e=>{e.preventDefault(); e.stopPropagation(); const id=b.dataset.fav; favs=favs.filter(x=>x!==id); saveFav(); loadFavorites();});
}
async function loadFavorites(){
  const grid=$('#favoritesGrid'), titleEl=$('#favoritesCount'); if(!grid) return;
  favs = JSON.parse(localStorage.getItem('favorites') || '[]');
  titleEl && (titleEl.textContent = favs.length ? `Избранное: ${favs.length}` : 'Избранное');
  if(!favs.length){ grid.innerHTML='<div class="notice">В избранном пока пусто.</div>'; return; }
  grid.innerHTML='<div class="app-loader">Загрузка избранного...</div>';
  let allProducts = [];
  try { allProducts = await getProducts(); } catch(e) { allProducts = []; }
  const byId = new Map(allProducts.map(p => [String(p.id), p]));
  const products = favs.map(id => byId.get(String(id))).filter(Boolean);
  if(!products.length){ grid.innerHTML='<div class="notice">Товары из избранного не найдены.</div>'; return; }
  grid.innerHTML=products.map(card).join(''); bind();
}
setupSearch();
onAuthStateChanged(auth, async user => {
  if (!user) { clearCartAndFavorites(); }
  await waitUserCartReady();
  cart = getCurrentUserCart();
  favs = JSON.parse(localStorage.getItem('favorites') || '[]');
  updateCart();
  loadFavorites().finally(()=>window.AutoStyleLoader&&window.AutoStyleLoader.hide());
});


function setupProductCardOpen(){
  if (document.dataset && document.documentElement.dataset.productOpenReady === '1') return;
  document.documentElement.dataset.productOpenReady = '1';
  document.addEventListener('click', e => {
    if (e.defaultPrevented) return;
    if (e.target.closest('button, input, select, textarea, label, .fav-btn, .cart, .cart-btn, .catalog-cart-btn, [data-cart], [data-fav]')) return;
    const card = e.target.closest('.product-card, .catalog-card, .related-card, .favorite-card, .home-product-card');
    if (!card) return;
    const link = e.target.closest('a[href*="product.html"]') || card.querySelector('a[href*="product.html"]');
    if (!link || !link.href) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    location.href = link.href;
  });
}
setupProductCardOpen();
