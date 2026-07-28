const normalizeSearchText = value => String(value || '')
  .trim()
  .toLocaleLowerCase('ru-RU')
  .replace(/ё/g, 'е')
  .replace(/[\s_-]+/g, ' ');

const productTitle = product => product.title || product.name || 'Без названия';
const productGroup = product => product.group || product.category || product.categoryName || '';
const productPrice = product => Number(product.price || 0);
const productStock = product => Number(product.stock ?? product.quantity ?? product.count ?? product.qty ?? 1);
const money = value => Number(value || 0).toLocaleString('ru-RU') + ' ₽';

function productImage(product) {
  const raw = product.cardImage || product.thumbnailUrl || product.thumbnail || product.thumb
    || product.image || product.imageUrl || product.photo || product.photoUrl || '';
  const value = String(raw || '').trim();
  if (!value || /^фото\S*/i.test(value) || /\s{2,}|[а-яё]{3,}/i.test(value)) return '';
  if (/^(https?:|data:image\/|\.\/|\/|assets\/|images\/|img\/|uploads\/)/i.test(value)) return value;
  if (/\.(png|jpe?g|webp|gif|svg)(\?|#|$)/i.test(value)) return value;
  return '';
}

export function setupDesktopLiveSearch(options = {}) {
  const input = options.input;
  const button = options.button;
  const form = input?.closest('form') || input?.parentElement;
  if (!input || !form || form.dataset.liveSearchReady === '1') return;

  form.dataset.liveSearchReady = '1';
  form.classList.add('as-live-search');
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('enterkeyhint', 'search');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');

  form.querySelectorAll('.as-search-live').forEach(element => element.remove());
  const box = document.createElement('div');
  box.className = 'as-search-live';
  box.setAttribute('role', 'listbox');
  form.appendChild(box);

  const catalogHref = queryText => {
    const query = String(queryText || '').trim();
    return query ? 'catalog.html?search=' + encodeURIComponent(query) : 'catalog.html';
  };
  const productHref = product => 'product.html?id=' + encodeURIComponent(product.id);
  let cachedProducts = [];
  let productsPromise = null;
  let timer = 0;
  let renderToken = 0;

  const loadProducts = async () => {
    if (cachedProducts.length) return cachedProducts;
    if (!productsPromise) {
      productsPromise = Promise.resolve(typeof options.getItems === 'function' ? options.getItems() : options.items || [])
        .then(rows => {
          cachedProducts = Array.isArray(rows) ? rows : [];
          return cachedProducts;
        })
        .catch(error => {
          console.warn('Desktop live search load error', error);
          return [];
        })
        .finally(() => { productsPromise = null; });
    }
    return productsPromise;
  };

  const close = () => {
    box.classList.remove('active');
    box.replaceChildren();
    input.setAttribute('aria-expanded', 'false');
  };

  const go = () => {
    location.href = catalogHref(input.value);
  };

  const makeResult = product => {
    const link = document.createElement('a');
    link.className = 'as-search-result';
    link.href = productHref(product);
    link.setAttribute('role', 'option');

    const thumb = document.createElement('span');
    thumb.className = 'as-search-thumb';
    const source = productImage(product);
    if (source) {
      const image = document.createElement('img');
      image.src = source;
      image.alt = '';
      image.loading = 'lazy';
      image.decoding = 'async';
      image.onerror = () => {
        image.remove();
        thumb.textContent = 'Фото';
      };
      thumb.appendChild(image);
    } else {
      thumb.textContent = 'Фото';
    }

    const info = document.createElement('span');
    info.className = 'as-search-info';
    const name = document.createElement('b');
    name.textContent = productTitle(product);
    const meta = document.createElement('small');
    meta.textContent = productGroup(product);
    info.append(name, meta);

    const cost = document.createElement('em');
    cost.textContent = money(productPrice(product));
    link.append(thumb, info, cost);
    return link;
  };

  const makeAllLink = (queryText, empty = false) => {
    const link = document.createElement('a');
    link.className = 'as-search-all';
    link.href = catalogHref(queryText);
    link.textContent = empty ? 'Открыть каталог' : 'Показать все';
    return link;
  };

  const render = async () => {
    const queryText = input.value.trim();
    if (queryText.length < 2) {
      close();
      return;
    }

    const token = ++renderToken;
    const products = await loadProducts();
    if (token !== renderToken || input.value.trim() !== queryText) return;

    const normalizedQuery = normalizeSearchText(queryText);
    const results = products
      .filter(product => productStock(product) > 0)
      .filter(product => normalizeSearchText(
        productTitle(product) + ' ' + productGroup(product) + ' '
        + (product.brand || product.brandName || product.manufacturer || '') + ' '
        + (product.code || product.article || '')
      ).includes(normalizedQuery))
      .slice(0, Number(options.maxResults || 20));

    box.replaceChildren();
    if (results.length) {
      results.forEach(product => box.appendChild(makeResult(product)));
      box.appendChild(makeAllLink(queryText));
    } else {
      box.appendChild(makeAllLink(queryText, true));
    }

    box.classList.add('active');
    box.scrollTop = 0;
    input.setAttribute('aria-expanded', 'true');
  };

  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(render, 100);
  });
  input.addEventListener('focus', render);
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      go();
    } else if (event.key === 'Escape') {
      close();
    }
  });
  button?.addEventListener('click', go);
  form.addEventListener('submit', event => {
    event.preventDefault();
    go();
  });
  document.addEventListener('click', event => {
    if (!form.contains(event.target)) close();
  });
  window.addEventListener('scroll', close, { passive: true });
  box.addEventListener('wheel', event => event.stopPropagation(), { passive: true });
}
