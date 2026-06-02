
(function(){
  var hidden = false;
  function build(){
    if (document.getElementById('asPageLoader')) return;
    document.body.classList.add('as-loading');
    var el = document.createElement('div');
    el.id = 'asPageLoader';
    el.className = 'as-page-loader';
    el.innerHTML = '<div class="as-loader-card"><div class="as-loader-logo">AS</div><div class="as-loader-text">Загружаем товары</div><div class="as-loader-dots"><i></i><i></i><i></i></div></div>';
    document.body.appendChild(el);
  }
  function hide(){
    if (hidden) return;
    hidden = true;
    var el = document.getElementById('asPageLoader');
    document.body && document.body.classList.remove('as-loading');
    if (!el) return;
    el.classList.add('hidden');
    setTimeout(function(){ el.remove(); }, 260);
  }
  window.AutoStyleLoader = { hide: hide };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
  setTimeout(hide, 9000);
})();
