(function(){
  'use strict';
  function $(s,r=document){return r.querySelector(s)}
  function $$(s,r=document){return Array.from(r.querySelectorAll(s))}

  function iconImg(name){ return '<img class="as-account-link-icon" src="assets/icons/'+name+'.svg" alt="" aria-hidden="true">'; }
  function accountPopupHtml(user){
    if(!user){
      return '<a class="as-account-login-only" href="login.html">'+iconImg('user')+'<span>Войти</span></a>';
    }
    const name = (user.displayName || 'Личный кабинет').trim();
    const email = (user.email || 'Аккаунт').trim();
    const avatar = user.photoURL ? '<img src="'+user.photoURL+'" alt="">' : 'AS';
    return `
      <a class="as-account-profile-head as-account-profile-link" href="profile.html#account">
        <div class="as-account-avatar" id="asAccountAvatar">${avatar}</div>
        <div><div class="as-account-title">${name === 'Личный кабинет' ? 'Личный кабинет' : name}</div><div class="as-account-subtitle">${email}</div></div>
      </a>
      <nav class="as-account-menu">
        <a href="profile.html#account">${iconImg('user')}<span>Фото и профиль</span></a>
        <a href="profile.html#discount-card">${iconImg('card')}<span>Скидочная карта</span></a>
        <a href="cart.html">${iconImg('cart')}<span>Корзина</span></a>
        <a href="favorites.html">${iconImg('heart')}<span>Избранное</span></a>
        <a href="profile.html#orders">${iconImg('package')}<span>Заказы</span></a>
      </nav>
      <hr>
      <button type="button" id="asAccountLogout">Выйти</button>`;
  }
  function updateAccountPopupForAuth(user){
    $$('.as-account-popup').forEach(popup=>{
      popup.innerHTML = accountPopupHtml(user);
      const logout = $('#asAccountLogout', popup);
      if(logout){
        logout.addEventListener('click', async (e)=>{
          e.preventDefault();
          try{
            if(window.__asSignOut && window.__asAuth) await window.__asSignOut(window.__asAuth);
            else document.getElementById('logout')?.click();
          }catch(_){ document.getElementById('logout')?.click(); }
          localStorage.removeItem('cart'); localStorage.removeItem('favorites');
          location.href = 'index.html';
        });
      }
      const login = $('.as-account-login-only', popup);
      if(login){
        login.addEventListener('click', (e)=>{
          const modal = $('#authModal');
          if(modal){ e.preventDefault(); modal.classList.add('open'); }
        });
      }
    });
  }
  function watchRealAuth(){
    if(window.__asAuthWatchReady) return;
    window.__asAuthWatchReady = true;
    import('./firebase.js').then(fb=>{
      window.__asAuth = fb.auth;
      return import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
    }).then(mod=>{
      window.__asSignOut = mod.signOut;
      mod.onAuthStateChanged(window.__asAuth, user=> updateAccountPopupForAuth(user));
    }).catch(()=> updateAccountPopupForAuth(null));
  }

  function enhanceAccountPopup(){
    const wraps = $$('.as-account-wrap');
    wraps.forEach(wrap=>{
      const popup = $('.as-account-popup', wrap);
      const btn = $('#asAccountButton', wrap);
      if(!popup || popup.dataset.finalAccount==='1') return;
      popup.dataset.finalAccount='1';
      popup.innerHTML = accountPopupHtml(null);
      btn?.addEventListener('click', (e)=>{e.preventDefault();e.stopPropagation();wrap.classList.toggle('open')});
    });

    const openAuth = $('#openAuth');
    const oldDrop = $('#accountDrop');
    if(openAuth && oldDrop && !oldDrop.dataset.finalAccount){
      oldDrop.dataset.finalAccount='1';
      oldDrop.classList.add('as-account-wrap');
      oldDrop.style.display='block';
      const drop = $('.drop', oldDrop);
      if(drop){
        drop.className='as-account-popup';
        drop.innerHTML = accountPopupHtml(null);
      }
      oldDrop.querySelector('#accountBtn')?.remove();
      oldDrop.style.position='relative';
      openAuth.addEventListener('click', e=>{ e.preventDefault(); e.stopPropagation(); oldDrop.classList.toggle('open'); });
    }
    updateAccountPopupForAuth(null);
    watchRealAuth();
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
