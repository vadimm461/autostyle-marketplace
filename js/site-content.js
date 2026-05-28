
import { db, COLLECTIONS } from './firebase.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const DEFAULT_CONTENT = {
  logoText: 'AUTO STYLE',
  catalogButton: '☰ Каталог',
  searchPlaceholder: 'Я ищу автотовары...',
  searchButton: 'Найти',
  accountButton: '♙ Аккаунт',
  favoritesButton: '♡ Избранное',
  cartButton: '🛒 Корзина',
  heroTitle: 'Автотовары\nдля вашего авто',
  heroText: 'Качественные товары\nпо лучшим ценам',
  heroButton: 'Перейти в каталог',
  heroImage: 'assets/storefront.jpeg',
  benefit1Title: 'Быстрая доставка',
  benefit1Text: 'По всей России',
  benefit2Title: 'Качество 100%',
  benefit2Text: 'Гарантия на все товары',
  benefit3Title: 'Поддержка 24/7',
  benefit3Text: 'Поможем с выбором',
  benefit4Title: 'Скидки и акции',
  benefit4Text: 'Выгодные предложения',
  popularTitle: 'Популярные товары',
  newTitle: 'Новинки',
  recentTitle: 'Недавно просмотренные',
  leadersTitle: 'Лидеры продаж',
  seeAll: 'Смотреть все',
  catalogTitle: 'Каталог товаров',
  filtersTitle: 'Фильтры',
  filterSearch: 'Название, категория...',
  categoryLabel: 'Категория',
  sortLabel: 'Сортировка',
  priceLabel: 'Цена, ₽',
  showButton: 'Показать',
  zeroHidden: 'Товары с нулевым остатком скрыты',
  footerBrand: 'AUTOSTYLE',
  footerCopyright: '© 2025 AutoStyle. Все права защищены.',
  footerBuyers: 'Покупателям',
  footerCompany: 'Компания',
  footerSocial: 'Мы в соцсетях'
};

function nl2br(value){ return String(value || '').replace(/\n/g, '<br>'); }

function setTextOrHtml(el, value){
  if (!el || value === undefined || value === null) return;
  if (String(value).includes('\n')) el.innerHTML = nl2br(value);
  else el.textContent = value;
}

async function loadContent(){
  try{
    const snap = await getDoc(doc(db, COLLECTIONS.settings, 'siteContent'));
    return { ...DEFAULT_CONTENT, ...(snap.exists() ? snap.data() : {}) };
  }catch(e){
    console.warn('Site content not loaded', e);
    return DEFAULT_CONTENT;
  }
}

function applyContent(content){
  document.querySelectorAll('[data-edit-key]').forEach(el => {
    const key = el.dataset.editKey;
    setTextOrHtml(el, content[key]);
  });

  document.querySelectorAll('[data-edit-placeholder]').forEach(el => {
    const key = el.dataset.editPlaceholder;
    if (content[key] !== undefined) el.setAttribute('placeholder', content[key]);
  });

  document.querySelectorAll('[data-edit-bg]').forEach(el => {
    const key = el.dataset.editBg;
    if (content[key]) el.style.backgroundImage = `linear-gradient(90deg, rgba(0,0,0,.78), rgba(0,0,0,.2)), url('${content[key]}')`;
  });
}

loadContent().then(applyContent);
