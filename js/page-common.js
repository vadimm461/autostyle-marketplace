const cart = JSON.parse(localStorage.getItem('cart') || '[]');
const cartCount = document.querySelector('#cartCount');
if (cartCount) cartCount.textContent = cart.length;

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
