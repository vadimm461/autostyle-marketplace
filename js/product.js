import { db, COLLECTIONS, auth } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getProducts } from './data-cache.js';
import { addUserCartItem, getCurrentUserCart, waitUserCartReady, updateCartBadges } from './user-cart-store.js';

const $ = s => document.querySelector(s);
let cart = [];
let favs = JSON.parse(localStorage.getItem('favorites') || '[]');

function clearCartAndFavorites(){
  // Не очищаем корзину и избранное при обычной загрузке страницы или выходе.
  // Иначе гость/разлогин получает пустую корзину сразу после открытия сайта.
  localStorage.removeItem('autostyle_user');
  window.dispatchEvent(new Event('autostyle-account-cleared'));
}


const money = v => `${Number(v || 0).toLocaleString('ru-RU')} ₽`;
const stock = p => Number(p.stock ?? p.quantity ?? p.count ?? 0);
const title = p => p.title || p.name || 'Без названия';
const image = p => p.image || p.imageUrl || p.photo || '';
const group = p => p.group || p.category || p.categoryName || 'Без группы';
const rawOldPrice = p => Number(p.oldPrice || p.priceOld || p.priceBefore || p.compareAtPrice || 0);
const oldPrice = p => { const op = rawOldPrice(p), pr = Number(p.price || 0); return op > pr ? op : 0; };
const productPrice = p => Number(p.price || 0);
const isInstallment = p => p.installment === true || p.installmentAvailable === true || p.credit === true || productPrice(p) >= 199;
const installmentMonth = p => Math.ceil(productPrice(p) / 12);
function discount(p){
  const manual = Number(p.discount || p.discountPercent || p.discount_percent || p.salePercent || 0);
  const rawOp = rawOldPrice(p), op = oldPrice(p), pr = Number(p.price || 0);
  // Если старая цена равна текущей, скидку не показываем — это защита от зависшей скидки в Firestore/кэше.
  if (manual > 0) return manual;
  return op > pr && pr > 0 ? Math.round((op - pr) / op * 100) : 0;
}

function escapeHtml(value){
  return String(value ?? '').replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
}
function productHref(p){ return `product.html?id=${encodeURIComponent(p.id)}`; }
function relatedCard(p){
  const s = stock(p), name = title(p), im = image(p), d = discount(p), op = oldPrice(p);
  const favActive = favs.includes(p.id);
  const href = productHref(p);
  const badge = d ? `<span class="as-exact-badge">-${d}%</span>` : (p.isNew || p.new || p.isNewProduct ? `<span class="as-exact-badge new">НОВИНКА</span>` : (p.hit || p.bestseller ? `<span class="as-exact-badge hit">ХИТ</span>` : ''));
  return `
    <article class="as-product-card-exact related-card product-card" data-id="${escapeHtml(p.id)}" data-product-href="${href}">
      ${badge}
      <a class="as-exact-photo" href="${href}" aria-label="${escapeHtml(name)}">
        ${im ? `<img loading="lazy" decoding="async" src="${escapeHtml(im)}" alt="${escapeHtml(name)}">` : `<span class="as-exact-no-photo">Фото</span>`}
      </a>
      <button class="fav-btn as-exact-fav related-fav ${favActive ? 'active' : ''}" type="button" aria-label="Избранное">${favActive ? '♥' : '♡'}</button>
      <div class="as-exact-info">
        <a class="as-exact-title product-title" href="${href}">${escapeHtml(name)}</a>
        <div class="as-exact-category product-group">${escapeHtml(group(p))}</div>
      </div>
      <div class="as-exact-bottom">
        <div class="as-exact-price-row price-row-card"><div class="as-exact-price price">${money(p.price)}</div>${op ? `<div class="as-exact-old-price old-price">${money(op)}</div>` : ''}</div>
        <div class="as-exact-stock catalog-card-stock ${s > 0 ? '' : 'out'}">${s > 0 ? 'В наличии' : 'Нет в наличии'}</div>
        <button class="as-exact-cart cart related-cart" type="button" ${s <= 0 ? 'disabled' : ''} aria-label="В корзину"></button>
      </div>
    </article>`;
}
function setupRelatedActions(){
  document.querySelectorAll('.related-cart').forEach(btn => {
    btn.onclick = async (e) => {
      const card = e.currentTarget.closest('.related-card');
      const id = card?.dataset.id;
      if (!id) return;
      await addUserCartItem(id); cart = getCurrentUserCart(); saveCart();
      e.currentTarget.textContent = '✓ Добавлено';
      setTimeout(() => e.currentTarget.textContent = '🛒', 1000);
    };
  });
  document.querySelectorAll('.related-fav').forEach(btn => {
    btn.onclick = async (e) => {
      e.preventDefault(); e.stopPropagation();
      const card = e.currentTarget.closest('.related-card');
      const id = card?.dataset.id;
      if (!id) return;
      favs = favs.includes(id) ? favs.filter(x => x !== id) : [...favs, id];
      saveFav();
      e.currentTarget.classList.toggle('active', favs.includes(id));
      e.currentTarget.textContent = favs.includes(id) ? '♥' : '♡';
    };
  });
}

