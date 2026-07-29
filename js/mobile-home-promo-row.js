import { COLLECTIONS } from './firebase.js';
import { getCollectionCached } from './data-cache.js';

const COLLECTION_NAMES = [...new Set([
  'autostyle_horizontal_promo_cards',
  'autostyle_home_promo_cards',
  'homePromoCards',
  COLLECTIONS.promoCards || 'autostyle_promo_cards',
  'autostyle_promo_cards',
  'autostyle_promoCards',
  'promoCards',
  'autostyle_section_promo_cards',
  'autostyle_between_promo_cards',
  'sectionPromoCards',
  'autostyle_home_cards',
  'homeCards'
].filter(Boolean))];

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

function imageOf(card = {}){
  return String(
    card.image || card.imageUrl || card.imageURL || card.photo ||
    card.photoUrl || card.photoURL || card.backgroundImage || card.bgImage || ''
  ).trim();
}

function isVertical(card = {}){
  const value = [
    card.orientation, card.direction, card.format, card.layout, card.type,
    card.cardType, card.viewType, card.bannerType, card.mode, card.displayMode
  ].map(item => String(item || '').toLowerCase()).join(' ');

  return /(^|[\s_-])(vertical|portrait|story|stories|reel|reels|sidebar)([\s_-]|$)/i.test(value)
    || card.vertical === true
    || card.isVertical === true
    || card.mobileVertical === true;
}

function linkOf(card = {}){
  const type = String(card.linkType || '').toLowerCase();
  const target = card.linkValue || card.value || card.target || '';
  if ((type === 'category' || type === 'subcategory') && target) {
    return `mobile-catalog.html?category=${encodeURIComponent(target)}`;
  }
  if (type === 'brand' && target) {
    return `mobile-catalog.html?brand=${encodeURIComponent(target)}`;
  }
  return mobileUrl(card.link || card.linkURL || card.url || target);
}

function cardMarkup(card){
  const image = imageOf(card);
  if (!image) return '';

  const title = escapeHtml(card.title || card.name || 'AutoStyle');
  const text = escapeHtml(card.text || card.description || '');
  const imageOnly = card.imageOnly === true
    || card.mode === 'image'
    || card.viewMode === 'image'
    || card.displayMode === 'image'
    || card.cardMode === 'imageOnly'
    || (!card.text && !card.description);

  if (imageOnly) {
    const safeImage = image.replaceAll("'", '%27');
    return `<a class="m-promo-card m-promo-image-only" href="${linkOf(card)}" style="background-image:url('${safeImage}')" aria-label="${title}"></a>`;
  }

  return `<a class="m-promo-card" href="${linkOf(card)}"><img loading="lazy" decoding="async" src="${escapeHtml(image)}" alt="${title}"><span><b>${title}</b>${text ? `<small>${text}</small>` : ''}</span></a>`;
}

async function loadPromos(){
  const groups = await Promise.all(COLLECTION_NAMES.map(async collectionName => {
    try {
      const rows = await getCollectionCached(collectionName, { force:true, staleWhileRevalidate:false });
      return (rows || []).map(row => ({ ...row, _collection:collectionName }));
    } catch (error) {
      console.warn('Не удалось загрузить промо', collectionName, error);
      return [];
    }
  }));

  const seen = new Set();
  return groups.flat()
    .filter(card => card && card.enabled !== false && card.active !== false && card.visible !== false)
    .filter(card => !isVertical(card) && imageOf(card))
    .filter(card => {
      const key = String(card.id || card.key || card.slug || imageOf(card));
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => Number(a.order ?? 999) - Number(b.order ?? 999));
}

function startAutoplay(row){
  const cards = [...row.querySelectorAll('.m-promo-card')];
  if (cards.length < 2) return;

  let activeIndex = 0;
  let pausedUntil = 0;

  const goTo = index => {
    activeIndex = index;
    row.scrollTo({ left:cards[index].offsetLeft, behavior:'smooth' });
  };

  const pause = () => { pausedUntil = Date.now() + 9000; };
  row.addEventListener('touchstart', pause, { passive:true });
  row.addEventListener('pointerdown', pause, { passive:true });
  row.addEventListener('scroll', () => {
    let nearest = 0;
    let distance = Infinity;
    cards.forEach((card, index) => {
      const currentDistance = Math.abs(card.offsetLeft - row.scrollLeft);
      if (currentDistance < distance) {
        distance = currentDistance;
        nearest = index;
      }
    });
    activeIndex = nearest;
  }, { passive:true });

  window.setInterval(() => {
    if (document.hidden || Date.now() < pausedUntil) return;
    goTo((activeIndex + 1) % cards.length);
  }, 5200);
}

async function renderStablePromo(){
  const mount = document.getElementById('mStablePromoMount');
  if (!mount || mount.dataset.rendered === '1') return;

  const promos = await loadPromos();
  if (!promos.length) {
    mount.hidden = true;
    return;
  }

  mount.hidden = false;
  mount.dataset.rendered = '1';
  mount.innerHTML = `<section class="m-section m-horizontal-promos"><div class="m-section-head"><h2>Акции и подборки</h2></div><div class="m-promo-row">${promos.map(cardMarkup).join('')}</div></section>`;
  startAutoplay(mount.querySelector('.m-promo-row'));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderStablePromo, { once:true });
} else {
  renderStablePromo();
}
