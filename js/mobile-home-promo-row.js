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

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
}[ch]));

let lastGoodMarkup = '';
let renderBusy = false;
let restoreBusy = false;
let autoplayTimer = 0;

function appUrl(url){
  const raw=String(url||'').trim();
  if(!raw||raw==='#') return 'mobile-catalog.html';
  if(/^(tel:|mailto:|https?:\/\/|#)/i.test(raw)) return raw;
  return raw
    .replace(/^index\.html(.*)$/i,'mobile.html$1')
    .replace(/^catalog\.html(.*)$/i,'mobile-catalog.html$1')
    .replace(/^product\.html(.*)$/i,'mobile-product.html$1')
    .replace(/^profile\.html(.*)$/i,'mobile-profile.html$1');
}

function imageOf(card){
  return String(card.image||card.imageUrl||card.imageURL||card.photo||card.photoUrl||card.photoURL||card.backgroundImage||card.bgImage||'').trim();
}

function isVertical(card){
  const raw=[card.orientation,card.direction,card.format,card.layout,card.type,card.cardType,card.viewType,card.bannerType,card.mode,card.displayMode]
    .map(v=>String(v||'').toLowerCase()).join(' ');
  return /(^|[\s_-])(vertical|portrait|story|stories|reel|reels|sidebar)([\s_-]|$)/i.test(raw)
    || card.vertical===true || card.isVertical===true || card.mobileVertical===true;
}

function linkOf(card){
  const type=String(card.linkType||card.type||'').toLowerCase();
  const value=card.linkValue||card.value||card.target||'';
  if((type==='category'||type==='subcategory')&&value) return `mobile-catalog.html?category=${encodeURIComponent(value)}`;
  if(type==='brand'&&value) return `mobile-catalog.html?brand=${encodeURIComponent(value)}`;
  return appUrl(card.link||card.linkURL||card.url||value||'mobile-catalog.html');
}

function cardHtml(card){
  const image=imageOf(card);
  if(!image) return '';
  const title=esc(card.title||card.name||'AutoStyle');
  const text=esc(card.text||card.description||'');
  const imageOnly=card.imageOnly===true||card.mode==='image'||card.viewMode==='image'||card.displayMode==='image'||card.cardMode==='imageOnly'||(!card.text&&!card.description);
  if(imageOnly){
    const safeImage=String(image).replaceAll("'",'%27');
    return `<a class="m-promo-card m-promo-image-only" href="${linkOf(card)}" style="background-image:url('${safeImage}')" aria-label="${title}"></a>`;
  }
  return `<a class="m-promo-card" href="${linkOf(card)}"><img loading="lazy" decoding="async" src="${esc(image)}" alt="${title}"><span><b>${title}</b>${text?`<small>${text}</small>`:''}</span></a>`;
}

function dedupeAndSort(rows){
  const seen=new Set();
  return (rows||[])
    .filter(card=>card&&card.enabled!==false&&card.active!==false&&card.visible!==false&&!isVertical(card)&&imageOf(card))
    .filter(card=>{
      const key=String(card.id||card.key||card.slug||imageOf(card));
      if(seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a,b)=>Number(a.order??999)-Number(b.order??999));
}

async function loadPromos(){
  const read = async options => {
    const groups=await Promise.all(COLLECTION_NAMES.map(async name=>{
      try{
        const rows=await getCollectionCached(name,options);
        return (rows||[]).map(row=>({...row,_collection:name}));
      }catch(error){
        console.warn('Не удалось загрузить мобильные промо',name,error);
        return [];
      }
    }));
    return dedupeAndSort(groups.flat());
  };

  const cached = await read({staleWhileRevalidate:true});
  if(cached.length) return cached;
  return await read({force:true,staleWhileRevalidate:false});
}

function getMount(){
  let mount=document.getElementById('mHomePromoMount');
  if(mount) return mount;
  const dynamic=document.getElementById('mHomeDynamic');
  if(!dynamic) return null;
  mount=document.createElement('div');
  mount.id='mHomePromoMount';
  dynamic.prepend(mount);
  return mount;
}

function startAutoplay(row){
  clearInterval(autoplayTimer);
  if(!row) return;
  let pausedUntil=0;
  const cards=()=>[...row.querySelectorAll('.m-promo-card')];
  const currentIndex=()=>{
    const list=cards();
    if(!list.length) return 0;
    let nearest=0;
    let distance=Infinity;
    list.forEach((card,index)=>{
      const d=Math.abs(card.offsetLeft-row.scrollLeft);
      if(d<distance){distance=d;nearest=index;}
    });
    return nearest;
  };
  autoplayTimer=setInterval(()=>{
    const list=cards();
    if(list.length<2||document.hidden||Date.now()<pausedUntil) return;
    const next=(currentIndex()+1)%list.length;
    row.scrollTo({left:list[next].offsetLeft,behavior:'smooth'});
  },5200);
  const pause=()=>{pausedUntil=Date.now()+9000};
  row.addEventListener('touchstart',pause,{passive:true});
  row.addEventListener('pointerdown',pause,{passive:true});
  row.addEventListener('wheel',pause,{passive:true});
}

function applyMarkup(mount, markup){
  if(!mount||!markup||mount.innerHTML===markup) return;
  restoreBusy=true;
  mount.innerHTML=markup;
  lastGoodMarkup=markup;
  startAutoplay(mount.querySelector('.m-promo-row'));
  requestAnimationFrame(()=>{restoreBusy=false;});
}

async function render(){
  if(document.body?.dataset.page!=='home'||renderBusy) return;
  renderBusy=true;
  try{
    const mount=getMount();
    if(!mount) return;

    if(mount.querySelector('.m-promo-card')&&mount.innerHTML.trim()){
      lastGoodMarkup=mount.innerHTML;
    }

    const promos=await loadPromos();
    if(promos.length){
      const markup=`<section class="m-section m-horizontal-promos"><div class="m-section-head"><h2>Акции и подборки</h2></div><div class="m-promo-row">${promos.map(cardHtml).join('')}</div></section>`;
      applyMarkup(mount,markup);
    }else if(lastGoodMarkup){
      applyMarkup(mount,lastGoodMarkup);
    }
  }finally{
    renderBusy=false;
  }
}

function protectPromoMount(){
  const observer=new MutationObserver(()=>{
    if(restoreBusy||document.body?.dataset.page!=='home') return;
    const mount=getMount();
    if(!mount) return;

    if(mount.querySelector('.m-promo-card')&&mount.innerHTML.trim()){
      lastGoodMarkup=mount.innerHTML;
      startAutoplay(mount.querySelector('.m-promo-row'));
      return;
    }

    if(lastGoodMarkup){
      applyMarkup(mount,lastGoodMarkup);
    }else{
      render();
    }
  });
  observer.observe(document.body,{childList:true,subtree:true});
}

const boot=()=>{
  protectPromoMount();
  render();
  setTimeout(render,350);
  setTimeout(render,1200);
  setTimeout(render,2600);
  window.addEventListener('pageshow',render,{passive:true});
  window.addEventListener('focus',render,{passive:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)render();},{passive:true});
};

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
else boot();
