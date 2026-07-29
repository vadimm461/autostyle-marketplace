(function(){
  const MAP = {
    '☰':'menu','≡':'menu','👤':'user','🔔':'bell','♡':'heart','♥':'heart-filled','❤':'heart-filled','🛒':'cart','🔎':'search','🔍':'search','⌂':'home','×':'close','✕':'close','📦':'package','🗂️':'grid','🗂':'grid','🖼️':'image','🖼':'image','🏠':'home','🎁':'gift','💳':'card','📁':'grid','📄':'file','⚙️':'settings','⚙':'settings','🌐':'globe'
  };
  const NAV = [
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

  function normalizeBottomNav(){
    const nav=document.querySelector('.m-bottom-inner');
    if(!nav) return;
    nav.querySelectorAll(':scope > a').forEach((a,index)=>{
      const item=NAV[index];
      if(!item) return;
      const fav=index===2 ? (a.querySelector('#mFavCount')?.textContent || '0') : '';
      const cart=index===3 ? (a.querySelector('#mCartCount')?.textContent || '0') : '';
      const counter=index===2 ? `<b id="mFavCount">${fav}</b>` : index===3 ? `<b id="mCartCount">${cart}</b>` : '';
      a.innerHTML=`<span class="as-nav-icon as-file-icon as-icon-${item[0]}" aria-hidden="true"></span><span>${item[1]}${counter}</span>`;
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