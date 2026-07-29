import { db } from './firebase.js';
import { collection, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// Те же коллекции, которые использует десктопная главная.
const COLLECTION_NAMES = [
  'autostyle_horizontal_promo_cards',
  'autostyle_home_promo_cards',
  'homePromoCards'
];

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;'
}[char]));

function mobileUrl(value){
  const url = String(value || '').trim();
  if (!url || url === '#') return 'mobile-catalog.html';
  if (/^(https?:\/\/|tel:|mailto:|#)/i.test(url)) return url;
  return url
    .replace(/^index\.html(.*)$/i, 'mobile.html$1')
    .replace(/^catalog\.html(.*)$/i, 'mobile-catalog.html$1')
    .replace(/^product\.html(.*)$/i, 'mobile-product.html$1')
    .replace(/^profile\.html(.*)$/i, 'mobile-profile.html$1');
}

function buildLink(card = {}){
  const type = String(card.linkType || card.targetType || 'url').toLowerCase();
  const value = card.linkValue || card.targetValue || card.link || card.url || '';
  if ((type === 'category' || type === 'subcategory') && value) {
    return `mobile-catalog.html?category=${encodeURIComponent(value)}`;
  }
  if (type === 'brand' && value) {
    return `mobile-catalog.html?brand=${encodeURIComponent(value)}`;
  }
  return mobileUrl(value);
}

function normalizeCard(card = {}){
  return {
    ...card,
    title: card.title || card.name || 'Промо',
    text: card.text || card.description || '',
    image: card.image || card.imageUrl || card.photoUrl || '',
    link: buildLink(card),
    order: Number(card.order ?? 999),
    enabled: card.enabled !== false
  };
}

function cardMarkup(rawCard){
  const card = normalizeCard(rawCard);
  const title = escapeHtml(card.title);
  const image = String(card.image || '').trim();
  const imageOnly = card.displayMode === 'image' || card.imageOnly === true;

  if (imageOnly && image) {
    const safeImage = image.replaceAll("'", '%27');
    return `<a class="m-promo-card m-promo-image-only" href="${card.link}" style="background-image:url('${safeImage}')" aria-label="${title}"></a>`;
  }

  return `<a class="m-promo-card" href="${card.link}">
    ${image ? `<img loading="lazy" decoding="async" src="${escapeHtml(image)}" alt="${title}">` : ''}
    <span><b>${title}</b>${card.text ? `<small>${escapeHtml(card.text)}</small>` : ''}</span>
  </a>`;
}

async function loadPromos(){
  const all = [];

  for (const collectionName of COLLECTION_NAMES) {
    try {
      const snapshot = await getDocs(collection(db, collectionName));
      snapshot.forEach(documentSnapshot => {
        all.push({ id:documentSnapshot.id, ...documentSnapshot.data() });
      });
    } catch (error) {
      console.warn('Не удалось загрузить горизонтальные промо', collectionName, error);
    }
  }

  const seen = new Set();
  return all
    .map(normalizeCard)
    .filter(card => card.enabled !== false)
    .filter(card => {
      const key = String(card.id || card.key || card.slug || `${card.title}:${card.image}`);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.order - b.order);
}

function startAutoplay(row){
  const cards = [...row.querySelectorAll('.m-promo-card')];
  if (cards.length < 2) return;

  let index = 0;
  let pausedUntil = 0;

  const updateIndex = () => {
    let nearest = 0;
    let distance = Infinity;
    cards.forEach((card, cardIndex) => {
      const currentDistance = Math.abs(card.offsetLeft - row.scrollLeft);
      if (currentDistance < distance) {
        distance = currentDistance;
        nearest = cardIndex;
      }
    });
    index = nearest;
  };

  const pause = () => { pausedUntil = Date.now() + 9000; };
  row.addEventListener('touchstart', pause, { passive:true });
  row.addEventListener('pointerdown', pause, { passive:true });
  row.addEventListener('scroll', updateIndex, { passive:true });

  window.setInterval(() => {
    if (document.hidden || Date.now() < pausedUntil) return;
    index = (index + 1) % cards.length;
    row.scrollTo({ left:cards[index].offsetLeft, behavior:'smooth' });
  }, 5200);
}

async function renderPromo(){
  const mount = document.getElementById('mStablePromoMount');
  if (!mount) return;

  const promos = await loadPromos();
  const markup = promos.map(cardMarkup).filter(Boolean).join('');

  if (!markup) {
    mount.hidden = true;
    mount.replaceChildren();
    return;
  }

  mount.hidden = false;
  mount.innerHTML = `<section class="m-section m-horizontal-promos"><div class="m-section-head"><h2>Акции и подборки</h2></div><div class="m-promo-row">${markup}</div></section>`;
  startAutoplay(mount.querySelector('.m-promo-row'));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderPromo, { once:true });
} else {
  renderPromo();
}
