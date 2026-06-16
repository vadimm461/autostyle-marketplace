(function(){
  'use strict';


  function iconPath(name){
    return 'assets/icons/' + name + '.svg';
  }

  function navIconHtml(kind, countId){
    var data = {
      account:['user','Аккаунт'],
      notify:['bell','Уведомления'],
      fav:['heart','Избранное'],
      cart:['cart','Корзина']
    }[kind] || ['grid',''];
    var badge = '';
    if(kind === 'notify') badge = '<b id="notificationCount" class="as-notify-count as-head-badge" data-count="0"></b>';
    if(kind === 'cart') badge = '<b id="cartCount" class="as-head-badge">0</b>';
    return '<span class="as-head-icon" aria-hidden="true"><img src="'+iconPath(data[0])+'" alt="" loading="eager"></span><span class="as-head-label">'+data[1]+'</span>'+badge;
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

  function openAuthModal(){
    var modal = document.getElementById('authModal');
    if(!modal){
      return false;
    }
    modal.classList.add('open');
    modal.classList.add('show');
    modal.removeAttribute('hidden');
    modal.style.display = '';

    var loginTab = modal.querySelector('[data-tab="login"], [data-auth-mode="login-email"]');
    if(loginTab) loginTab.click();

    var firstInput = modal.querySelector('#loginEmail, input[type="email"], input:not([type])');
    if(firstInput){
      setTimeout(function(){ try{ firstInput.focus(); }catch(_){} }, 60);
    }
    return true;
  }

  window.AutoStyleOpenAuthModal = openAuthModal;

  function bindAccountPopupActions(wrap){
    if(!wrap) return;
    wrap.querySelectorAll('[data-open-auth], .as-account-login').forEach(function(loginBtn){
      if(loginBtn.dataset.asLoginReady === '1') return;
      loginBtn.dataset.asLoginReady = '1';
      loginBtn.addEventListener('click', function(e){
        e.preventDefault();
        e.stopPropagation();
        if(e.stopImmediatePropagation) e.stopImmediatePropagation();
        if(openAuthModal()){
          wrap.classList.remove('open');
        }
      }, true);
    });
  }

  function normalizeCatalogButtons(){
    document.querySelectorAll('.topbar .catalog-btn').forEach(function(btn){
      btn.classList.add('as-unified-catalog-btn');
      if(btn.tagName === 'BUTTON' && !btn.getAttribute('type')) btn.setAttribute('type','button');
      btn.innerHTML = '<img class="as-catalog-icon" src="assets/icons/menu.svg" alt="" aria-hidden="true"> <span>Каталог</span>';
    });
  }

  function accountIcon(name, label){
    return '<img class="as-account-menu-icon" src="assets/icons/'+name+'.svg" alt="" aria-hidden="true"><span>'+label+'</span>';
  }

  function accountGuestHtml(){
    return ''+
      '<div class="as-account-guest">'+
        '<div class="as-account-title">Аккаунт</div>'+
        '<div class="as-account-subtitle">Войдите, чтобы открыть профиль</div>'+
        '<button type="button" class="as-account-login" data-open-auth="1">Войти</button>'+
      '</div>';
  }

  function escapeHtml(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(ch){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[ch] || ch;
    });
  }

  function accountUserHtml(user){
    var email = (user && (user.email || user.phoneNumber)) || '';
    var name = (user && (user.displayName || user.name || user.fullName || '')).trim();
    if(!name && email) name = email.split('@')[0];
    if(!name) name = 'Пользователь';
    var photo = user && (user.photoURL || user.photo || user.avatar);
    var initials = (name || email || 'AS').trim().slice(0,2).toUpperCase();
    var avatar = photo ? '<img src="'+escapeHtml(photo)+'" alt="">' : escapeHtml(initials || 'AS');
    return ''+
      '<div class="as-account-profile-head">'+
        '<a class="as-account-avatar" href="profile.html#account" aria-label="Фото и профиль">'+avatar+'</a>'+
        '<a class="as-account-head-text" href="profile.html#account" title="'+escapeHtml(email || name)+'">'+
          '<div class="as-account-title">'+escapeHtml(name)+'</div>'+
          '<div class="as-account-subtitle" id="asAccountEmail">'+escapeHtml(email || 'Аккаунт')+'</div>'+
        '</a>'+
      '</div>'+
      '<nav class="as-account-menu">'+
        '<a href="profile.html#account">'+accountIcon('user','Фото и профиль')+'</a>'+
        '<a href="profile.html#discount-card">'+accountIcon('card','Скидочная карта')+'</a>'+
        '<a href="cart.html">'+accountIcon('cart','Корзина')+'</a>'+
        '<a href="favorites.html">'+accountIcon('heart','Избранное')+'</a>'+
        '<a href="profile.html#orders">'+accountIcon('package','Заказы')+'</a>'+
      '</nav>'+
      '<hr>'+
      '<button type="button" id="asAccountLogout">Выйти</button>';
  }

  function accountPopupHtml(){ return accountGuestHtml(); }

  function renderAccountGuest(){
    document.documentElement.classList.remove('as-authenticated');
    document.querySelectorAll('.as-account-wrap').forEach(function(wrap){
      var popup = wrap.querySelector('.as-account-popup');
      if(popup) popup.innerHTML = accountGuestHtml();
      var btn = wrap.querySelector('.as-head-icon-btn');
      if(btn) btn.classList.remove('active');
      wireAccountWrap(wrap);
      bindAccountPopupActions(wrap);
    });
  }

  function renderAccountUser(user, onLogout){
    document.documentElement.classList.add('as-authenticated');
    document.querySelectorAll('.as-account-wrap').forEach(function(wrap){
      var popup = wrap.querySelector('.as-account-popup');
      if(popup) popup.innerHTML = accountUserHtml(user || {});
      var btn = wrap.querySelector('.as-head-icon-btn');
      if(btn) btn.classList.remove('active');
      wireAccountWrap(wrap);
      bindAccountPopupActions(wrap);
      var logout = wrap.querySelector('#asAccountLogout');
      if(logout){
        logout.onclick = function(e){
          e.preventDefault();
          if(typeof onLogout === 'function') onLogout(e);
          else {
            var originalLogout = document.getElementById('logout') || document.querySelector('[data-logout]');
            if(originalLogout && originalLogout !== logout) originalLogout.click();
          }
        };
      }
    });
  }



  function initAccountAuthBridge(){
    if(window.__asAccountAuthBridgeReady) return;
    window.__asAccountAuthBridgeReady = true;
    Promise.all([
      import('./firebase.js'),
      import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js')
    ]).then(async function(mods){
      var firebase = mods[0];
      var authMod = mods[1];
      var fsMod = mods[2];
      var auth = firebase.auth;
      var db = firebase.db;
      var COLLECTIONS = firebase.COLLECTIONS || {};
      if(!auth || !authMod.onAuthStateChanged) return;

      async function loadProfile(user){
        if(!user || !db || !fsMod.getDoc || !fsMod.doc) return {};
        try{
          var snap = await fsMod.getDoc(fsMod.doc(db, COLLECTIONS.users || 'autostyle_users', user.uid));
          return snap.exists() ? (snap.data() || {}) : {};
        }catch(e){
          console.warn('account profile load error', e);
          return {};
        }
      }

      async function logout(){
        try{ localStorage.removeItem('cart'); }catch(_){}
        try{ localStorage.removeItem('favorites'); }catch(_){}
        try{ localStorage.removeItem('autostyle_user'); }catch(_){}
        try{ await authMod.signOut(auth); }catch(e){ console.warn('logout error', e); }
        location.href = 'index.html';
      }

      authMod.onAuthStateChanged(auth, async function(user){
        if(user){
          var profile = await loadProfile(user);
          var merged = Object.assign({}, user, {
            email: user.email || profile.email || '',
            displayName: profile.name || profile.fullName || user.displayName || '',
            photoURL: profile.photoURL || profile.photo || user.photoURL || ''
          });
          renderAccountUser(merged, logout);
        } else {
          renderAccountGuest();
        }
      });
    }).catch(function(e){ console.warn('account auth bridge error', e); });
  }

  window.AutoStyleAccountMenu = { renderGuest: renderAccountGuest, renderUser: renderAccountUser };

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
    bindAccountPopupActions(wrap);
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
    bindAccountPopupActions(wrap);
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
        popup.innerHTML = accountPopupHtml();
        popup.querySelectorAll('#logout').forEach(function(x){ x.id = 'asAccountLogout'; });
        wrap.appendChild(btn);
        wrap.appendChild(popup);
        openAuth.replaceWith(wrap);
        accountDrop.remove();
        wireAccountWrap(wrap);
        bindAccountPopupActions(wrap);
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
    // Каталог не трогаем: оставляем кнопку как в исходной верстке.
    normalizeHeaderIcons();
    normalizeAccountButtons();
    initAccountAuthBridge();
    // Состояние аккаунта обновляется здесь же, одной общей кнопкой для всех страниц.
    ensureNotificationHandler();
    setTimeout(function(){ normalizeAccountButtons(); normalizeHeaderIcons(); ensureNotificationHandler(); }, 400);
    setTimeout(function(){ normalizeAccountButtons(); normalizeHeaderIcons(); ensureNotificationHandler(); }, 1500);
    bindGlobalClose();
  });
})();
