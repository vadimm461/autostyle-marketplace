(function(){
  'use strict';

  const SCRIPT_BASE = (document.currentScript && document.currentScript.src) ? new URL('.', document.currentScript.src).href : (location.origin + location.pathname.replace(/[^/]*$/, 'js/'));
  const icon = (name) => `assets/icons/${name}.svg`;
  const qs = (s, r=document) => r.querySelector(s);
  const qsa = (s, r=document) => Array.from(r.querySelectorAll(s));

  function esc(v){
    return String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  }
  function initials(name, email){
    const base = String(name || email || 'AS').trim();
    return (base.split(/\s+/).slice(0,2).map(x => x[0]).join('') || 'AS').toUpperCase();
  }
  function cartCountValue(){
    try{
      const rows = JSON.parse(localStorage.getItem('cart') || '[]');
      if (!Array.isArray(rows)) return 0;
      return rows.reduce((sum, item) => sum + (typeof item === 'object' ? Number(item.qty || item.quantity || item.count || 1) : 1), 0);
    }catch(_){ return 0; }
  }
  function updateCartCounters(){
    const count = cartCountValue();
    qsa('#cartCount,.cartCount').forEach(el => { el.textContent = String(count); });
  }

  function navIconHtml(kind){
    const map = {
      account: ['user','Аккаунт'],
      notify: ['bell','Уведо...'],
      fav: ['heart','Избра...'],
      cart: ['cart','Корзина']
    };
    const [i, label] = map[kind] || map.account;
    const badge = kind === 'notify' ? '<b class="as-notify-count as-head-badge" data-count="0" id="notificationCount"></b>' : (kind === 'cart' ? `<b class="as-head-badge" id="cartCount">${cartCountValue()}</b>` : '');
    return `<span class="as-head-icon" aria-hidden="true"><img alt="" src="${icon(i)}"></span><span class="as-head-label">${label}</span>${badge}`;
  }

  function ensureHeaderAccount(){
    const header = qs('.topbar .bar') || qs('header .bar') || qs('.topbar') || qs('header');
    if (!header) return null;
    let wrap = qs('.as-account-wrap', header);
    let button = qs('#asAccountButton', header);

    if (!wrap) {
      const old = button || qs('#accountBtn, #openAuth, a.icon-btn[href*="profile.html"]', header);
      wrap = document.createElement('div');
      wrap.className = 'as-account-wrap';
      const btn = document.createElement('button');
      btn.id = 'asAccountButton';
      btn.className = 'icon-btn as-head-icon-btn';
      btn.type = 'button';
      btn.setAttribute('aria-label', 'Аккаунт');
      btn.innerHTML = navIconHtml('account');
      wrap.appendChild(btn);
      const popup = document.createElement('div');
      popup.className = 'as-account-popup';
      wrap.appendChild(popup);
      if (old) old.replaceWith(wrap);
      else {
        const notify = qs('#notificationsBtn', header);
        if (notify) notify.before(wrap); else header.appendChild(wrap);
      }
    } else {
      button = qs('#asAccountButton', wrap) || qs('button,a', wrap);
      if (!button || button.tagName !== 'BUTTON') {
        const old = button;
        button = document.createElement('button');
        button.id = 'asAccountButton';
        button.type = 'button';
        button.className = 'icon-btn as-head-icon-btn';
        if (old) old.replaceWith(button); else wrap.prepend(button);
      }
      button.id = 'asAccountButton';
      button.type = 'button';
      button.classList.add('icon-btn','as-head-icon-btn');
      button.innerHTML = navIconHtml('account');
      if (!qs('.as-account-popup', wrap)) {
        const popup = document.createElement('div');
        popup.className = 'as-account-popup';
        wrap.appendChild(popup);
      }
    }

    return wrap;
  }

  function normalizeHeaderButtons(){
    qsa('.topbar a.icon-btn,.topbar button.icon-btn').forEach(el => {
      if (el.closest('.as-account-wrap')) return;
      const text = (el.textContent || '').toLowerCase();
      const href = el.getAttribute('href') || '';
      if (el.id === 'notificationsBtn' || /уведом/.test(text)) {
        el.classList.add('as-head-icon-btn','as-notify-btn');
        el.innerHTML = navIconHtml('notify');
      } else if (/избран/.test(text) || href.includes('favorites.html')) {
        el.classList.add('as-head-icon-btn');
        el.innerHTML = navIconHtml('fav');
      } else if (/корзин/.test(text) || href.includes('cart.html')) {
        el.classList.add('as-head-icon-btn');
        el.innerHTML = navIconHtml('cart');
      }
    });
    updateCartCounters();
  }

  function getPopup(){
    const wrap = ensureHeaderAccount();
    if (!wrap) return null;
    return qs('.as-account-popup', wrap);
  }

  function renderGuestAccount(message){
    const wrap = ensureHeaderAccount();
    const popup = getPopup();
    if (!popup) return;
    document.body.classList.remove('as-authenticated');
    popup.innerHTML = `
      <div class="as-account-guest">
        <div class="as-account-title">Аккаунт</div>
        <div class="as-account-subtitle">${esc(message || 'Войдите, чтобы открыть профиль')}</div>
        <button class="as-account-login" type="button" data-as-open-login>Войти</button>
      </div>`;
    popup.querySelector('[data-as-open-login]')?.addEventListener('click', (e)=>{
      e.preventDefault(); e.stopPropagation(); openLoginPopup();
    });
  }

  function renderUserAccount(user, profile={}){
    const wrap = ensureHeaderAccount();
    const popup = getPopup();
    if (!popup) return;
    document.body.classList.add('as-authenticated');
    const name = profile.name || profile.displayName || user.displayName || (user.email ? user.email.split('@')[0] : 'Пользователь');
    const email = user.email || profile.email || user.phoneNumber || '';
    const photo = profile.photoURL || profile.photo || profile.avatar || user.photoURL || '';
    const avatar = photo ? `<img src="${esc(photo)}" alt="${esc(name)}" loading="lazy" decoding="async">` : esc(initials(name, email));
    popup.innerHTML = `
      <a class="as-account-head" href="profile.html#account">
        <span class="as-account-avatar">${avatar}</span>
        <span class="as-account-head-text">
          <strong class="as-account-head-name">${esc(name)}</strong>
          ${email ? `<small class="as-account-head-email">${esc(email)}</small>` : ''}
        </span>
      </a>
      <div class="as-account-menu">
        <a href="profile.html#account"><img class="as-account-menu-icon" src="${icon('user')}" alt=""><span>Фото и профиль</span></a>
        <a href="profile.html#discount-card"><img class="as-account-menu-icon" src="${icon('discount-card')}" alt=""><span>Скидочная карта</span></a>
        <a href="cart.html"><img class="as-account-menu-icon" src="${icon('cart')}" alt=""><span>Корзина</span></a>
        <a href="favorites.html"><img class="as-account-menu-icon" src="${icon('heart')}" alt=""><span>Избранное</span></a>
        <a href="profile.html#orders"><img class="as-account-menu-icon" src="${icon('package')}" alt=""><span>Заказы</span></a>
      </div>
      <button id="asAccountLogout" class="as-account-logout" type="button">Выйти</button>`;
    popup.querySelector('#asAccountLogout')?.addEventListener('click', async (e)=>{
      e.preventDefault(); e.stopPropagation();
      try{
        const { auth } = await import(new URL('firebase.js', SCRIPT_BASE).href);
        const { signOut } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
        localStorage.removeItem('autostyle_user');
        await signOut(auth);
      }catch(err){ console.warn('logout error', err); }
      location.href = 'index.html';
    });
  }

  function bindAccountToggle(){
    const wrap = ensureHeaderAccount();
    if (!wrap || wrap.dataset.asRootReady === '1') return;
    wrap.dataset.asRootReady = '1';
    const btn = qs('#asAccountButton', wrap);
    btn?.addEventListener('click', (e)=>{
      e.preventDefault(); e.stopPropagation();
      qsa('.as-account-wrap.open').forEach(w => { if (w !== wrap) w.classList.remove('open'); });
      wrap.classList.toggle('open');
    });
    wrap.addEventListener('click', e => e.stopPropagation());
  }

  document.addEventListener('click', (e)=>{
    if (!e.target.closest('.as-account-wrap')) qsa('.as-account-wrap.open').forEach(w => w.classList.remove('open'));
  });
  document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape') qsa('.as-account-wrap.open').forEach(w => w.classList.remove('open')); });

  async function loadProfile(user){
    if (!user) return {};
    try{
      const { db, COLLECTIONS } = await import(new URL('firebase.js', SCRIPT_BASE).href);
      const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
      const snap = await getDoc(doc(db, COLLECTIONS?.users || 'autostyle_users', user.uid));
      return snap.exists() ? snap.data() : {};
    }catch(err){
      console.warn('account profile load error', err);
      return {};
    }
  }

  async function initAuthBridge(){
    try{
      const { auth } = await import(new URL('firebase.js', SCRIPT_BASE).href);
      const { onAuthStateChanged } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
      onAuthStateChanged(auth, async (user)=>{
        window.__asCurrentUser = user || null;
        if (!user) renderGuestAccount();
        else renderUserAccount(user, await loadProfile(user));
        updateCartCounters();
      });
    }catch(err){
      console.warn('auth bridge error', err);
      renderGuestAccount();
    }
  }

  function ensureAuthModal(){
    let modal = qs('#authModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'authModal';
    modal.className = 'modal as-auth-modal';
    modal.innerHTML = `
      <div class="modal-card as-auth-card">
        <button id="closeAuth" class="as-auth-close" type="button" aria-label="Закрыть">×</button>
        <h2>Вход в AutoStyle</h2>
        <p class="muted as-auth-hint">Войдите по почте или создайте аккаунт.</p>
        <div class="tabs as-auth-tabs"><button class="tab active" type="button" data-tab="login">Вход</button><button class="tab" type="button" data-tab="register">Регистрация</button></div>
        <form id="loginForm" class="as-auth-form"><label class="field">Email<input id="loginEmail" type="email" required></label><label class="field">Пароль<input id="loginPass" type="password" required></label><button class="primary" type="submit" style="width:100%">Войти</button></form>
        <form id="registerForm" class="as-auth-form" style="display:none"><label class="field">Имя<input id="regName" required></label><label class="field">Email<input id="regEmail" type="email" required></label><label class="field">Пароль<input id="regPass" type="password" minlength="6" required></label><button class="primary" type="submit" style="width:100%">Создать аккаунт</button></form>
        <p id="authFullMsg" class="auth-msg"></p>
      </div>`;
    document.body.appendChild(modal);
    return modal;
  }

  function bindAuthModal(){
    const modal = ensureAuthModal();
    if (modal.dataset.asBound === '1') return;
    modal.dataset.asBound = '1';
    const msg = qs('#authFullMsg', modal);
    const loginForm = qs('#loginForm', modal);
    const regForm = qs('#registerForm', modal);
    qsa('[data-tab]', modal).forEach(tab => tab.addEventListener('click', ()=>{
      qsa('[data-tab]', modal).forEach(t=>t.classList.toggle('active', t === tab));
      const mode = tab.dataset.tab;
      if (loginForm) loginForm.style.display = mode === 'login' ? '' : 'none';
      if (regForm) regForm.style.display = mode === 'register' ? '' : 'none';
      if (msg) msg.textContent = '';
    }));
    qs('#closeAuth', modal)?.addEventListener('click', ()=> closeLoginPopup());
    modal.addEventListener('click', e => { if(e.target === modal) closeLoginPopup(); });

    loginForm?.addEventListener('submit', async (e)=>{
      e.preventDefault();
      if (msg) msg.textContent = 'Проверяем аккаунт...';
      try{
        const { auth } = await import(new URL('firebase.js', SCRIPT_BASE).href);
        const { signInWithEmailAndPassword, signOut } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
        const cred = await signInWithEmailAndPassword(auth, qs('#loginEmail', modal).value.trim(), qs('#loginPass', modal).value);
        await cred.user.reload();
        if (!cred.user.emailVerified) {
          await signOut(auth);
          if (msg) msg.textContent = 'Аккаунт не активирован. Перейдите на почту и активируйте аккаунт. Если письма нет — проверьте спам.';
          window.asAlert?.('Аккаунт не активирован. Перейдите на почту и активируйте аккаунт. Если не видите письмо — посмотрите спам.');
          return;
        }
        closeLoginPopup();
      }catch(err){
        if (msg) msg.textContent = 'Не удалось войти: ' + (err?.message || err);
      }
    });

    regForm?.addEventListener('submit', async (e)=>{
      e.preventDefault();
      if (msg) msg.textContent = 'Создаём аккаунт...';
      try{
        const { auth, db, COLLECTIONS } = await import(new URL('firebase.js', SCRIPT_BASE).href);
        const { createUserWithEmailAndPassword, updateProfile, sendEmailVerification, signOut } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
        const { doc, setDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
        const name = qs('#regName', modal).value.trim();
        const email = qs('#regEmail', modal).value.trim();
        const cred = await createUserWithEmailAndPassword(auth, email, qs('#regPass', modal).value);
        if (name) await updateProfile(cred.user, { displayName: name });
        await setDoc(doc(db, COLLECTIONS?.users || 'autostyle_users', cred.user.uid), { name, email, role:'user', createdAt: serverTimestamp() }, { merge:true });
        await sendEmailVerification(cred.user);
        await signOut(auth);
        if (msg) msg.textContent = 'Письмо отправлено. Активируйте аккаунт через почту. Если письма нет — проверьте спам.';
        window.asAlert?.('Аккаунт создан. Перейдите на почту и активируйте аккаунт. Если письма нет — проверьте спам.');
        qsa('[data-tab]', modal).find(t=>t.dataset.tab==='login')?.click();
      }catch(err){
        if (msg) msg.textContent = 'Не удалось создать аккаунт: ' + (err?.message || err);
      }
    });
  }

  function openLoginPopup(message){
    const modal = ensureAuthModal();
    bindAuthModal();
    if (message) {
      const msg = qs('#authFullMsg', modal);
      if (msg) msg.textContent = message;
    }
    modal.classList.add('open','show');
    modal.removeAttribute('hidden');
    modal.style.display = 'flex';
    setTimeout(()=> qs('#loginEmail', modal)?.focus(), 30);
  }
  function closeLoginPopup(){
    const modal = qs('#authModal');
    if (!modal) return;
    modal.classList.remove('open','show');
    modal.style.display = 'none';
  }
  window.AutoStyleOpenAuthModal = openLoginPopup;
  window.openLoginPopup = openLoginPopup;

  function initCustomAlert(){
    if (window.__asCustomAlertReady) return;
    window.__asCustomAlertReady = true;
    const nativeAlert = window.alert.bind(window);
    function close(backdrop){
      if(!backdrop) return;
      const onKey = backdrop.__asOnKey;
      if(onKey) document.removeEventListener('keydown', onKey);
      backdrop.classList.remove('show');
      setTimeout(()=>backdrop.remove(), 120);
    }
    function show(message){
      if(!document.body) return nativeAlert(message);
      const old = qs('.as-alert-backdrop');
      if(old) old.remove();
      const backdrop = document.createElement('div');
      backdrop.className = 'as-alert-backdrop';
      backdrop.innerHTML = `
        <div class="as-alert-card" role="dialog" aria-modal="true">
          <div class="as-alert-head"><div class="as-alert-icon">AS</div><h3 class="as-alert-title">AutoStyle</h3></div>
          <p class="as-alert-message"></p>
          <div class="as-alert-actions"><button type="button" class="as-alert-ok">Окей</button></div>
        </div>`;
      qs('.as-alert-message', backdrop).textContent = String(message || '');
      document.body.appendChild(backdrop);
      requestAnimationFrame(()=>backdrop.classList.add('show'));
      const ok = qs('.as-alert-ok', backdrop);
      ok.addEventListener('click', e => { e.preventDefault(); close(backdrop); });
      backdrop.addEventListener('click', e => { if(e.target === backdrop) close(backdrop); });
      backdrop.__asOnKey = e => { if(e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); close(backdrop); } };
      document.addEventListener('keydown', backdrop.__asOnKey);
      setTimeout(()=>ok.focus(), 20);
    }
    window.alert = show;
    window.asAlert = show;
  }

  function fixCatalogPricePosition(){
    const top = qs('.catalog-top');
    const priceFrom = qs('#priceFrom');
    const priceTo = qs('#priceTo');
    const zero = qs('#zeroNotice');
    if(!top || !priceFrom || !priceTo || !zero || qs('.catalog-top-price', top)) return;
    const box = document.createElement('div');
    box.className = 'catalog-top-price';
    box.innerHTML = '<span>Цена, ₽</span>';
    box.appendChild(priceFrom);
    box.appendChild(priceTo);
    top.insertBefore(box, zero);
  }

  function init(){
    initCustomAlert();
    ensureHeaderAccount();
    normalizeHeaderButtons();
    bindAccountToggle();
    bindAuthModal();
    fixCatalogPricePosition();
    renderGuestAccount();
    initAuthBridge();
    window.addEventListener('storage', updateCartCounters);
    window.addEventListener('autostyle-cart-updated', updateCartCounters);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();

  window.AutoStyleAccountMenu = {
    renderGuest: renderGuestAccount,
    renderUser: (user, logoutOrProfile) => {
      // Совместимость со старым кодом: если вторым параметром передали функцию выхода, просто игнорируем её,
      // выход уже привязан внутри единого меню.
      renderUserAccount(user, (logoutOrProfile && typeof logoutOrProfile === 'object') ? logoutOrProfile : {});
    },
    openLogin: openLoginPopup
  };
})();