function setupRelatedCarousel(){
  const wrap = document.querySelector('.related-carousel-wrap');
  const row = document.querySelector('.related-carousel');
  if (!wrap || !row) return;
  const step = () => Math.max(260, Math.round(row.clientWidth * 0.85));
  const prev = wrap.querySelector('.related-prev');
  const next = wrap.querySelector('.related-next');
  if (prev) prev.onclick = () => row.scrollBy({ left: -step(), behavior: 'smooth' });
  if (next) next.onclick = () => row.scrollBy({ left: step(), behavior: 'smooth' });
}

async function renderRelated(current){
  const box = document.getElementById('relatedProducts');
  if (!box) return;
  try{
    const products = await getProducts();
    const currentGroup = group(current).toLowerCase().trim();
    const currentParent = (current.parentCategory || current.parentGroup || current.categoryParent || '').toLowerCase().trim();
    let related = products.filter(p => p.id !== current.id && stock(p) > 0 && group(p).toLowerCase().trim() === currentGroup);
    if (related.length < 4 && currentParent){
      const extra = products.filter(p => p.id !== current.id && stock(p) > 0 && !related.some(x => x.id === p.id) && String(p.parentCategory || p.parentGroup || p.categoryParent || '').toLowerCase().trim() === currentParent);
      related = [...related, ...extra];
    }
    if (!related.length){ box.innerHTML = ''; return; }
    related = related.slice(0, 12);
    const canScroll = related.length > 4;
    box.innerHTML = `<section class="related-section"><div class="section-head related-head"><h2>Похожие товары</h2><a href="catalog.html?category=${encodeURIComponent(group(current))}">Смотреть все</a></div><div class="related-carousel-wrap">${canScroll ? '<button class="related-nav related-prev" type="button" aria-label="Назад">‹</button>' : ''}<div class="related-carousel">${related.map(relatedCard).join('')}</div>${canScroll ? '<button class="related-nav related-next" type="button" aria-label="Вперёд">›</button>' : ''}</div></section>`;
    setupRelatedActions();
    setupRelatedCarousel();
  }catch(e){ box.innerHTML = ''; }
}

