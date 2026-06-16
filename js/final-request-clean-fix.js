(function(){
  'use strict';
  function $(s,r=document){return r.querySelector(s)}
  function $$(s,r=document){return Array.from(r.querySelectorAll(s))}

  function enhanceAccountPopup(){
    // Меню аккаунта теперь собирается в js/autostyle-project-rework.js и обновляется из Firebase-auth.
    // Здесь оставляем только совместимость, без перерисовки и без наложения поверх старого HTML.
    const btn = document.querySelector('#asAccountButton');
    const wrap = btn?.closest('.as-account-wrap');
    if(btn && wrap && wrap.dataset.finalClickReady !== '1'){
      wrap.dataset.finalClickReady = '1';
      btn.addEventListener('click', (e)=>{
        e.preventDefault();
        e.stopPropagation();
        wrap.classList.toggle('open');
      });
    }
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

/* ===== AutoStyle custom alert modal ===== */
(function () {
  if (window.__asCustomAlertReady) return;
  window.__asCustomAlertReady = true;

  const nativeAlert = window.alert ? window.alert.bind(window) : null;

  function closeAlert(backdrop) {
    if (!backdrop) return;
    backdrop.remove();
    const next = window.__asAlertQueue && window.__asAlertQueue.shift();
    if (next) setTimeout(() => showAlert(next.message), 60);
  }

  function showAlert(message) {
    if (!document.body) {
      if (nativeAlert) nativeAlert(message);
      return;
    }

    if (document.querySelector('.as-alert-backdrop')) {
      window.__asAlertQueue = window.__asAlertQueue || [];
      window.__asAlertQueue.push({ message });
      return;
    }

    const backdrop = document.createElement('div');
    backdrop.className = 'as-alert-backdrop';
    backdrop.innerHTML = `
      <div class="as-alert-card" role="dialog" aria-modal="true" aria-labelledby="asAlertTitle">
        <div class="as-alert-head">
          <div class="as-alert-icon">AS</div>
          <h3 id="asAlertTitle" class="as-alert-title">AutoStyle</h3>
        </div>
        <p class="as-alert-message"></p>
        <div class="as-alert-actions">
          <button type="button" class="as-alert-ok">Окей</button>
        </div>
      </div>
    `;

    backdrop.querySelector('.as-alert-message').textContent = String(message || '');
    document.body.appendChild(backdrop);

    const okBtn = backdrop.querySelector('.as-alert-ok');
    okBtn.focus();
    okBtn.addEventListener('click', () => closeAlert(backdrop));
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeAlert(backdrop);
    });

    const onKey = (e) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        document.removeEventListener('keydown', onKey);
        closeAlert(backdrop);
      }
    };
    document.addEventListener('keydown', onKey);
  }

  window.alert = function (message) {
    showAlert(message);
  };
})();
