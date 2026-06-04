(function(){
  try{
    if (sessionStorage.getItem('as_force_desktop') === '1') return;
    var isMobile = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
    if (!isMobile) return;
    var file = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    if (file.indexOf('mobile-') === 0) return;
    var map = {
      'index.html':'mobile.html',
      '':'mobile.html',
      'catalog.html':'mobile-catalog.html',
      'product.html':'mobile-product.html',
      'cart.html':'mobile-cart.html',
      'favorites.html':'mobile-favorites.html',
      'profile.html':'mobile-profile.html',
      'about.html':'mobile-about.html',
      'contacts.html':'mobile-contacts.html',
      'installment.html':'mobile-installment.html',
      'certificates.html':'mobile-certificates.html',
      'login.html':'mobile-profile.html',
      'register.html':'mobile-profile.html'
    };
    if (!map[file]) return;
    var qs = location.search || '';
    location.replace(map[file] + qs + location.hash);
  }catch(e){}
})();