function saveCart(){
  cart = getCurrentUserCart();
  updateCartBadges(cart);
}
function saveFav(){ localStorage.setItem('favorites', JSON.stringify(favs)); }
function saveViewed(id){
  let v = JSON.parse(localStorage.getItem('viewedProducts') || '[]');
  v = v.filter(x => x !== id);
  v.unshift(id);
  localStorage.setItem('viewedProducts', JSON.stringify(v.slice(0, 12)));
}
function setupSearch(){
  const input = $('#siteSearch') || $('#homeSearch'), btn = $('#siteSearchBtn') || $('#homeSearchBtn');
  const go = () => {
    const q = encodeURIComponent((input?.value || '').trim());
    location.href = q ? `catalog.html?search=${q}` : 'catalog.html';
  };
  btn && (btn.onclick = go);
  input && input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
}
async function loadProduct(){
  const box = $('#productView');
  if (!box) return;
  const id = new URLSearchParams(location.search).get('id');
  if (!id) { box.innerHTML = '<div class="product-message">Товар не найден.</div>'; return; }
  try {
    let productsCache = [];
    try { productsCache = await getProducts(); } catch(e) { productsCache = []; }

    // На странице товара берём сам товар напрямую из Firestore,
    // чтобы правки цены/скидки не зависали из старого кэша.
    let p = null;
    try {
      const snap = await getDoc(doc(db, COLLECTIONS.products, id));
      if (snap.exists()) p = { id: snap.id, ...snap.data() };
    } catch(e) {
      console.warn('Не удалось загрузить товар напрямую, используем кэш', e);
    }
    if (!p) p = productsCache.find(x => String(x.id) === String(id));
    if (!p) { box.innerHTML = '<div class="product-message">Товар удалён или не найден.</div>'; return; }
    const s = stock(p), name = title(p), img = image(p), d = discount(p), op = oldPrice(p), inst = isInstallment(p);
    saveViewed(p.id);
    document.title = `${name} — AutoStyle`;
    const favActive = favs.includes(p.id);
    box.innerHTML = `
      <div class="product-gallery product-card-clean">
        <div class="main-photo product-main-photo">
          ${d ? `<span class="discount-badge product-sale-badge">-${d}%</span>` : ''}
          ${img ? `<img loading="lazy" decoding="async" src="${img}" alt="${name}">` : `<div class="photo-empty">Фото</div>`}
        </div>
      </div>
      <div class="product-info-panel product-card-clean product-info-clean">
        <div class="breadcrumbs product-breadcrumbs"><a href="index.html">Главная</a> / <a href="catalog.html">Каталог</a> / <a class="cat-link" href="catalog.html?category=${encodeURIComponent(group(p))}">${escapeHtml(group(p))}</a></div>
        <h1>${escapeHtml(name)}</h1>
        <div class="product-meta-row"><span class="product-category-pill"><a href="catalog.html?category=${encodeURIComponent(group(p))}">${escapeHtml(group(p))}</a></span>${d ? `<span class="product-discount-pill">Скидка ${d}%</span>` : ''}</div>
        <div class="buy-card product-buy-card">
          <div class="product-price-box">
            <div class="price-row-card product-price-row">
              <div class="price-big product-price-big">${money(p.price)}</div>
              ${op ? `<div class="old-price product-old-price">${money(op)}</div>` : ''}
              ${inst ? `<div class="product-installment-inline"><b>Рассрочка</b><span>от ${money(installmentMonth(p))} в мес. на 12 мес.</span></div>` : ''}
            </div>
            ${s > 0 ? `<div class="stock-ok product-stock-ok">В наличии: ${s}</div>` : `<div class="stock-zero product-stock-zero">Нет в наличии</div>`}
          </div>
          <div class="product-actions">
            <button id="addToCart" class="buy-btn product-action-btn" ${s <= 0 ? 'disabled' : ''}>В корзину</button>
            <button id="favProduct" class="quick-btn product-fav-btn ${favActive ? 'active' : ''}" type="button">${favActive ? '♥ В избранном' : '♡ В избранное'}</button>
          </div>
        </div>
        <section class="product-block description-collapsed" id="productDescriptionBlock">
          <div class="product-block-head"><h2>Описание</h2><button class="product-desc-toggle" id="toggleProductDescription" type="button">Показать</button></div>
          <p>${escapeHtml(p.description || 'Описание товара пока не добавлено.')}</p>
        </section>
        <section class="product-block"><h2>Характеристики</h2>
          <div class="spec"><span>Название</span><b>${name}</b></div>
          <div class="spec"><span>Группа</span><b><a href="catalog.html?category=${encodeURIComponent(group(p))}">${escapeHtml(group(p))}</a></b></div>
          <div class="spec"><span>Остаток</span><b>${s}</b></div>
          <div class="spec"><span>Цена</span><b>${money(p.price)}</b></div>
          ${d ? `<div class="spec"><span>Скидка</span><b>${d}%</b></div>` : ''}
        </section>
      </div>
      <div id="relatedProducts" class="product-related-wrap"></div>`;
    const descBlock = document.getElementById('productDescriptionBlock');
    const descToggle = document.getElementById('toggleProductDescription');
    if (descBlock && descToggle) {
      descToggle.onclick = () => {
        const open = descBlock.classList.toggle('description-open');
        descBlock.classList.toggle('description-collapsed', !open);
        descToggle.textContent = open ? 'Скрыть' : 'Показать';
      };
    }
    $('#addToCart') && ($('#addToCart').onclick = async () => {
      if (s <= 0) return;
      try { await addUserCartItem(p.id); cart = getCurrentUserCart(); saveCart(); } catch(err) { alert(err?.message || 'Войдите в аккаунт, чтобы добавить товар в корзину'); return; }
      $('#addToCart').textContent = '✓ Добавлено';
      setTimeout(() => $('#addToCart').textContent = 'В корзину', 1200);
    });
    $('#favProduct') && ($('#favProduct').onclick = () => {
      favs = favs.includes(p.id) ? favs.filter(x => x !== p.id) : [...favs, p.id];
      saveFav();
      $('#favProduct').classList.toggle('active', favs.includes(p.id));
      $('#favProduct').textContent = favs.includes(p.id) ? '♥ В избранном' : '♡ В избранное';
    });
    renderRelated(p);
  } catch (err) {
    box.innerHTML = `<div class="product-message">Ошибка загрузки: ${err.message}</div>`;
  }
}
setupSearch();
onAuthStateChanged(auth, async user => {
  if (!user) { clearCartAndFavorites(); }
  await waitUserCartReady();
  cart = getCurrentUserCart();
  favs = JSON.parse(localStorage.getItem('favorites') || '[]');
  saveCart();
  loadProduct().finally(()=>window.AutoStyleLoader&&window.AutoStyleLoader.hide());
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
