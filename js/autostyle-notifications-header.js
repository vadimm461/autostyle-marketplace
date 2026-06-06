
(function () {
  "use strict";

  const NOTIFY_KEY = "autostyle_notifications";
  const READ_KEY = "autostyle_notifications_read_at";

  function safeParse(raw, fallback) {
    try { return JSON.parse(raw) || fallback; } catch (_) { return fallback; }
  }

  function getLocalNotifications() {
    return safeParse(localStorage.getItem(NOTIFY_KEY), []);
  }

  function saveLocalNotification(item) {
    const list = getLocalNotifications();
    list.unshift(item);
    localStorage.setItem(NOTIFY_KEY, JSON.stringify(list.slice(0, 80)));
  }

  async function tryFirestoreAdd(item) {
    const db = window.db || window.firestore || window.firebaseDb;
    if (!db) return false;

    try {
      if (typeof collection === "function" && typeof addDoc === "function") {
        await addDoc(collection(db, "autostyle_notifications"), item);
        return true;
      }
      if (window.firebase && firebase.firestore) {
        await firebase.firestore().collection("autostyle_notifications").add(item);
        return true;
      }
    } catch (err) {
      console.warn("Notification Firestore save skipped:", err);
    }
    return false;
  }

  function formatDate(value) {
    try {
      const date = value?.toDate ? value.toDate() : new Date(value || Date.now());
      return date.toLocaleString("ru-RU");
    } catch (_) {
      return "";
    }
  }

  function allLocalNotifications() {
    const seed = getLocalNotifications();
    if (!seed.length) {
      return [{
        id: "welcome",
        title: "Добро пожаловать в AutoStyle",
        text: "Здесь будут отображаться уведомления магазина: акции, статусы заказов и новости.",
        createdAt: new Date().toISOString()
      }];
    }
    return seed;
  }

  function unreadCount() {
    const readAt = Number(localStorage.getItem(READ_KEY) || 0);
    return allLocalNotifications().filter(n => new Date(n.createdAt || Date.now()).getTime() > readAt).length;
  }

  function updateHeaderCounts() {
    document.querySelectorAll("[data-as-notify-count]").forEach(el => {
      const count = unreadCount();
      el.dataset.count = String(count);
      el.textContent = count ? String(count) : "";
    });

    const favorites = safeParse(localStorage.getItem("favorites"), safeParse(localStorage.getItem("autostyle_favorites"), []));
    const cart = safeParse(localStorage.getItem("cart"), safeParse(localStorage.getItem("autostyle_cart"), []));
    const favCount = Array.isArray(favorites) ? favorites.length : Object.keys(favorites || {}).length;
    const cartCount = Array.isArray(cart) ? cart.reduce((s, i) => s + Number(i.qty || i.quantity || 1), 0) : Object.keys(cart || {}).length;

    document.querySelectorAll("[data-as-fav-count]").forEach(el => {
      el.dataset.count = String(favCount);
      el.textContent = favCount ? String(favCount) : "";
    });
    document.querySelectorAll("[data-as-cart-count]").forEach(el => {
      el.dataset.count = String(cartCount);
      el.textContent = cartCount ? String(cartCount) : "";
    });
  }

  function addSlogan() {
    const logoCandidates = document.querySelectorAll(".logo, .site-logo, .header-logo, .brand, .navbar-brand, a[href='index.html'], a[href='./index.html']");
    for (const logo of logoCandidates) {
      const text = (logo.textContent || "").toLowerCase();
      if (!text.includes("auto") && !text.includes("style") && !logo.querySelector("img")) continue;
      if (logo.closest(".as-logo-slogan-wrap")) return;

      const wrap = document.createElement("div");
      wrap.className = "as-logo-slogan-wrap";
      logo.parentNode.insertBefore(wrap, logo);
      wrap.appendChild(logo);
      const slogan = document.createElement("div");
      slogan.className = "as-header-slogan";
      slogan.textContent = "все для движения вперед";
      wrap.appendChild(slogan);
      return;
    }
  }

  function decorateHeaderButtons() {
    const links = Array.from(document.querySelectorAll("a, button"));

    links.forEach(el => {
      const txt = (el.textContent || "").trim().toLowerCase();

      if (txt.includes("аккаунт") || txt.includes("профиль")) {
        if (!el.querySelector(".as-nav-icon")) el.insertAdjacentHTML("afterbegin", '<span class="as-nav-icon">👤</span>');
        el.classList.add("as-nav-icon-btn");
      }

      if (txt.includes("избран")) {
        if (!el.querySelector(".as-nav-icon")) el.insertAdjacentHTML("afterbegin", '<span class="as-nav-icon">♡</span>');
        if (!el.querySelector("[data-as-fav-count]")) el.insertAdjacentHTML("beforeend", '<span class="as-nav-count" data-as-fav-count data-count="0"></span>');
        el.classList.add("as-nav-icon-btn");
      }

      if (txt.includes("корзин")) {
        if (!el.querySelector(".as-nav-icon")) el.insertAdjacentHTML("afterbegin", '<span class="as-nav-icon">🛒</span>');
        if (!el.querySelector("[data-as-cart-count]")) el.insertAdjacentHTML("beforeend", '<span class="as-nav-count" data-as-cart-count data-count="0"></span>');
        el.classList.add("as-nav-icon-btn");
      }
    });
  }

  function addProfileNotificationsNav() {
    const profileMenu = document.querySelector(".profile-menu, .profile-sidebar, .account-menu, .profile-nav, aside");
    if (!profileMenu || document.querySelector("[data-as-profile-notifications-link]")) return;

    const link = document.createElement("a");
    link.href = "#notifications";
    link.dataset.asProfileNotificationsLink = "1";
    link.className = "as-profile-notifications-link";
    link.innerHTML = '<span>Уведомления</span><span class="as-profile-notifications-badge" data-as-notify-count data-count="0"></span>';
    profileMenu.appendChild(link);
  }

  function renderNotificationsPanel() {
    if (!/profile\.html/i.test(location.pathname) && !document.body.classList.contains("profile-page")) return;
    if (document.querySelector("#asNotificationsPanel")) return;

    const target = document.querySelector("main .container, .profile-content, main, .account-content") || document.body;
    const panel = document.createElement("section");
    panel.id = "asNotificationsPanel";
    panel.className = "as-notifications-panel";
    panel.innerHTML = `
      <div class="as-notifications-head">
        <h2>Уведомления</h2>
        <button type="button" id="asMarkNotificationsRead">Прочитано</button>
      </div>
      <div class="as-notification-list" id="asNotificationList"></div>
    `;
    target.appendChild(panel);

    const listEl = panel.querySelector("#asNotificationList");
    function paint() {
      const list = allLocalNotifications();
      listEl.innerHTML = list.length ? list.map(item => `
        <article class="as-notification-item">
          <div class="as-notification-title">${escapeHtml(item.title || "Уведомление")}</div>
          <div class="as-notification-text">${escapeHtml(item.text || item.message || "")}</div>
          <div class="as-notification-date">${escapeHtml(formatDate(item.createdAt))}</div>
        </article>
      `).join("") : '<div class="as-empty-notifications">Пока уведомлений нет.</div>';
    }

    panel.querySelector("#asMarkNotificationsRead").addEventListener("click", () => {
      localStorage.setItem(READ_KEY, String(Date.now()));
      updateHeaderCounts();
    });

    paint();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function addAdminNotifications() {
    if (!/admin\.html/i.test(location.pathname)) return;
    if (document.querySelector("#asAdminNotifyCard")) return;

    const container = document.querySelector("main, .admin-content, .content, body");
    const card = document.createElement("section");
    card.id = "asAdminNotifyCard";
    card.className = "as-admin-notify-card";
    card.innerHTML = `
      <h2>Уведомление всем пользователям</h2>
      <p>Сообщение сохранится в базе уведомлений и появится в профиле пользователей. Для настоящих push на экран телефона нужен Firebase Cloud Messaging.</p>
      <div class="as-admin-notify-grid">
        <input id="asNotifyTitle" type="text" placeholder="Заголовок уведомления">
        <textarea id="asNotifyText" placeholder="Текст уведомления"></textarea>
      </div>
      <div class="as-admin-notify-actions">
        <button type="button" id="asSendNotifyAll">Отправить всем</button>
        <span class="as-admin-notify-status" id="asNotifyStatus"></span>
      </div>
    `;
    const dashboard = document.querySelector(".admin-dashboard-grid");
    if (dashboard && dashboard.parentNode) dashboard.parentNode.insertBefore(card, dashboard.nextSibling);
    else container.appendChild(card);

    card.querySelector("#asSendNotifyAll").addEventListener("click", async () => {
      const title = card.querySelector("#asNotifyTitle").value.trim();
      const text = card.querySelector("#asNotifyText").value.trim();
      const status = card.querySelector("#asNotifyStatus");

      if (!title || !text) {
        status.textContent = "Заполни заголовок и текст.";
        return;
      }

      const item = {
        title,
        text,
        audience: "all",
        createdAt: new Date().toISOString(),
        type: "broadcast"
      };

      status.textContent = "Отправляем...";
      const savedRemote = await tryFirestoreAdd(item);
      saveLocalNotification(item);
      updateHeaderCounts();

      status.textContent = savedRemote ? "Отправлено всем пользователям." : "Сохранено локально. Для общей рассылки подключи Firestore/FCM.";
      card.querySelector("#asNotifyTitle").value = "";
      card.querySelector("#asNotifyText").value = "";
    });
  }

  function init() {
    addSlogan();
    decorateHeaderButtons();
    addProfileNotificationsNav();
    renderNotificationsPanel();
    addAdminNotifications();
    updateHeaderCounts();
  }

  window.addEventListener("storage", updateHeaderCounts);
  document.addEventListener("click", () => setTimeout(updateHeaderCounts, 80), true);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  const observer = new MutationObserver(() => {
    clearTimeout(window.__asNotifyHeaderTimer);
    window.__asNotifyHeaderTimer = setTimeout(init, 150);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
