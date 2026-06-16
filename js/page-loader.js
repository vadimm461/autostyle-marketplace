(function(){
  function hide(){
    document.body && document.body.classList.remove('as-loading');
    var el = document.getElementById('asPageLoader');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }
  window.AutoStyleLoader = { hide: hide, show: function(){ hide(); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hide);
  else hide();
})();
