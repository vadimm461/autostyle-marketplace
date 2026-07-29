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

async function loadPromos(){
  const groups=await Promise.all(COLLECTION_NAMES.map(async name=>{
    try{
      const rows=await getCollectionCached(name,{force:true});
      return (rows||[]).map(row=>({...row,_collection:name}));
    }catch(error){
      console.warn('Не удалось загрузить мобильные промо',name,error);
      return [];
    }
  }));
  const seen=new Set();
  return groups.flat()
    .filter(card=>card&&card.enabled!==false&&card.active!==false&&card.visible!==false&&!isVertical(card)&&imageOf(card))
    .filter(card=>{
      const key=String(card.id||card.key||card.slug||imageOf(card));
      if(seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a,b)=>Number(a.order??999)-Number(b.order??999));
}

function startAutoplay(row){
  if(!row||row.dataset.promoAutoplay==='1') return;
  row.dataset.promoAutoplay='1';
  let timer=0;
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
  const schedule=()=>{
    clearInterval(timer);
    timer=setInterval(()=>{
      const list=cards();
      if(list.length<2||document.hidden||Date.now()<pausedUntil) return;
      const next=(currentIndex()+1)%list.length;
      row.scrollTo({left:list[next].offsetLeft,behavior:'smooth'});
    },5200);
  };
  const pause=()=>{pausedUntil=Date.now()+9000};
  row.addEventListener('touchstart',pause,{passive:true});
  row.addEventListener('pointerdown',pause,{passive:true});
  row.addEventListener('wheel',pause,{passive:true});
  document.addEventListener('visibilitychange',schedule,{passive:true});
  schedule();
}

async function render(){
  if(document.body?.dataset.page!=='home') return;
  let mount=document.getElementById('mHomePromoMount');
  if(!mount){
    const dynamic=document.getElementById('mHomeDynamic');
    if(!dynamic) return;
    mount=document.createElement('div');
    mount.id='mHomePromoMount';
    dynamic.prepend(mount);
  }
  const promos=await loadPromos();
  if(!promos.length){
    mount.innerHTML='';
    console.warn('Мобильные промо не найдены в доступных коллекциях');
    return;
  }
  mount.innerHTML=`<section class="m-section m-horizontal-promos"><div class="m-section-head"><h2>Акции и подборки</h2></div><div class="m-promo-row">${promos.map(cardHtml).join('')}</div></section>`;
  startAutoplay(mount.querySelector('.m-promo-row'));
}

const boot=()=>{
  render();
  const observer=new MutationObserver(()=>{
    const mount=document.getElementById('mHomePromoMount');
    if(mount&&!mount.querySelector('.m-promo-card')) render();
  });
  const dynamic=document.getElementById('mHomeDynamic');
  if(dynamic) observer.observe(dynamic,{childList:true,subtree:true});
  window.addEventListener('pageshow',()=>render(),{passive:true});
};

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
else boot();