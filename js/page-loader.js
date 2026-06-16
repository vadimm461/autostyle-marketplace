(function(){
  function noop(){}
  window.AutoStyleLoader = { hide: noop, show: noop };
  document.documentElement.classList.remove('as-loading');
  document.addEventListener('DOMContentLoaded', function(){
    document.body && document.body.classList.remove('as-loading');
    var el = document.getElementById('asPageLoader');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  });
})();
