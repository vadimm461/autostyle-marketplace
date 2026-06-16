function safeParseArray(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function cartItemQty(item) {
  if (!item) return 0;
  if (typeof item === 'string' || typeof item === 'number') return 1;
  const qty = Number(item.qty ?? item.quantity ?? item.count ?? 1);
  return Number.isFinite(qty) && qty > 0 ? qty : 1;
}

function cartQty() {
  const keys = ['cart', 'autostyle_cart', 'as_cart', 'cartItems'];
  let best = [];
  for (const key of keys) {
    const rows = safeParseArray(localStorage.getItem(key));
    if (rows.length > best.length) best = rows;
  }
  return best.reduce((sum, item) => sum + cartItemQty(item), 0);
}

function updateCartCount() {
  const count = cartQty();
  document.querySelectorAll('#cartCount,.cartCount').forEach(el => {
    el.textContent = String(count);
    el.dataset.count = String(count);
  });
}

updateCartCount();
window.addEventListener('storage', updateCartCount);
window.addEventListener('autostyle-cart-updated', updateCartCount);
window.AutoStyleUpdateCartCount = updateCartCount;

const input = document.querySelector('#siteSearch, #topSearch, #homeSearch');
const btn = document.querySelector('#siteSearchBtn, #topSearchBtn, #homeSearchBtn');

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
