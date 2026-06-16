function readCartRows() {
  const keys = ['cart', 'autostyle_cart', 'as_cart', 'cartItems'];
  for (const key of keys) {
    try {
      const rows = JSON.parse(localStorage.getItem(key) || '[]');
      if (Array.isArray(rows) && rows.length) return rows;
    } catch (_) {}
  }
  return [];
}

function cartCountValue(rows = readCartRows()) {
  return rows.reduce((sum, item) => {
    if (item && typeof item === 'object') return sum + Math.max(1, Number(item.qty ?? item.quantity ?? item.count ?? 1) || 1);
    return sum + 1;
  }, 0);
}

function updateHeaderCartCount() {
  const count = cartCountValue();
  document.querySelectorAll('#cartCount,.cartCount').forEach(el => { el.textContent = String(count); });
}

updateHeaderCartCount();
window.addEventListener('storage', updateHeaderCartCount);
window.addEventListener('autostyle-cart-updated', updateHeaderCartCount);
window.AutoStyleUpdateCartCount = updateHeaderCartCount;

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
