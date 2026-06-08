(function(){
  'use strict';


  function navIconHtml(kind, countId){
    var data = {
      account:['👤','Аккаунт'],
      notify:['🔔','Уведомления'],
      fav:['♡','Избранное'],
      cart:['🛒','Корзина']
    }[kind] || ['•',''];
    var badge = '';
    if(kind === 'notify') badge = '<b id="notificationCount" class="as-notify-count as-head-badge" data-count="0"></b>';
    if(kind === 'cart') badge = '<b id="cartCount" class="as-head-badge">0</b>';
    return '<span class="as-head-icon" aria-hidden="true">'+data[0]+'</span><span class="as-head-label">'+data[1]+'</span>'+badge;
  }
  function applyHeaderIconButton(el, kind){
    if(!el) return;
    el.classList.add('as-head-icon-btn');
    if(el.tagName === 'BUTTON' && !el.type) el.type = 'button';
    var keepCart = el.querySelector('#cartCount');
    var keepNotify = el.querySelector('#notificationCount,.as-notify-count');
    el.innerHTML = navIconHtml(kind);
    if(kind === 'cart' && keepCart){ var b=el.querySelector('#cartCount'); if(b) b.textContent = keepCart.textContent || '0'; }
    if(kind === 'notify' && keepNotify){ var n=el.querySelector('#notificationCount'); if(n){ n.textContent = keepNotify.textContent || ''; n.dataset.count = keepNotify.dataset.count || n.dataset.count || '0'; } }
  }
  function normalizeHeaderIcons(){
    document.querySelectorAll('.topbar a.icon-btn,.topbar button.icon-btn').forEach(function(el){
      var text = (el.textContent || '').trim();
      if(el.id === 'notificationsBtn' || /уведом/i.test(text)) applyHeaderIconButton(el,'notify');
      else if(/избран/i.test(text) || el.getAttribute('href') === 'favorites.html') applyHeaderIconButton(el,'fav');
      else if(/корзин/i.test(text) || el.getAttribute('href') === 'cart.html') applyHeaderIconButton(el,'cart');
      else if(/аккаунт/i.test(text) || el.id === 'openAuth' || el.id === 'asAccountButton' || el.id === 'accountBtn') applyHeaderIconButton(el,'account');
    });
  }

  function ready(fn){
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, {once:true});
    else fn();
  }

  function normalizeCatalogButtons(){
    document.querySelectorAll('.topbar .catalog-btn').forEach(function(btn){
      btn.classList.add('as-unified-catalog-btn');
      if(btn.tagName === 'BUTTON' && !btn.getAttribute('type')) btn.setAttribute('type','button');
      btn.textContent = '☰ Каталог';
    });
  }

  function accountPopupHtml(){
    return ''+
      '<b id="asAccountEmail">Аккаунт</b>'+
      '<p class="muted">Меню профиля</p>'+
      '<a href="profile.html">Редактировать профиль</a>'+
      '<a href="favorites.html">Избранное</a>'+
      '<a href="cart.html">Корзина</a>'+
      '<hr>'+
      '<button type="button" id="asAccountLogout">Выйти</button>';
  }

  function wireAccountWrap(wrap){
    if(!wrap || wrap.dataset.asAccountReady === '1') return;
    wrap.dataset.asAccountReady = '1';
    var btn = wrap.querySelector('button.icon-btn, a.icon-btn, #asAccountButton, #openAuth, #accountBtn');
    var popup = wrap.querySelector('.as-account-popup');
    if(!btn || !popup) return;
    if(btn.tagName === 'A') btn.setAttribute('href', 'javascript:void(0)');
    btn.addEventListener('click', function(e){
      e.preventDefault();
      e.stopPropagation();
      if(e.stopImmediatePropagation) e.stopImmediatePropagation();
      closeNotifications();
      document.querySelectorAll('.as-account-wrap.open').forEach(function(w){ if(w !== wrap) w.classList.remove('open'); });
      wrap.classList.toggle('open');
    }, true);
    popup.addEventListener('click', function(e){ e.stopPropagation(); });
    var logout = popup.querySelector('#asAccountLogout');
    if(logout){
      logout.addEventListener('click', function(e){
        e.preventDefault();
        try { localStorage.removeItem('autostyle_user'); } catch(_) {}
        var originalLogout = document.getElementById('logout') || document.querySelector('[data-logout]');
        if(originalLogout && originalLogout !== logout) originalLogout.click();
        else location.href = 'index.html';
      });
    }
  }

  function replaceWithAccountWrap(el){
    if(!el || el.closest('.as-account-wrap') || el.id === 'notificationsBtn') return;
    var wrap = document.createElement('div');
    wrap.className = 'as-account-wrap';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = (el.className || 'icon-btn').replace(/\bactive\b/g,'').trim() || 'icon-btn';
    btn.id = el.id || 'asAccountButton';
    btn.innerHTML = navIconHtml('account'); btn.classList.add('as-head-icon-btn');
    var popup = document.createElement('div');
    popup.className = 'as-account-popup';
    popup.innerHTML = accountPopupHtml();
    wrap.appendChild(btn);
    wrap.appendChild(popup);
    el.replaceWith(wrap);
    wireAccountWrap(wrap);
  }

  function normalizeAccountButtons(){
    document.querySelectorAll('.topbar').forEach(function(header){
      header.querySelectorAll('.as-account-wrap').forEach(wireAccountWrap);

      var accountDrop = header.querySelector('#accountDrop');
      var openAuth = header.querySelector('#openAuth');
      if(accountDrop && openAuth){
        var wrap = document.createElement('div');
        wrap.className = 'as-account-wrap';
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'asAccountButton';
        btn.className = openAuth.className || 'icon-btn';
        btn.innerHTML = navIconHtml('account'); btn.classList.add('as-head-icon-btn');
        var popup = document.createElement('div');
        popup.className = 'as-account-popup';
        var oldDrop = accountDrop.querySelector('.drop');
        popup.innerHTML = oldDrop ? oldDrop.innerHTML : accountPopupHtml();
        popup.querySelectorAll('#logout').forEach(function(x){ x.id = 'asAccountLogout'; });
        wrap.appendChild(btn);
        wrap.appendChild(popup);
        openAuth.replaceWith(wrap);
        accountDrop.remove();
        wireAccountWrap(wrap);
        return;
      }

      var candidates = Array.from(header.querySelectorAll('a.icon-btn,button.icon-btn')).filter(function(el){
        return /аккаунт/i.test(el.textContent || '') && el.id !== 'notificationsBtn' && !el.closest('.as-account-wrap');
      });
      candidates.forEach(replaceWithAccountWrap);
    });
  }

  function closeNotifications(){
    var dd = document.getElementById('notificationsDropdown');
    if(dd) dd.classList.remove('open');
  }

  function positionNotifications(dd){
    if(!dd) return;
    var header = document.querySelector('.topbar');
    var account = document.querySelector('.topbar .as-account-wrap');
    var top = header ? header.getBoundingClientRect().bottom + 10 : 74;
    dd.style.position = 'fixed';
    dd.style.top = Math.max(68, top) + 'px';
    dd.style.left = 'auto';
    if(account){
      var r = account.getBoundingClientRect();
      dd.style.right = Math.max(12, window.innerWidth - r.right) + 'px';
    } else {
      dd.style.right = '12px';
    }
  }

  function ensureNotificationHandler(){
    var btn = document.getElementById('notificationsBtn');
    if(!btn || btn.dataset.asNotifyReady === '1') return;
    btn.dataset.asNotifyReady = '1';
    btn.addEventListener('click', function(e){
      e.preventDefault();
      e.stopPropagation();
      if(e.stopImmediatePropagation) e.stopImmediatePropagation();
      document.querySelectorAll('.as-account-wrap.open').forEach(function(w){ w.classList.remove('open'); });
      var dd = null;
      if(window.autostyleNotifications && typeof window.autostyleNotifications.renderDropdown === 'function') dd = window.autostyleNotifications.renderDropdown();
      if(!dd) dd = document.getElementById('notificationsDropdown');
      if(!dd){
        dd = document.createElement('div');
        dd.id = 'notificationsDropdown';
        dd.className = 'as-notify-dropdown';
        dd.innerHTML = '<div class="as-notify-dropdown-head"><h3>Уведомления</h3></div><div class="as-notify-empty">Пока уведомлений нет или они ещё загружаются.</div><a class="as-notify-preview" href="notifications.html"><b>Открыть все уведомления</b></a>';
        document.body.appendChild(dd);
      }
      positionNotifications(dd);
      dd.classList.toggle('open');
    }, true);
  }

  function bindGlobalClose(){
    if(document.documentElement.dataset.asGlobalCloseReady === '1') return;
    document.documentElement.dataset.asGlobalCloseReady = '1';
    document.addEventListener('click', function(e){
      if(!e.target.closest('.as-account-wrap')) document.querySelectorAll('.as-account-wrap.open').forEach(function(w){ w.classList.remove('open'); });
      var dd = document.getElementById('notificationsDropdown');
      if(dd && !e.target.closest('#notificationsBtn') && !e.target.closest('#notificationsDropdown')) dd.classList.remove('open');
    });
    window.addEventListener('resize', function(){ positionNotifications(document.getElementById('notificationsDropdown')); });
  }

  ready(function(){
    normalizeCatalogButtons();
    normalizeHeaderIcons();
    normalizeAccountButtons();
    ensureNotificationHandler();
    setTimeout(function(){ normalizeAccountButtons(); normalizeHeaderIcons(); ensureNotificationHandler(); }, 400);
    setTimeout(function(){ normalizeAccountButtons(); normalizeHeaderIcons(); ensureNotificationHandler(); }, 1500);
    bindGlobalClose();
  });
})();
