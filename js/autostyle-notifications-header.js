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
    } catch (_) { return ""; }
  }

  function allLocalNotifications() {
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
    return allLocalNotifications().filter(n => new Date(n.createdAt || Date.now()).getTime() > readAt).length;
  }

  function cartCount() {
    const cart = safeParse(localStorage.getItem("cart"), safeParse(localStorage.getItem("autostyle_cart"), []));
    if (Array.isArray(cart)) return cart.reduce((s, i) => s + Number(i.qty || i.quantity || 1), 0);
    return Object.keys(cart || {}).length;
  }

  function favCount() {
    const fav = safeParse(localStorage.getItem("favorites"), safeParse(localStorage.getItem("autostyle_favorites"), []));
    if (Array.isArray(fav)) return fav.length;
    return Object.keys(fav || {}).length;
  }

  function setBadge(selector, count) {
    document.querySelectorAll(selector).forEach(el => {
      el.dataset.count = String(count);
      el.textContent = count ? String(count) : "";
    });
  }

  function updateHeaderCounts() {
    setBadge("header [data-as-notify-count], .header [data-as-notify-count], .site-header [data-as-notify-count]", unreadCount());
    setBadge("header [data-as-fav-count], .header [data-as-fav-count], .site-header [data-as-fav-count]", favCount());
    setBadge("header [data-as-cart-count], .header [data-as-cart-count], .site-header [data-as-cart-count]", cartCount());
  }

  function headerRoot() {
    return document.querySelector("header, .header, .site-header, .top-header, .navbar") || document.body;
  }

  function addSlogan() {
    const header = headerRoot();
    const logoCandidates = header.querySelectorAll(".logo, .site-logo, .header-logo, .brand, .navbar-brand, a[href='index.html'], a[href='./index.html']");
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

  function cleanDuplicatesAndWrongPlaces() {
    // Remove profile notification block/menu.
    document.querySelectorAll("#asNotificationsPanel, .as-notifications-panel, .as-profile-notifications-link, [data-as-profile-notifications-link]").forEach(el => el.remove());

    // Remove icons/counters outside header.
    document.querySelectorAll("body :not(header):not(header *) .as-nav-count, footer .as-nav-count, .product-card .as-nav-count, .product-item .as-nav-count").forEach(el => el.remove());
    document.querySelectorAll("footer .as-nav-icon, .product-card .as-nav-icon, .product-item .as-nav-icon").forEach(el => el.remove());

    // If account button duplicated by previous script, remove exact repeated account buttons in header.
    const header = headerRoot();
    const accountButtons = Array.from(header.querySelectorAll("a, button")).filter(el => (el.textContent || "").trim().toLowerCase().includes("аккаунт"));
    const seen = new Set();
    accountButtons.forEach((el) => {
      const key = (el.getAttribute("href") || "") + "|" + (el.textContent || "").trim().toLowerCase();
      if (seen.has(key)) el.remove();
      else seen.add(key);
    });

    // Keep only one icon per header button.
    header.querySelectorAll("a, button").forEach(el => {
      const icons = el.querySelectorAll(".as-nav-icon");
      icons.forEach((icon, idx) => { if (idx > 0) icon.remove(); });
      const favBadges = el.querySelectorAll("[data-as-fav-count]");
      favBadges.forEach((b, idx) => { if (idx > 0) b.remove(); });
      const cartBadges = el.querySelectorAll("[data-as-cart-count]");
      cartBadges.forEach((b, idx) => { if (idx > 0) b.remove(); });
      const notifyBadges = el.querySelectorAll("[data-as-notify-count]");
      notifyBadges.forEach((b, idx) => { if (idx > 0) b.remove(); });
    });
  }

  function decorateHeaderButtons() {
    const header = headerRoot();
    const links = Array.from(header.querySelectorAll("a, button"));

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

    addHeaderNotificationsButton();
  }

  function addHeaderNotificationsButton() {
    const header = headerRoot();
    if (header.querySelector("#asHeaderNotifyBtn")) return;

    const favOrCart = Array.from(header.querySelectorAll("a, button")).find(el => {
      const t = (el.textContent || "").toLowerCase();
      return t.includes("избран") || t.includes("корзин");
    });

    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "asHeaderNotifyBtn";
    btn.className = "as-nav-icon-btn";
    btn.innerHTML = '<span class="as-nav-icon">🔔</span><span>Уведомления</span><span class="as-nav-count" data-as-notify-count data-count="0"></span>';

    if (favOrCart && favOrCart.parentNode) favOrCart.parentNode.insertBefore(btn, favOrCart);
    else header.appendChild(btn);

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      toggleNotifyDropdown();
    });
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function toggleNotifyDropdown() {
    let drop = document.querySelector("#asHeaderNotifyDropdown");
    if (!drop) {
      drop = document.createElement("div");
      drop.id = "asHeaderNotifyDropdown";
      drop.className = "as-header-notify-dropdown";
      document.body.appendChild(drop);
    }

    const list = allLocalNotifications();
    drop.innerHTML = `
      <h3 class="as-header-notify-title">Уведомления</h3>
      ${list.length ? list.map(item => `
        <article class="as-notification-item">
          <div class="as-notification-title">${escapeHtml(item.title || "Уведомление")}</div>
          <div class="as-notification-text">${escapeHtml(item.text || item.message || "")}</div>
          <div class="as-notification-date">${escapeHtml(formatDate(item.createdAt))}</div>
        </article>
      `).join("") : '<div class="as-empty-notifications">Пока уведомлений нет.</div>'}
    `;
    drop.classList.toggle("is-open");
    localStorage.setItem(READ_KEY, String(Date.now()));
    updateHeaderCounts();
  }

  document.addEventListener("click", (e) => {
    const drop = document.querySelector("#asHeaderNotifyDropdown");
    if (!drop || !drop.classList.contains("is-open")) return;
    if (e.target.closest("#asHeaderNotifyBtn") || e.target.closest("#asHeaderNotifyDropdown")) return;
    drop.classList.remove("is-open");
  });

  function addAdminNotifications() {
    if (!/admin\.html/i.test(location.pathname)) return;
    if (document.querySelector("#asAdminNotifyCard")) return;

    const container = document.querySelector("main, .admin-content, .content, body");
    const card = document.createElement("section");
    card.id = "asAdminNotifyCard";
    card.className = "as-admin-notify-card";
    card.innerHTML = `
      <h2>Уведомление всем пользователям</h2>
      <p>Сообщение появится в верхнем меню “Уведомления”. Для настоящих push на экран телефона нужно подключить Firebase Cloud Messaging.</p>
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

      const item = { title, text, audience: "all", createdAt: new Date().toISOString(), type: "broadcast" };

      status.textContent = "Отправляем...";
      const savedRemote = await tryFirestoreAdd(item);
      saveLocalNotification(item);
      updateHeaderCounts();

      status.textContent = savedRemote ? "Отправлено." : "Сохранено локально. Для общей рассылки подключи Firestore/FCM.";
      card.querySelector("#asNotifyTitle").value = "";
      card.querySelector("#asNotifyText").value = "";
    });
  }

  function init() {
    cleanDuplicatesAndWrongPlaces();
    addSlogan();
    decorateHeaderButtons();
    addAdminNotifications();
    updateHeaderCounts();
  }

  window.addEventListener("storage", updateHeaderCounts);
  document.addEventListener("click", () => setTimeout(() => { cleanDuplicatesAndWrongPlaces(); updateHeaderCounts(); }, 80), true);

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  const observer = new MutationObserver(() => {
    clearTimeout(window.__asNotifyHeaderTimer);
    window.__asNotifyHeaderTimer = setTimeout(init, 150);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
