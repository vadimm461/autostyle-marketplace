(function(){
  const MAP = {
    '☰':'menu','≡':'menu','👤':'user','🔔':'bell','♡':'heart','♥':'heart-filled','❤':'heart-filled','🛒':'cart','🔎':'search','🔍':'search','⌂':'home','×':'close','✕':'close','📦':'package','🗂️':'grid','🗂':'grid','🖼️':'image','🖼':'image','🏠':'home','🎁':'gift','💳':'card','📁':'grid','📄':'file','⚙️':'settings','⚙':'settings','🌐':'globe'
  };
  const NAV_BY_ROUTE = {
    'mobile.html':['home','Главная'],
    'mobile-catalog.html':['menu','Каталог'],
    'mobile-favorites.html':['heart','Избранное'],
    'mobile-cart.html':['cart','Корзина'],
    'mobile-profile.html':['user','Профиль']
  };
  const NAV_FALLBACK = [
    ['home','Главная'],
    ['menu','Каталог'],
    ['heart','Избранное'],
    ['cart','Корзина'],
    ['user','Профиль']
  ];
  const re = new RegExp(Object.keys(MAP).map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'g');

  function icon(name){
    const s=document.createElement('span');
    s.className='as-file-icon as-icon-'+name;
    s.setAttribute('aria-hidden','true');
    return s;
  }

  function routeFromHref(href){
    try {
      return new URL(href || '', location.href).pathname.split('/').pop() || '';
    } catch (_) {
      return String(href || '').split('?')[0].split('#')[0].split('/').pop();
    }
  }

  function normalizeBottomNav(){
    const nav=document.querySelector('.m-bottom-inner');
    if(!nav) return;
    const currentRoute=location.pathname.split('/').pop() || 'mobile.html';
    nav.querySelectorAll(':scope > a').forEach((a,index)=>{
      const route=routeFromHref(a.getAttribute('href'));
      const item=NAV_BY_ROUTE[route] || NAV_FALLBACK[index];
      if(!item) return;
      const fav=route==='mobile-favorites.html' ? (a.querySelector('#mFavCount')?.textContent || '0') : '';
      const cart=route==='mobile-cart.html' ? (a.querySelector('#mCartCount')?.textContent || '0') : '';
      const counter=route==='mobile-favorites.html' ? `<b id="mFavCount">${fav}</b>` : route==='mobile-cart.html' ? `<b id="mCartCount">${cart}</b>` : '';
      a.innerHTML=`<span class="as-nav-icon as-file-icon as-icon-${item[0]}" aria-hidden="true"></span><span>${item[1]}${counter}</span>`;
      const isActive=route===currentRoute;
      a.classList.toggle('active',isActive);
      if(isActive) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current');
      if(route==='mobile-profile.html') {
        a.dataset.navItem='profile';
        a.setAttribute('aria-label','Профиль');
      }
      a.dataset.asBottomNavReady='1';
    });
  }

  function replaceTextNode(node){
    if(!node.nodeValue || !re.test(node.nodeValue)) return;
    if(node.parentElement?.closest('.m-bottom-nav')) return;
    re.lastIndex=0;
    const frag=document.createDocumentFragment(); let last=0; let m;
    while((m=re.exec(node.nodeValue))){
      if(m.index>last) frag.appendChild(document.createTextNode(node.nodeValue.slice(last,m.index)));
      frag.appendChild(icon(MAP[m[0]]));
      last=m.index+m[0].length;
    }
    if(last<node.nodeValue.length) frag.appendChild(document.createTextNode(node.nodeValue.slice(last)));
    node.parentNode && node.parentNode.replaceChild(frag,node);
  }

  function walk(root){
    if(!root || root.nodeType!==1) return;
    if(root.closest && root.closest('script,style,textarea,input,select,option,.m-bottom-nav')) return;
    if(root.classList && root.classList.contains('as-file-icon')) return;
    const tw=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode(n){
      if(!n.nodeValue || !re.test(n.nodeValue)) return NodeFilter.FILTER_REJECT;
      re.lastIndex=0;
      const p=n.parentElement;
      if(!p || p.closest('script,style,textarea,input,select,option,.m-bottom-nav')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }});
    const nodes=[]; while(tw.nextNode()) nodes.push(tw.currentNode); nodes.forEach(replaceTextNode);
  }

  function normalizeKnownSpans(){
    document.querySelectorAll('.as-head-icon,.app-ico,.admin-home-card-icon').forEach(el=>{
      const txt=(el.textContent||'').trim();
      if(MAP[txt]){ el.textContent=''; el.classList.add('as-file-icon','as-icon-'+MAP[txt]); }
    });
  }

  function run(){
    normalizeKnownSpans();
    normalizeBottomNav();
    walk(document.body);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',run); else run();
  new MutationObserver(ms=>{
    let navChanged=false;
    for(const m of ms){
      if(m.target?.closest?.('.m-bottom-inner') || Array.from(m.addedNodes).some(n=>n.nodeType===1 && (n.matches?.('.m-bottom-inner,.m-bottom-inner *') || n.querySelector?.('.m-bottom-inner')))) navChanged=true;
      m.addedNodes.forEach(n=>{
        if(n.nodeType===1) { normalizeKnownSpans(); walk(n); }
        else if(n.nodeType===3) replaceTextNode(n);
      });
    }
    if(navChanged) requestAnimationFrame(normalizeBottomNav);
  }).observe(document.documentElement,{childList:true,subtree:true});
})();