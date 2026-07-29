(function(){
  'use strict';
  if(document.getElementById('as-liquid-nav-style')) return;
  const style=document.createElement('style');
  style.id='as-liquid-nav-style';
  style.textContent=`
  .m-bottom-nav{
    left:14px!important;right:14px!important;bottom:max(10px,env(safe-area-inset-bottom))!important;
    width:auto!important;padding:7px!important;border-radius:28px!important;
    background:linear-gradient(180deg,rgba(13,18,26,.82),rgba(5,8,14,.76))!important;
    border:1px solid rgba(255,255,255,.13)!important;
    box-shadow:0 18px 48px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.12)!important;
    -webkit-backdrop-filter:blur(24px) saturate(170%)!important;
    backdrop-filter:blur(24px) saturate(170%)!important;
    overflow:hidden!important;
  }
  .m-bottom-nav:before{
    content:""!important;position:absolute!important;inset:0!important;
    background:linear-gradient(135deg,rgba(255,255,255,.09),transparent 42%,rgba(40,225,26,.045))!important;
    pointer-events:none!important;
  }
  .m-bottom-inner{position:relative!important;isolation:isolate;z-index:1!important;max-width:520px!important}
  .as-liquid-drop{position:absolute;top:3px;left:0;height:50px;border-radius:20px;background:linear-gradient(145deg,rgba(69,255,56,.55),rgba(26,190,43,.28));box-shadow:inset 0 1px 0 rgba(255,255,255,.62),inset 0 -8px 18px rgba(7,92,20,.16),0 8px 22px rgba(22,183,43,.24);border:1px solid rgba(91,255,79,.42);-webkit-backdrop-filter:blur(18px) saturate(185%);backdrop-filter:blur(18px) saturate(185%);pointer-events:none;z-index:-1;opacity:0;transition:left .46s cubic-bezier(.22,1,.36,1),width .46s cubic-bezier(.22,1,.36,1),transform .46s cubic-bezier(.22,1,.36,1),border-radius .32s ease,opacity .18s ease;will-change:left,width,transform}
  .as-liquid-drop:before,.as-liquid-drop:after{content:"";position:absolute;border-radius:50%;background:rgba(190,255,185,.24);transition:transform .38s cubic-bezier(.22,1,.36,1)}
  .as-liquid-drop:before{width:15px;height:15px;left:7px;top:6px;box-shadow:inset 3px 3px 5px rgba(255,255,255,.42)}
  .as-liquid-drop:after{width:8px;height:8px;right:9px;bottom:7px;opacity:.58}
  .as-liquid-drop.is-moving{border-radius:27px 14px 25px 15px;transform:scaleX(1.18) scaleY(.94)}
  .as-liquid-drop.is-moving:before{transform:translateX(10px) scale(1.25)}
  .as-liquid-drop.move-left{transform-origin:left center}.as-liquid-drop.move-right{transform-origin:right center}
  .m-bottom-inner>a{position:relative;z-index:1;background:transparent!important;box-shadow:none!important;color:rgba(255,255,255,.68)!important;transition:color .28s ease,transform .34s cubic-bezier(.22,1,.36,1)!important}
  .m-bottom-inner>a span,.m-bottom-inner>a b{color:inherit!important}
  .m-bottom-inner>a.active{color:#efffee!important;transform:translateY(-1px) scale(1.035)}
  .m-bottom-inner>a.as-nav-target{color:#efffee!important;transform:translateY(-2px) scale(1.05)}
  @media(max-width:380px){.m-bottom-nav{left:8px!important;right:8px!important}.m-bottom-inner>a{font-size:10px!important}}
  @media(prefers-reduced-motion:reduce){.as-liquid-drop,.m-bottom-inner>a{transition:none!important}}
  `;
  document.head.appendChild(style);

  const debounce=(fn,wait)=>{let timer=0;return()=>{clearTimeout(timer);timer=setTimeout(fn,wait)}};
  function init(){
    const nav=document.querySelector('.m-bottom-inner');
    if(!nav) return false;
    const links=Array.from(nav.querySelectorAll(':scope > a[href]'));
    if(links.length<2) return false;
    let drop=nav.querySelector('.as-liquid-drop');
    if(!drop){drop=document.createElement('i');drop.className='as-liquid-drop';drop.setAttribute('aria-hidden','true');nav.prepend(drop)}
    const active=Math.max(0,links.findIndex(a=>a.classList.contains('active')));
    const stored=Number(sessionStorage.getItem('as_bottom_nav_index'));
    const previous=Number.isFinite(stored)?Math.max(0,Math.min(links.length-1,stored)):active;
    const place=(index,animate=true)=>{
      const link=links[index];if(!link)return;
      if(!animate)drop.style.transition='none';
      drop.style.width=Math.max(48,link.offsetWidth-4)+'px';
      drop.style.left=(link.offsetLeft+2)+'px';
      drop.style.opacity='1';
      if(!animate)requestAnimationFrame(()=>drop.style.transition='');
    };
    place(previous,false);
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      if(previous!==active){
        drop.classList.add('is-moving',active>previous?'move-left':'move-right');
        place(active,true);
        setTimeout(()=>drop.classList.remove('is-moving','move-left','move-right'),470);
      }else place(active,false);
      sessionStorage.setItem('as_bottom_nav_index',String(active));
    }));
    links.forEach((link,index)=>{
      if(link.dataset.liquidReady==='1')return;
      link.dataset.liquidReady='1';
      link.addEventListener('click',event=>{
        if(event.defaultPrevented||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||event.button>0)return;
        const href=link.getAttribute('href')||'';
        if(!href||href.startsWith('#')||link.classList.contains('active'))return;
        const url=new URL(href,location.href);
        if(url.origin!==location.origin)return;
        event.preventDefault();
        link.classList.add('as-nav-target');
        const current=Math.max(0,links.findIndex(a=>a.classList.contains('active')));
        drop.classList.remove('move-left','move-right');
        drop.classList.add('is-moving',index>current?'move-left':'move-right');
        place(index,true);
        sessionStorage.setItem('as_bottom_nav_index',String(index));
        setTimeout(()=>{location.href=url.href},300);
      },true);
    });
    const resize=debounce(()=>place(Math.max(0,links.findIndex(a=>a.classList.contains('active'))),false),100);
    window.addEventListener('resize',resize,{passive:true});
    window.addEventListener('orientationchange',resize,{passive:true});
    return true;
  }
  if(init())return;
  const observer=new MutationObserver(()=>{if(init())observer.disconnect()});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(()=>observer.disconnect(),8000);
})();