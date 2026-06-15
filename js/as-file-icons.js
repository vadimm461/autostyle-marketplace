(function(){
  const MAP = {
    '☰':'menu','≡':'menu','👤':'user','🔔':'bell','♡':'heart','♥':'heart-filled','❤':'heart-filled','🛒':'cart','🔎':'search','🔍':'search','⌂':'home','×':'close','✕':'close','📦':'package','🗂️':'grid','🗂':'grid','🖼️':'image','🖼':'image','🏠':'home','🎁':'gift','💳':'card','📁':'grid','📄':'file','⚙️':'settings','⚙':'settings','🌐':'globe'
  };
  const re = new RegExp(Object.keys(MAP).map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'g');
  function icon(name){ const s=document.createElement('span'); s.className='as-file-icon as-icon-'+name; s.setAttribute('aria-hidden','true'); return s; }
  function replaceTextNode(node){
    if(!node.nodeValue || !re.test(node.nodeValue)) return;
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
    if(root.closest && root.closest('script,style,textarea,input,select,option')) return;
    if(root.classList && root.classList.contains('as-file-icon')) return;
    const tw=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode(n){
      if(!n.nodeValue || !re.test(n.nodeValue)) return NodeFilter.FILTER_REJECT;
      re.lastIndex=0;
      const p=n.parentElement;
      if(!p || p.closest('script,style,textarea,input,select,option')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }});
    const nodes=[]; while(tw.nextNode()) nodes.push(tw.currentNode); nodes.forEach(replaceTextNode);
  }
  function normalizeKnownSpans(){
    document.querySelectorAll('.as-head-icon,.app-ico,.admin-home-card-icon').forEach(el=>{
      const txt=(el.textContent||'').trim(); if(MAP[txt]){ el.textContent=''; el.classList.add('as-file-icon','as-icon-'+MAP[txt]); }
    });
  }
  function run(){ normalizeKnownSpans(); walk(document.body); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',run); else run();
  new MutationObserver(ms=>{ for(const m of ms){ m.addedNodes.forEach(n=>{ if(n.nodeType===1) {normalizeKnownSpans(); walk(n);} else if(n.nodeType===3) replaceTextNode(n); }); } }).observe(document.documentElement,{childList:true,subtree:true});
})();
