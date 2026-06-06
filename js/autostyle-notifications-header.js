
(function () {
  "use strict";

  const NOTIFY_KEY = "autostyle_notifications";
  const READ_KEY = "autostyle_notifications_read_at";

  function safeParse(raw, fallback) {
    try { return JSON.parse(raw) || fallback; } catch (_) { return fallback; }
  }

  function getHeader() {
    return document.querySelector("header") ||
      document.querySelector(".header") ||
      document.querySelector(".site-header") ||
      document.querySelector(".main-header") ||
      document.querySelector(".navbar") ||
      document.querySelector("nav");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getLocalNotifications() {
    return safeParse(localStorage.getItem(NOTIFY_KEY), []);
  }

  function saveLocalNotification(item) {
    const list = getLocalNotifications();
    list.unshift(item);
    localStorage.setItem(NOTIFY_KEY, JSON.stringify(list.slice(0, 80)));
  }

  function allNotifications() {
    const list = getLocalNotifications();
    return list.length ? list : [{
      id: "welcome",
      title: "AutoStyle",
      text: "Здесь будут уведомления магазина: акции, статусы заказов и новости.",
      createdAt: new Date().toISOString()
    }];
  }

  function unreadCount() {
    const readAt = Number(localStorage.getItem(READ_KEY) || 0);
    return allNotifications().filter(n => new Date(n.createdAt || Date.now()).getTime() > readAt).length;
  }

  function getCartCount() {
    const candidates = ["cart", "autostyle_cart", "as_cart"];
    for (const key of candidates) {
      const value = safeParse(localStorage.getItem(key), null);
      if (!value) continue;
      if (Array.isArray(value)) return value.reduce((s, i) => s + Number(i.qty || i.quantity || 1), 0);
      if (typeof value === "object") return Object.values(value).reduce((s, i) => s + Number(i?.qty || i?.quantity || 1), 0);
    }
    return 0;
  }

  function getFavCount() {
    const candidates = ["favorites", "autostyle_favorites", "as_favorites"];
    for (const key of candidates) {
      const value = safeParse(localStorage.getItem(key), null);
      if (!value) continue;
      if (Array.isArray(value)) return value.length;
      if (typeof value === "object") return Object.keys(value).length;
    }
    return 0;
  }

  function addSlogan() {
    const header = getHeader();
    if (!header) return;

    const logos = header.querySelectorAll(".logo, .site-logo, .header-logo, .brand, .navbar-brand, a[href='index.html'], a[href='./index.html']");
    for (const logo of logos) {
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

  function normalizeHeaderButtons() {
    const header = getHeader();
    if (!header) return;

    // remove old duplicate dynamic account buttons in header
    const accountItems = Array.from(header.querySelectorAll("a, button"))
      .filter(el => (el.textContent || "").trim().toLowerCase().includes("аккаунт"));
    accountItems.forEach((el, index) => {
      if (index > 0) el.remove();
    });

    // remove duplicated icons from previous builds
    header.querySelectorAll(".as-nav-icon").forEach((icon) => {
      const parent = icon.parentElement;
      if (!parent) return;
      const icons = parent.querySelectorAll(".as-nav-icon");
      icons.forEach((i, idx) => { if (idx > 0) i.remove(); });
    });

    const items = Array.from(header.querySelectorAll("a, button"));
    let accountEl = null;
    let favEl = null;
    let cartEl = null;

    items.forEach(el => {
      const txt = (el.textContent || "").trim().toLowerCase();
      if (!accountEl && (txt.includes("аккаунт") || txt.includes("профиль"))) accountEl = el;
      if (!favEl && txt.includes("избран")) favEl = el;
      if (!cartEl && txt.includes("корзин")) cartEl = el;
    });

    decorate(accountEl, "👤", null);
    decorate(favEl, "♡", "fav");
    decorate(cartEl, "🛒", "cart");

    addNotificationButton(header, accountEl, favEl);
  }

  function decorate(el, icon, type) {
    if (!el) return;
    el.classList.add("as-nav-icon-btn");

    // remove extra duplicate textual icons if old build inserted them
    const existingIcons = el.querySelectorAll(".as-nav-icon");
    existingIcons.forEach((i, idx) => { if (idx > 0) i.remove(); });
    if (!existingIcons.length) {
      el.insertAdjacentHTML("afterbegin", `<span class="as-nav-icon">${icon}</span>`);
    } else {
      existingIcons[0].textContent = icon;
    }

    if (type === "fav" && !el.querySelector("[data-as-fav-count]")) {
      el.insertAdjacentHTML("beforeend", '<span class="as-nav-count" data-as-fav-count data-count="0"></span>');
    }
    if (type === "cart" && !el.querySelector("[data-as-cart-count]")) {
      el.insertAdjacentHTML("beforeend", '<span class="as-nav-count" data-as-cart-count data-count="0"></span>');
    }
  }

  function addNotificationButton(header, accountEl, favEl) {
    if (header.querySelector("[data-as-header-notifications]")) return;

    const btn = document.createElement("a");
    btn.href = "#notifications";
    btn.className = "as-nav-icon-btn as-header-notify-btn";
    btn.dataset.asHeaderNotifications = "1";
    btn.innerHTML = '<span class="as-nav-icon">🔔</span><span>Уведомления</span><span class="as-nav-count" data-as-notify-count data-count="0"></span>';

    if (accountEl && accountEl.parentNode) {
      accountEl.parentNode.insertBefore(btn, accountEl.nextSibling);
    } else if (favEl && favEl.parentNode) {
      favEl.parentNode.insertBefore(btn, favEl);
    } else {
      header.appendChild(btn);
    }

    btn.addEventListener("click", (event) => {
      event.preventDefault();
      toggleNotifications();
    });
  }

  function updateCounts() {
    const favCount = getFavCount();
    const cartCount = getCartCount();
    const notifyCount = unreadCount();

    document.querySelectorAll("header [data-as-fav-count], .header [data-as-fav-count], .site-header [data-as-fav-count]").forEach(el => {
      el.dataset.count = String(favCount);
      el.textContent = favCount ? String(favCount) : "";
    });

    document.querySelectorAll("header [data-as-cart-count], .header [data-as-cart-count], .site-header [data-as-cart-count]").forEach(el => {
      el.dataset.count = String(cartCount);
      el.textContent = cartCount ? String(cartCount) : "";
    });

    document.querySelectorAll("header [data-as-notify-count], .header [data-as-notify-count], .site-header [data-as-notify-count]").forEach(el => {
      el.dataset.count = String(notifyCount);
      el.textContent = notifyCount ? String(notifyCount) : "";
    });
  }

  function ensureNotificationDropdown() {
    let dropdown = document.querySelector("#asHeaderNotifyDropdown");
    if (dropdown) return dropdown;

    dropdown = document.createElement("div");
    dropdown.id = "asHeaderNotifyDropdown";
    dropdown.className = "as-header-notify-dropdown";
    dropdown.innerHTML = `
      <div class="as-header-notify-title">Уведомления</div>
      <div class="as-header-notify-list" id="asHeaderNotifyList"></div>
    `;
    document.body.appendChild(dropdown);
    return dropdown;
  }

  function renderDropdown(dropdown) {
    const list = dropdown.querySelector("#asHeaderNotifyList");
    const data = allNotifications();
    list.innerHTML = data.length ? data.map(item => `
      <article class="as-header-notify-item">
        <strong>${escapeHtml(item.title || "Уведомление")}</strong>
        <span>${escapeHtml(item.text || item.message || "")}</span>
      </article>
    `).join("") : '<div class="as-header-notify-empty">Пока уведомлений нет.</div>';
  }

  function toggleNotifications() {
    const dropdown = ensureNotificationDropdown();
    renderDropdown(dropdown);
    dropdown.classList.toggle("is-open");
    localStorage.setItem(READ_KEY, String(Date.now()));
    updateCounts();
  }

  function removeProfileNotifications() {
    document.querySelectorAll("#asNotificationsPanel, .as-notifications-panel, .as-profile-notifications-link, [data-as-profile-notifications-link]").forEach(el => el.remove());

    // remove sidebar/profile notification links added by old build
    document.querySelectorAll("aside a, .profile-menu a, .profile-sidebar a, .account-menu a, .profile-nav a").forEach(a => {
      if ((a.textContent || "").trim().toLowerCase().includes("уведомлен")) a.remove();
    });
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

  function addAdminNotifications() {
    if (!/admin\.html/i.test(location.pathname)) return;
    if (document.querySelector("#asAdminNotifyCard")) return;

    const container = document.querySelector("main, .admin-content, .content, body");
    const card = document.createElement("section");
    card.id = "asAdminNotifyCard";
    card.className = "as-admin-notify-card";
    card.innerHTML = `
      <h2>Уведомление всем пользователям</h2>
      <p>Сообщение сохранится в уведомлениях сайта. Для настоящего push на экран телефона нужен Firebase Cloud Messaging.</p>
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
      updateCounts();

      status.textContent = savedRemote ? "Отправлено." : "Сохранено локально. Для общей рассылки подключи Firestore/FCM.";
      card.querySelector("#asNotifyTitle").value = "";
      card.querySelector("#asNotifyText").value = "";
    });
  }

  function cleanupBadPlaces() {
    // Old script placed badges inside footer and product buttons. Remove them from everywhere except header.
    document.querySelectorAll("body .as-nav-count").forEach(el => {
      if (!el.closest("header") && !el.closest(".header") && !el.closest(".site-header")) el.remove();
    });

    document.querySelectorAll("footer .as-nav-icon, .product-card .as-nav-icon, .product-item .as-nav-icon, [class*='product-card'] .as-nav-icon").forEach(el => el.remove());
  }

  function init() {
    cleanupBadPlaces();
    removeProfileNotifications();
    addSlogan();
    normalizeHeaderButtons();
    addAdminNotifications();
    updateCounts();
  }

  window.addEventListener("storage", updateCounts);
  document.addEventListener("click", () => setTimeout(updateCounts, 80), true);
  document.addEventListener("click", (event) => {
    const dropdown = document.querySelector("#asHeaderNotifyDropdown");
    if (!dropdown || !dropdown.classList.contains("is-open")) return;
    if (event.target.closest("[data-as-header-notifications]") || event.target.closest("#asHeaderNotifyDropdown")) return;
    dropdown.classList.remove("is-open");
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  const observer = new MutationObserver(() => {
    clearTimeout(window.__asHeaderFixTimer);
    window.__asHeaderFixTimer = setTimeout(init, 120);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
