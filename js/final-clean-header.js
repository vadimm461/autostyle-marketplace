
(function () {
  "use strict";

  function safeParse(raw, fallback) {
    try { return JSON.parse(raw) || fallback; } catch (_) { return fallback; }
  }

  function countFrom(keys) {
    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const value = safeParse(raw, []);
      if (Array.isArray(value)) return value.reduce((sum, item) => sum + Number(item.qty || item.quantity || 1), 0);
      if (value && typeof value === "object") return Object.keys(value).length;
    }
    return 0;
  }

  function notifications() {
    const list = safeParse(localStorage.getItem("autostyle_notifications"), []);
    return list.length ? list : [{
      title: "AutoStyle",
      text: "Здесь будут уведомления магазина: акции, статусы заказов и новости.",
      createdAt: new Date().toISOString()
    }];
  }

  function unreadNotifications() {
    const readAt = Number(localStorage.getItem("autostyle_notifications_read_at") || 0);
    return notifications().filter(item => new Date(item.createdAt || Date.now()).getTime() > readAt).length;
  }

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function fmt(value) {
    try { return new Date(value || Date.now()).toLocaleString("ru-RU"); } catch (_) { return ""; }
  }

  function pageUrl(name) {
    const depth = location.pathname.split("/").length - 2;
    return name;
  }

  function makeHeader() {
    const oldHeader = document.querySelector("header, .header, .site-header, .top-header, .navbar, .main-header");
    const existing = document.querySelector(".as-final-header");
    if (existing) return existing;

    const header = document.createElement("header");
    header.className = "as-final-header";
    header.innerHTML = `
      <div class="as-final-header-inner">
        <a class="as-final-logo" href="index.html" aria-label="AutoStyle">
          <img class="as-final-logo-img" src="assets/autostyle-logo-full.png" alt="AutoStyle">
        </a>

        <a class="as-final-catalog" href="catalog.html">☰ Каталог</a>

        <form class="as-final-search" action="catalog.html">
          <input type="text" name="q" placeholder="Я ищу автотовары...">
          <button type="submit">Найти</button>
        </form>

        <div class="as-final-actions">
          <button class="as-final-btn" type="button" id="asFinalAccountBtn">👤 Аккаунт</button>
          <a class="as-final-btn" href="favorites.html">♡ Избранное <span class="as-final-badge" id="asFinalFavBadge" data-count="0"></span></a>
          <a class="as-final-btn" href="cart.html">🛒 Корзина <span class="as-final-badge" id="asFinalCartBadge" data-count="0"></span></a>
          <button class="as-final-btn" type="button" id="asFinalNotifyBtn">🔔 Уведомления <span class="as-final-badge" id="asFinalNotifyBadge" data-count="0"></span></button>
        </div>
      </div>
    `;

    if (oldHeader && oldHeader.parentNode) {
      oldHeader.parentNode.insertBefore(header, oldHeader);
    } else {
      document.body.insertBefore(header, document.body.firstChild);
    }

    document.body.classList.add("as-final-header-ready");
    return header;
  }

  function makeDropdowns() {
    if (!document.querySelector("#asFinalAccountDropdown")) {
      const account = document.createElement("div");
      account.id = "asFinalAccountDropdown";
      account.className = "as-final-dropdown as-final-account-dropdown";
      account.innerHTML = `
        <div class="as-final-dropdown-title">Аккаунт</div>
        <a class="as-final-menu-link" href="profile.html#profile">👤 Профиль</a>
        <a class="as-final-menu-link" href="profile.html#discount-card">💳 Скидочная карта</a>
        <a class="as-final-menu-link" href="profile.html#orders">📦 Мои заказы</a>
        <a class="as-final-menu-link" href="profile.html#security">🔐 Вход и привязки</a>
        <a class="as-final-menu-link" href="profile.html#settings">⚙️ Настройки аккаунта</a>
        <a class="as-final-menu-link" href="favorites.html">♡ Избранное</a>
      `;
      document.body.appendChild(account);
    }

    if (!document.querySelector("#asFinalNotifyDropdown")) {
      const notify = document.createElement("div");
      notify.id = "asFinalNotifyDropdown";
      notify.className = "as-final-dropdown";
      document.body.appendChild(notify);
    }
  }

  function closeDropdowns(except) {
    document.querySelectorAll(".as-final-dropdown").forEach(drop => {
      if (drop !== except) drop.classList.remove("is-open");
    });
  }

  function renderNotificationsList(drop) {
    const list = notifications();
    drop.innerHTML = `
      <div class="as-final-dropdown-title">Уведомления</div>
      ${list.map((item, index) => `
        <article class="as-final-notification" data-as-notification="${index}">
          <div class="as-final-notification-title">${esc(item.title || "Уведомление")}</div>
          <div class="as-final-notification-text">${esc(item.text || item.message || "")}</div>
          <div class="as-final-notification-date">${esc(fmt(item.createdAt))}</div>
        </article>
      `).join("")}
    `;
  }

  function renderNotificationDetail(drop, item) {
    drop.innerHTML = `
      <button class="as-final-back" type="button">← Назад</button>
      <div class="as-final-dropdown-title">${esc(item.title || "Уведомление")}</div>
      <div class="as-final-notification-text">${esc(item.text || item.message || "")}</div>
      <div class="as-final-notification-date">${esc(fmt(item.createdAt))}</div>
    `;
    drop.querySelector(".as-final-back").addEventListener("click", function () {
      renderNotificationsList(drop);
    });
  }

  function bindEvents() {
    const accountBtn = document.querySelector("#asFinalAccountBtn");
    const notifyBtn = document.querySelector("#asFinalNotifyBtn");
    const accountDrop = document.querySelector("#asFinalAccountDropdown");
    const notifyDrop = document.querySelector("#asFinalNotifyDropdown");

    if (accountBtn && accountBtn.dataset.bound !== "1") {
      accountBtn.dataset.bound = "1";
      accountBtn.addEventListener("click", function (e) {
        e.preventDefault();
        closeDropdowns(accountDrop);
        accountDrop.classList.toggle("is-open");
      });
    }

    if (notifyBtn && notifyBtn.dataset.bound !== "1") {
      notifyBtn.dataset.bound = "1";
      notifyBtn.addEventListener("click", function (e) {
        e.preventDefault();
        renderNotificationsList(notifyDrop);
        closeDropdowns(notifyDrop);
        notifyDrop.classList.toggle("is-open");
        localStorage.setItem("autostyle_notifications_read_at", String(Date.now()));
        updateBadges();
      });
    }

    if (notifyDrop && notifyDrop.dataset.bound !== "1") {
      notifyDrop.dataset.bound = "1";
      notifyDrop.addEventListener("click", function (e) {
        const itemEl = e.target.closest("[data-as-notification]");
        if (!itemEl) return;
        const item = notifications()[Number(itemEl.dataset.asNotification)];
        if (item) renderNotificationDetail(notifyDrop, item);
      });
    }

    if (document.body.dataset.finalHeaderDocBound !== "1") {
      document.body.dataset.finalHeaderDocBound = "1";
      document.addEventListener("click", function (e) {
        if (e.target.closest(".as-final-header") || e.target.closest(".as-final-dropdown")) return;
        closeDropdowns();
      });
    }
  }

  function updateBadges() {
    const fav = countFrom(["favorites", "autostyle_favorites"]);
    const cart = countFrom(["cart", "autostyle_cart"]);
    const unread = unreadNotifications();

    const favBadge = document.querySelector("#asFinalFavBadge");
    const cartBadge = document.querySelector("#asFinalCartBadge");
    const notifyBadge = document.querySelector("#asFinalNotifyBadge");

    if (favBadge) {
      favBadge.dataset.count = String(fav);
      favBadge.textContent = fav ? String(fav) : "";
    }

    if (cartBadge) {
      cartBadge.dataset.count = String(cart);
      cartBadge.textContent = cart ? String(cart) : "";
    }

    if (notifyBadge) {
      notifyBadge.dataset.count = String(unread);
      notifyBadge.textContent = unread ? String(unread) : "";
    }
  }

  function removeOldInjectedDrops() {
    document.querySelectorAll("#asHeaderNotifyDropdown, #asAccountDropdown, .as-header-notify-dropdown, .as-account-dropdown").forEach(el => {
      if (!el.classList.contains("as-final-dropdown")) el.remove();
    });
  }

  function init() {
    makeHeader();
    makeDropdowns();
    bindEvents();
    removeOldInjectedDrops();
    updateBadges();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.addEventListener("storage", updateBadges);
  document.addEventListener("click", function () { setTimeout(updateBadges, 60); }, true);

  const observer = new MutationObserver(function () {
    clearTimeout(window.__asFinalHeaderTimer);
    window.__asFinalHeaderTimer = setTimeout(init, 100);
  });

  observer.observe(document.documentElement, { childList:true, subtree:true });
})();

