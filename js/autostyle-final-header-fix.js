(function(){
  'use strict';
  const esc = v => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const safeParse = (raw, fallback) => { try { const v = JSON.parse(raw); return v || fallback; } catch(e){ return fallback; } };
  const textOf = el => (el && el.textContent || '').trim().toLowerCase();
  const isHeader = el => !!(el && el.closest('header,.topbar,.site-header,.main-header,.navbar'));
  function headerAccountButtons(){
    return Array.from(document.querySelectorAll('header a,header button,.topbar a,.topbar button')).filter(el => {
      const t = textOf(el);
      return isHeader(el) && (t === 'аккаунт' || t.includes('аккаунт')) && !el.closest('#asFixedAccountDropdown');
    });
  }
  function headerNotifyButtons(){
    return Array.from(document.querySelectorAll('#notificationsBtn,#asHeaderNotifyBtn,header a,header button,.topbar a,.topbar button')).filter(el => {
      const t = textOf(el);
      return isHeader(el) && (el.id === 'notificationsBtn' || el.id === 'asHeaderNotifyBtn' || t.includes('уведом')) && !el.closest('#asFixedNotificationsDropdown');
    });
  }
  function closeAll(except){
    ['asFixedAccountDropdown','asFixedNotificationsDropdown','notificationsDropdown','asHeaderNotifyDropdown','asAccountDropdown'].forEach(id => {
      const el = document.getElementById(id);
      if (el && el !== except) { el.classList.remove('is-open','open'); }
    });
  }
  function accountDrop(){
    let dd = document.getElementById('asFixedAccountDropdown');
    if (!dd){
      dd = document.createElement('div');
      dd.id = 'asFixedAccountDropdown';
      dd.innerHTML = '<div class="as-fixed-drop-title">Аккаунт</div>'+
        '<a class="as-fixed-menu-link" href="profile.html">👤 Профиль</a>'+
        '<a class="as-fixed-menu-link" href="profile.html#discount-card">💳 Скидочная карта</a>'+
        '<a class="as-fixed-menu-link" href="profile.html#orders">📦 Мои заказы</a>'+
        '<a class="as-fixed-menu-link" href="favorites.html">♡ Избранное</a>'+
        '<a class="as-fixed-menu-link" href="cart.html">🛒 Корзина</a>';
      document.body.appendChild(dd);
    }
    return dd;
  }
  function notificationList(){
    const a = safeParse(localStorage.getItem('autostyle_notifications_cache_v2'), []);
    const b = safeParse(localStorage.getItem('autostyle_notifications'), []);
    const list = Array.isArray(a) && a.length ? a : (Array.isArray(b) ? b : []);
    return list.length ? list : [{id:'empty', title:'Уведомления', text:'Пока уведомлений нет.', createdAt:Date.now()}];
  }
  function notifyText(n){ return n.text || n.message || n.body || n.description || ''; }
  function notifyDate(n){
    const v = n.createdAt?.seconds ? n.createdAt.seconds * 1000 : (n.createdAtLocal || n.createdAt || n.date || Date.now());
    try { return new Date(v).toLocaleString('ru-RU'); } catch(e){ return ''; }
  }
  function renderNotifyList(dd){
    const list = notificationList().slice(0, 10);
    dd.innerHTML = '<div class="as-fixed-drop-title">Уведомления</div>' + list.map((n,i) =>
      '<button type="button" class="as-fixed-notify-item" data-as-notify-index="'+i+'">'+
      '<div class="as-fixed-notify-title">'+esc(n.title || 'Уведомление')+'</div>'+
      '<div class="as-fixed-notify-text">'+esc(notifyText(n))+'</div>'+
      '<div class="as-fixed-notify-date">'+esc(notifyDate(n))+'</div>'+
      '</button>'
    ).join('') + '<a class="as-fixed-notify-all" href="notifications.html"><b>Открыть все уведомления</b></a>';
  }
  function notifyDrop(){
    let dd = document.getElementById('asFixedNotificationsDropdown');
    if (!dd){
      dd = document.createElement('div');
      dd.id = 'asFixedNotificationsDropdown';
      document.body.appendChild(dd);
      dd.addEventListener('click', e => {
        const item = e.target.closest('[data-as-notify-index]');
        if (!item) return;
        e.preventDefault();
        const n = notificationList()[Number(item.dataset.asNotifyIndex)];
        dd.innerHTML = '<button type="button" class="as-fixed-back">← Назад</button>'+
          '<div class="as-fixed-drop-title">'+esc(n?.title || 'Уведомление')+'</div>'+
          '<div class="as-fixed-detail-body">'+(n?.html || '<p>'+esc(notifyText(n))+'</p>')+'</div>'+
          '<div class="as-fixed-notify-date">'+esc(notifyDate(n || {}))+'</div>';
        dd.querySelector('.as-fixed-back').onclick = () => renderNotifyList(dd);
      });
    }
    renderNotifyList(dd);
    return dd;
  }
  function bind(){
    headerAccountButtons().forEach(btn => {
      if (btn.dataset.asFinalAccount === '1') return;
      btn.dataset.asFinalAccount = '1';
      btn.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        const dd = accountDrop(); closeAll(dd); dd.classList.toggle('is-open');
      }, true);
    });
    headerNotifyButtons().forEach(btn => {
      if (btn.dataset.asFinalNotify === '1') return;
      btn.dataset.asFinalNotify = '1';
      btn.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        const dd = notifyDrop(); closeAll(dd); dd.classList.toggle('is-open');
      }, true);
    });
  }
  document.addEventListener('click', e => {
    if (e.target.closest('#asFixedAccountDropdown,#asFixedNotificationsDropdown')) return;
    if (headerAccountButtons().some(b => b.contains(e.target)) || headerNotifyButtons().some(b => b.contains(e.target))) return;
    closeAll();
  }, true);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind); else bind();
  new MutationObserver(() => { clearTimeout(window.__asFinalHeaderFixTimer); window.__asFinalHeaderFixTimer=setTimeout(bind,80); }).observe(document.documentElement,{childList:true,subtree:true});
})();
