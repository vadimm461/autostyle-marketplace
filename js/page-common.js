import { watchUserCart, cartQtyCount } from './user-cart.js';

watchUserCart(cart => {
  const count = cartQtyCount(cart);
  document.querySelectorAll('#cartCount,.cartCount').forEach(el => { el.textContent = String(count); });
});

const input = document.querySelector('#siteSearch');
const btn = document.querySelector('#siteSearchBtn');

function goSearch() {
  const q = encodeURIComponent((input?.value || '').trim());
  location.href = q ? `catalog.html?search=${q}` : 'catalog.html';
}

if (btn) btn.onclick = goSearch;
if (input) input.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    goSearch();
  }
});
