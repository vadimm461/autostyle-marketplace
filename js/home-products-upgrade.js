import { db, COLLECTIONS } from './firebase.js';
import { collection, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const fmt = new Intl.NumberFormat('ru-RU');
const grid = document.querySelector('#productsGrid');
const tabs = [...document.querySelectorAll('.product-tab')];
let products = [];

function stock(p){ return Number(p.stock ?? p.quantity ?? p.count ?? 0); }
function title(p){ return p.title || p.name || 'Товар'; }
function image(p){ return p.image || p.imageUrl || p.photo || ''; }
function rawOldPrice(p){ return Number(p.oldPrice || p.priceOld || p.priceBefore || p.compareAtPrice || 0); }
function oldPrice(p){ const op=rawOldPrice(p), price=Number(p.price||0); return op>price?op:0; }

function discountPercent(p){
  const manual = Number(p.discountPercent || p.discount || 0);
  if (manual > 0) return manual;
  const old = oldPrice(p);
  const price = Number(p.price || 0);
  if (old > price && price > 0) return Math.round(((old - price) / old) * 100);
  return 0;
}

function priceHtml(p){
  const price = Number(p.price || 0);
  const old = oldPrice(p);
  const discount = discountPercent(p);
  return `
    <div class="home-price-wrap">
      ${old > price && old > 0 ? `<div class="home-oldprice">${fmt.format(old)} ₽</div>` : ''}
      <div class="home-price">${fmt.format(price)} ₽</div>
      ${discount > 0 ? `<div class="home-discount">-${discount}%</div>` : ''}
    </div>
  `;
}

function render(filter = 'hot'){
  if (!grid) return;
  const list = products
    .filter(p => stock(p) > 0)
    .filter(p => p.showOnHome === true || p.tag === filter || p.label === filter)
    .slice(0, 24);

  grid.innerHTML = list.length ? list.map(p => `
    <article class="home-product-card">
      <a href="product.html?id=${p.id}" class="home-product-link">
        <div class="home-product-photo">${image(p) ? `<img src="${image(p)}" alt="${title(p)}">` : '<span>Фото</span>'}</div>
        <h3>${title(p)}</h3>
        <div class="home-product-cat">${p.category || ''}</div>
        ${priceHtml(p)}
      </a>
    </article>
  `).join('') : '<div class="notice">Товары не найдены.</div>';
}

async function load(){
  if (!grid) return;
  const snap = await getDocs(collection(db, COLLECTIONS.products));
  products = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  render(document.querySelector('.product-tab.active')?.dataset.filter || 'hot');
}

tabs.forEach(btn => {
  btn.addEventListener('click', () => {
    tabs.forEach(x => x.classList.remove('active'));
    btn.classList.add('active');
    render(btn.dataset.filter || 'hot');
  });
});

load();
