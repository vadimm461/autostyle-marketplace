
(function () {
  "use strict";

  function safeParse(raw, fallback) {
    try { return JSON.parse(raw) || fallback; } catch (_) { return fallback; }
  }

  function notifications() {
    const list = safeParse(localStorage.getItem("autostyle_notifications"), []);
    return list.length ? list : [{
      id:"welcome",
      title:"AutoStyle",
      text:"Здесь будут уведомления магазина: акции, статусы заказов, новости и важная информация.",
      createdAt:new Date().toISOString()
    }];
  }

  function fmt(value) {
    try { return new Date(value || Date.now()).toLocaleString("ru-RU"); } catch (_) { return ""; }
  }

  function esc(v) {
    return String(v ?? "")
      .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
      .replaceAll('"',"&quot;").replaceAll("'","&#039;");
  }

  function header() {
    return document.querySelector("header, .header, .site-header, .top-header, .navbar, .main-header");
  }

  function findHeaderButton(kind) {
    const h = header();
    if (!h) return null;
    return Array.from(h.querySelectorAll("a, button")).find(el => {
      const t = (el.textContent || "").toLowerCase();
      if (kind === "account") return t.includes("аккаунт") || t.includes("профиль");
      if (kind === "notify") return el.id === "asHeaderNotifyBtn" || t.includes("уведом");
      return false;
    });
  }

  function closeAll(except) {
    document.querySelectorAll(".as-account-dropdown, .as-header-notify-dropdown").forEach(el => {
      if (el !== except) el.classList.remove("is-open");
    });
  }

  function ensureAccountDropdown() {
    let dd = document.querySelector("#asAccountDropdown");
    if (dd) return dd;

    dd = document.createElement("div");
    dd.id = "asAccountDropdown";
    dd.className = "as-account-dropdown";
    dd.innerHTML = `
      <div class="as-account-title">Аккаунт</div>
      <a class="as-account-menu-link" href="profile.html#profile">👤 Профиль</a>
      <a class="as-account-menu-link" href="profile.html#discount-card">💳 Скидочная карта</a>
      <a class="as-account-menu-link" href="profile.html#orders">📦 Мои заказы</a>
      <a class="as-account-menu-link" href="profile.html#security">🔐 Вход и привязки</a>
      <a class="as-account-menu-link" href="profile.html#settings">⚙️ Настройки аккаунта</a>
      <a class="as-account-menu-link" href="favorites.html">♡ Избранное</a>
    `;
    document.body.appendChild(dd);
    return dd;
  }

  function renderNotifyList(dd) {
    const list = notifications();
    dd.innerHTML = `
      <h3 class="as-header-notify-title">Уведомления</h3>
      ${list.map((item, idx) => `
        <article class="as-notification-item" data-notify-index="${idx}">
          <div class="as-notification-title">${esc(item.title || "Уведомление")}</div>
          <div class="as-notification-text">${esc(item.text || item.message || "")}</div>
          <div class="as-notification-date">${esc(fmt(item.createdAt))}</div>
        </article>
      `).join("")}
    `;
  }

  function renderNotifyDetail(dd, item) {
    dd.innerHTML = `
      <div class="as-notification-detail">
        <button type="button" class="as-notification-back">← Назад</button>
        <h4>${esc(item.title || "Уведомление")}</h4>
        <p>${esc(item.text || item.message || "")}</p>
        <div class="as-notification-date">${esc(fmt(item.createdAt))}</div>
      </div>
    `;
    dd.querySelector(".as-notification-back").addEventListener("click", () => renderNotifyList(dd));
  }

  function ensureNotifyDropdown() {
    let dd = document.querySelector("#asHeaderNotifyDropdown");
    if (!dd) {
      dd = document.createElement("div");
      dd.id = "asHeaderNotifyDropdown";
      dd.className = "as-header-notify-dropdown";
      document.body.appendChild(dd);
    }
    renderNotifyList(dd);

    dd.onclick = (e) => {
      const itemEl = e.target.closest("[data-notify-index]");
      if (!itemEl) return;
      const item = notifications()[Number(itemEl.dataset.notifyIndex)];
      if (item) renderNotifyDetail(dd, item);
    };

    return dd;
  }

  function bindButtons() {
    const account = findHeaderButton("account");
    if (account && account.dataset.asAccountDropdownBound !== "1") {
      account.dataset.asAccountDropdownBound = "1";
      account.addEventListener("click", (e) => {
        e.preventDefault();
        const dd = ensureAccountDropdown();
        closeAll(dd);
        dd.classList.toggle("is-open");
      }, true);
    }

    const notify = findHeaderButton("notify");
    if (notify && notify.dataset.asNotifyDropdownBound !== "1") {
      notify.dataset.asNotifyDropdownBound = "1";
      notify.addEventListener("click", (e) => {
        e.preventDefault();
        const dd = ensureNotifyDropdown();
        closeAll(dd);
        dd.classList.toggle("is-open");
        localStorage.setItem("autostyle_notifications_read_at", String(Date.now()));
      }, true);
    }
  }

  document.addEventListener("click", (e) => {
    if (e.target.closest(".as-account-dropdown, .as-header-notify-dropdown")) return;
    if (e.target.closest("#asHeaderNotifyBtn")) return;
    const account = findHeaderButton("account");
    if (account && account.contains(e.target)) return;
    closeAll();
  });

  function init() {
    bindButtons();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  const observer = new MutationObserver(() => {
    clearTimeout(window.__asHeaderDropdownFixTimer);
    window.__asHeaderDropdownFixTimer = setTimeout(init, 120);
  });
  observer.observe(document.documentElement, { childList:true, subtree:true });
})();

