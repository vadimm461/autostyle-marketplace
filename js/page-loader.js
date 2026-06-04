(function(){
  var hidden = false;
  var createdAt = Date.now();
  function build(){
    if (document.getElementById('asPageLoader') || hidden) return;
    document.body.classList.add('as-loading');
    var el = document.createElement('div');
    el.id = 'asPageLoader';
    el.className = 'as-page-loader';
    el.innerHTML = '<div class="as-loader-card"><div class="as-loader-logo">AS</div><div class="as-loader-text">Загружаем</div><div class="as-loader-dots"><i></i><i></i><i></i></div></div>';
    document.body.appendChild(el);
  }
  function hide(){
    if (hidden) return;
    hidden = true;
    document.body && document.body.classList.remove('as-loading');
    var el = document.getElementById('asPageLoader');
    if (!el) return;
    el.classList.add('hidden');
    el.style.pointerEvents = 'none';
    setTimeout(function(){ if (el && el.parentNode) el.parentNode.removeChild(el); }, 180);
  }
  window.AutoStyleLoader = { hide: hide, show: build };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ build(); setTimeout(hide, 650); });
  } else {
    build(); setTimeout(hide, 650);
  }
  window.addEventListener('load', function(){ setTimeout(hide, 180); });
  document.addEventListener('visibilitychange', function(){ if (!document.hidden) setTimeout(hide, 300); });
  setTimeout(hide, 1500);
})();
