import { db, COLLECTIONS } from './firebase.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const DEFAULT = {
  companyTitle: 'Компания',
  companyLinks: [
    { text: 'Контакты', url: 'contacts.html' },
    { text: 'Про нас', url: 'about.html' },
    { text: 'Адреса', url: 'contacts.html#addresses' }
  ],
  buyerTitle: 'Покупателям',
  buyerLinks: [
    { text: 'Рассрочка', url: 'installment.html' },
    { text: 'Подарочные сертификаты', url: 'certificates.html' },
    { text: 'Скидочная карта', url: 'profile.html#discount-card' }
  ],
  infoTitle: 'Информация',
  infoLinks: [
    { text: 'Профиль', url: 'profile.html' },
    { text: 'Избранное', url: 'favorites.html' },
    { text: 'Корзина', url: 'cart.html' }
  ],
  instagram: 'https://www.instagram.com/d.vadim.v/'
};

function parseLinks(v, fallback) {
  if (Array.isArray(v)) return v.filter(x => x && x.text && x.url);
  if (typeof v === 'string') {
    return v.split('\n').map(row => {
      const [text, url] = row.split('|').map(x => (x || '').trim());
      return { text, url };
    }).filter(x => x.text && x.url);
  }
  return fallback;
}

async function loadFooter() {
  try {
    const snap = await getDoc(doc(db, COLLECTIONS.settings || 'autostyle_settings', 'footerLinks'));
    const data = snap.exists() ? snap.data() : {};
    return {
      ...DEFAULT,
      ...data,
      companyLinks: parseLinks(data.companyLinks, DEFAULT.companyLinks),
      buyerLinks: parseLinks(data.buyerLinks, DEFAULT.buyerLinks),
      infoLinks: parseLinks(data.infoLinks, DEFAULT.infoLinks)
    };
  } catch (e) {
    console.warn('footer settings not loaded', e);
    return DEFAULT;
  }
}

function esc(v) {
  return String(v || '').replace(/[&<>\"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' }[ch]));
}
function links(list) { return (list || []).map(x => `<a href="${esc(x.url)}">${esc(x.text)}</a>`).join(''); }

function applyFooter(f) {
  document.querySelectorAll('footer.footer').forEach(el => {
    el.innerHTML = `<div class="footer-inner footer-inner-compact">
      <div class="footer-group"><h3>${esc(f.companyTitle || 'Компания')}</h3>${links(f.companyLinks)}</div>
      <div class="footer-group"><h3>${esc(f.buyerTitle || 'Покупателям')}</h3>${links(f.buyerLinks)}</div>
      <div class="footer-group"><h3>${esc(f.infoTitle || 'Информация')}</h3>${links(f.infoLinks)}</div>
    </div><div class="footer-copy"><span>© 2026 Все права защищены</span><span>Design by <a href="${esc(f.instagram || DEFAULT.instagram)}" target="_blank" rel="noopener">d.vadim.v</a></span></div>`;
  });
}

loadFooter().then(applyFooter);
