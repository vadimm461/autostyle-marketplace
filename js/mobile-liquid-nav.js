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
      background:rgba(238,242,247,.78)!important;
      border:1px solid rgba(255,255,255,.72)!important;
      box-shadow:0 12px 34px rgba(15,23,42,.16),inset 0 1px 0 rgba(255,255,255,.88)!important;
      -webkit-backdrop-filter:blur(24px) saturate(155%)!important;
      backdrop-filter:blur(24px) saturate(155%)!important;
      overflow:hidden!important;
    }
    .m-bottom-nav:before{
      content:""!important;
      position:absolute!important;
      inset:0!important;
      background:linear-gradient(180deg,rgba(255,255,255,.46),rgba(230,235,242,.18))!important;
      pointer-events:none!important;
    }
    .m-bottom-inner{position:relative!important;z-index:1!important;max-width:520px!important}
    .m-bottom-inner>a{
      position:relative;
      z-index:1;
      background:transparent!important;
      border:0!important;
      box-shadow:none!important;
      color:#475467!important;
      transition:color .22s ease,transform .22s cubic-bezier(.22,1,.36,1)!important;
    }
    .m-bottom-inner>a:before,
    .m-bottom-inner>a:after{
      display:none!important;
      content:none!important;
    }
    .m-bottom-inner>a span,.m-bottom-inner>a b{color:inherit!important}
    .m-bottom-inner>a.active{
      color:#16b828!important;
      transform:translateY(-1px) scale(1.035);
      background:transparent!important;
      box-shadow:none!important;
      outline:0!important;
    }
    .m-bottom-inner>a:active{transform:scale(.97)}
    @media(max-width:380px){
      .m-bottom-nav{left:8px!important;right:8px!important}
      .m-bottom-inner>a{font-size:10px!important}
    }
    @media(prefers-reduced-motion:reduce){.m-bottom-inner>a{transition:none!important}}
  `;
  document.head.appendChild(style);
})();