(function(){
  'use strict';
  function $(s,r=document){return r.querySelector(s)}
  function $$(s,r=document){return Array.from(r.querySelectorAll(s))}

  function enhanceAccountPopup(){
    // Normalize old account HTML into one rich dropdown. Keeps existing ids/buttons for old scripts.
    const wraps = $$('.as-account-wrap');
    wraps.forEach(wrap=>{
      const popup = $('.as-account-popup', wrap);
      const btn = $('#asAccountButton', wrap);
      if(!popup || popup.dataset.finalAccount==='1') return;
      popup.dataset.finalAccount='1';
      const emailEl = $('#asAccountEmail', popup);
      const email = (emailEl?.textContent || localStorage.getItem('autostyle_user_email') || 'Аккаунт').trim();
      const logout = $('#asAccountLogout', popup);
      popup.innerHTML = `
        <a class="as-account-profile-head" href="profile.html#account">
          <div class="as-account-avatar" id="asAccountAvatar">AS</div>
          <div><div class="as-account-title">Личный кабинет</div><div class="as-account-subtitle" id="asAccountEmail">${email}</div></div>
        </a>
        <nav class="as-account-menu">
          <a href="profile.html#account"><img class="as-menu-svg" src="assets/icons/user.svg" alt="" loading="lazy" decoding="async"> Фото и профиль</a>
          <a href="profile.html#discount-card"><img class="as-menu-svg" src="assets/icons/card.svg" alt="" loading="lazy" decoding="async"> Скидочная карта</a>
          <a href="cart.html"><img class="as-menu-svg" src="assets/icons/cart.svg" alt="" loading="lazy" decoding="async"> Корзина</a>
          <a href="favorites.html"><img class="as-menu-svg" src="assets/icons/heart.svg" alt="" loading="lazy" decoding="async"> Избранное</a>
          <a href="profile.html#orders"><img class="as-menu-svg" src="assets/icons/package.svg" alt="" loading="lazy" decoding="async"> Заказы</a>
        </nav>
        <hr>
        <button type="button" id="asAccountLogout">Выйти</button>`;
      $('#asAccountLogout', popup)?.addEventListener('click', ()=> logout?.click());
      btn?.addEventListener('click', (e)=>{e.preventDefault();e.stopPropagation();wrap.classList.toggle('open')});
    });

    // Index/catalog old structure: visible #openAuth + hidden #accountDrop. Make it a nice dropdown instead of modal only when authorized menu exists.
    const openAuth = $('#openAuth');
    const oldDrop = $('#accountDrop');
    if(openAuth && oldDrop && !oldDrop.dataset.finalAccount){
      oldDrop.dataset.finalAccount='1';
      oldDrop.classList.add('as-account-wrap');
      oldDrop.style.display='block';
      const drop = $('.drop', oldDrop);
      if(drop){
        const email = ($('#userEmail', drop)?.textContent || 'Аккаунт').trim();
        const logout = $('#logout', drop);
        drop.className='as-account-popup';
        drop.innerHTML = `
          <a class="as-account-profile-head" href="profile.html#account">
            <div class="as-account-avatar">AS</div>
            <div><div class="as-account-title">Личный кабинет</div><div class="as-account-subtitle" id="userEmail">${email}</div></div>
          </a>
          <nav class="as-account-menu">
            <a href="profile.html#account"><img class="as-menu-svg" src="assets/icons/user.svg" alt="" loading="lazy" decoding="async"> Фото и профиль</a>
            <a href="profile.html#discount-card"><img class="as-menu-svg" src="assets/icons/card.svg" alt="" loading="lazy" decoding="async"> Скидочная карта</a>
            <a href="cart.html"><img class="as-menu-svg" src="assets/icons/cart.svg" alt="" loading="lazy" decoding="async"> Корзина</a>
            <a href="favorites.html"><img class="as-menu-svg" src="assets/icons/heart.svg" alt="" loading="lazy" decoding="async"> Избранное</a>
            <a href="profile.html#orders"><img class="as-menu-svg" src="assets/icons/package.svg" alt="" loading="lazy" decoding="async"> Заказы</a>
          </nav>
          <hr><button type="button" id="logout">Выйти</button>`;
        $('#logout', drop)?.addEventListener('click', ()=> logout?.click());
      }
      oldDrop.querySelector('#accountBtn')?.remove();
      oldDrop.style.position='relative';
      openAuth.addEventListener('click', e=>{ e.preventDefault(); e.stopPropagation(); oldDrop.classList.toggle('open'); });
    }
    document.addEventListener('click', e=>{
      if(!e.target.closest('.as-account-wrap') && !e.target.closest('#openAuth')) $$('.as-account-wrap').forEach(w=>w.classList.remove('open'));
    }, {capture:true});
  }

  function fixCatalogPricePosition(){
    const top = $('.catalog-top');
    const priceFrom = $('#priceFrom');
    const priceTo = $('#priceTo');
    const zero = $('#zeroNotice');
    if(!top || !priceFrom || !priceTo || !zero || $('.catalog-top-price', top)) return;
    const box = document.createElement('div');
    box.className = 'catalog-top-price';
    box.innerHTML = '<span>Цена, ₽</span>';
    box.appendChild(priceFrom);
    box.appendChild(priceTo);
    top.insertBefore(box, zero);
  }

  function improveNotificationPosition(){
    // Patch existing exported method after module loads; also works when dropdown already exists.
    const patch = () => {
      const api = window.autostyleNotifications;
      if(api && !api.__finalPatched){
        const original = api.positionNotificationDropdown;
        api.positionNotificationDropdown = function(dd){
          try{ original && original(dd); }catch(e){}
          if(!dd) return;
          const btn = $('#notificationsBtn');
          const r = btn?.getBoundingClientRect();
          dd.style.position = 'fixed';
          dd.style.top = ((r ? r.bottom : 66) + 10) + 'px';
          dd.style.left = 'auto';
          const right = r ? Math.max(12, window.innerWidth - r.right - 6) : 180;
          dd.style.right = right + 'px';
        };
        api.__finalPatched = true;
      }
      const dd = $('#notificationsDropdown');
      if(dd && dd.classList.contains('open') && window.autostyleNotifications?.positionNotificationDropdown) window.autostyleNotifications.positionNotificationDropdown(dd);
    };
    patch(); setTimeout(patch,300); setTimeout(patch,1000);
    window.addEventListener('resize', patch);
  }

  function enhanceAdminNotify(){
    const editor = $('.admin-notify-editor');
    if(!editor || editor.dataset.finalAdmin==='1') return;
    editor.dataset.finalAdmin='1';
    const title = $('#adminNotifyTitle');
    if(title) title.placeholder = 'Например: Акция, скидочная карта, статус заказа';
    const body = $('#adminNotifyBody');
    if(body) body.dataset.placeholder = 'Напиши красивое уведомление: текст, фото, ссылку, эмодзи. Всё сохранится и появится на сайте.';
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    if(window.normalizeHeaderIcons) window.normalizeHeaderIcons();
    enhanceAccountPopup();
    fixCatalogPricePosition();
    improveNotificationPosition();
    enhanceAdminNotify();
  });
})();
