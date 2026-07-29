(function(){
  'use strict';

  document.querySelectorAll('.as-liquid-drop').forEach(function(node){ node.remove(); });
  sessionStorage.removeItem('as_bottom_nav_index');

  var oldStyle = document.getElementById('as-liquid-nav-style');
  if (oldStyle) oldStyle.remove();

  var style = document.createElement('style');
  style.id = 'as-liquid-nav-style';
  style.textContent = `
    .m-bottom-nav{
      left:14px!important;
      right:14px!important;
      bottom:max(10px,env(safe-area-inset-bottom))!important;
      width:auto!important;
      padding:7px!important;
      border-radius:28px!important;
      background:linear-gradient(180deg,rgba(13,18,26,.82),rgba(5,8,14,.76))!important;
      border:1px solid rgba(255,255,255,.13)!important;
      box-shadow:0 18px 48px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.12)!important;
      -webkit-backdrop-filter:blur(24px) saturate(170%)!important;
      backdrop-filter:blur(24px) saturate(170%)!important;
      overflow:hidden!important;
    }
    .m-bottom-nav:before{
      content:""!important;
      position:absolute!important;
      inset:0!important;
      background:linear-gradient(135deg,rgba(255,255,255,.08),transparent 46%,rgba(40,225,26,.035))!important;
      pointer-events:none!important;
    }
    .m-bottom-inner{position:relative!important;z-index:1!important;max-width:520px!important}
    .m-bottom-inner>a{
      position:relative;
      z-index:1;
      background:transparent!important;
      box-shadow:none!important;
      color:rgba(255,255,255,.68)!important;
      transition:color .24s ease,transform .24s cubic-bezier(.22,1,.36,1),background .24s ease!important;
    }
    .m-bottom-inner>a span,.m-bottom-inner>a b{color:inherit!important}
    .m-bottom-inner>a.active{
      color:#69f25d!important;
      transform:translateY(-1px) scale(1.045);
      background:radial-gradient(circle at 50% 48%,rgba(40,225,26,.15),transparent 68%)!important;
    }
    .m-bottom-inner>a:active{transform:scale(.96)}
    @media(max-width:380px){
      .m-bottom-nav{left:8px!important;right:8px!important}
      .m-bottom-inner>a{font-size:10px!important}
    }
    @media(prefers-reduced-motion:reduce){.m-bottom-inner>a{transition:none!important}}
  `;
  document.head.appendChild(style);
})();