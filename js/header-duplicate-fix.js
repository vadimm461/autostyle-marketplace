
(function () {
  "use strict";

  function getHeader() {
    return document.querySelector("header, .header, .site-header, .top-header, .navbar, .main-header");
  }

  function textOf(el) {
    return (el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function classify(el) {
    const t = textOf(el);
    const href = (el.getAttribute("href") || "").toLowerCase();

    if (el.id === "asHeaderNotifyBtn" || t.includes("уведом")) return "notify";
    if (t.includes("аккаунт") || t.includes("профиль") || href.includes("profile")) return "account";
    if (t.includes("избран") || href.includes("favorite")) return "favorites";
    if (t.includes("корзин") || href.includes("cart")) return "cart";
    return "";
  }

  function cleanButton(el, type) {
    el.classList.add("as-nav-icon-btn");

    // Remove old injected icons/counters first.
    el.querySelectorAll(".as-nav-icon").forEach(icon => icon.remove());
    el.querySelectorAll(".as-nav-count").forEach(badge => badge.remove());

    // Clean duplicated visual text from earlier scripts.
    let label = "Аккаунт";
    let icon = "👤";

    if (type === "notify") {
      label = "Уведомления";
      icon = "🔔";
    } else if (type === "favorites") {
      label = "Избранное";
      icon = "♡";
    } else if (type === "cart") {
      const existing = textOf(el).match(/корзина\s*\d+/i);
      label = existing ? el.textContent.replace(/[♡👤🔔🛒▢▫️]/g, "").trim() : "Корзина";
      label = label || "Корзина";
      icon = "🛒";
    }

    if (type !== "cart") {
      el.textContent = label;
    } else {
      // keep "Корзина N" if project updates it
      el.textContent = el.textContent.replace(/[♡👤🔔🛒▢▫️]/g, "").replace(/\s+/g, " ").trim() || "Корзина";
    }

    el.insertAdjacentHTML("afterbegin", '<span class="as-nav-icon">' + icon + '</span>');

    if (type === "notify") {
      el.insertAdjacentHTML("beforeend", '<span class="as-nav-count" data-as-notify-count data-count="0"></span>');
    }
    if (type === "favorites") {
      el.insertAdjacentHTML("beforeend", '<span class="as-nav-count" data-as-fav-count data-count="0"></span>');
    }
    if (type === "cart") {
      el.insertAdjacentHTML("beforeend", '<span class="as-nav-count" data-as-cart-count data-count="0"></span>');
    }
  }

  function ensureActions(header) {
    let actions = header.querySelector(".as-header-actions");
    if (!actions) {
      actions = document.createElement("div");
      actions.className = "as-header-actions";
      header.appendChild(actions);
    }
    return actions;
  }

  function moveAndDeduplicate() {
    const header = getHeader();
    if (!header) return;

    const actions = ensureActions(header);
    const candidates = Array.from(header.querySelectorAll("a, button")).filter(el => {
      if (el.closest("form")) return false;
      return !!classify(el);
    });

    const byType = { account: null, notify: null, favorites: null, cart: null };

    candidates.forEach(el => {
      const type = classify(el);
      if (!type) return;
      if (!byType[type]) {
        byType[type] = el;
      } else {
        el.remove();
      }
    });

    if (!byType.notify) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.id = "asHeaderNotifyBtn";
      btn.textContent = "Уведомления";
      byType.notify = btn;
    }

    ["account", "notify", "favorites", "cart"].forEach(type => {
      const el = byType[type];
      if (!el) return;
      cleanButton(el, type);
      actions.appendChild(el);
      el.style.order = ({ account: 10, notify: 20, favorites: 30, cart: 40 })[type];
    });
  }

  function fixSlogan() {
    const header = getHeader();
    if (!header) return;

    let wrap = header.querySelector(".as-logo-slogan-wrap");
    if (!wrap) {
      const logo = Array.from(header.querySelectorAll(".logo, .site-logo, .header-logo, .brand, .navbar-brand, a")).find(el => {
        const t = textOf(el);
        return (t.includes("auto") && t.includes("style")) || el.querySelector("img");
      });
      if (!logo) return;

      wrap = document.createElement("div");
      wrap.className = "as-logo-slogan-wrap";
      logo.parentNode.insertBefore(wrap, logo);
      wrap.appendChild(logo);
    }

    let slogan = wrap.querySelector(".as-header-slogan");
    if (!slogan) {
      slogan = document.createElement("div");
      slogan.className = "as-header-slogan";
      wrap.appendChild(slogan);
    }
    slogan.textContent = "все для движения вперед";
  }

  function localCount(keys) {
    for (const key of keys) {
      try {
        const value = JSON.parse(localStorage.getItem(key) || "[]");
        if (Array.isArray(value)) return value.reduce((s, i) => s + Number(i.qty || i.quantity || 1), 0);
        if (value && typeof value === "object") return Object.keys(value).length;
      } catch (_) {}
    }
    return 0;
  }

  function updateBadges() {
    const fav = localCount(["favorites", "autostyle_favorites"]);
    const cart = localCount(["cart", "autostyle_cart"]);

    document.querySelectorAll("header [data-as-fav-count], .header [data-as-fav-count], .site-header [data-as-fav-count]").forEach(el => {
      el.dataset.count = String(fav);
      el.textContent = fav ? String(fav) : "";
    });

    document.querySelectorAll("header [data-as-cart-count], .header [data-as-cart-count], .site-header [data-as-cart-count]").forEach(el => {
      el.dataset.count = String(cart);
      el.textContent = cart ? String(cart) : "";
    });

    document.querySelectorAll("header [data-as-notify-count], .header [data-as-notify-count], .site-header [data-as-notify-count]").forEach(el => {
      el.dataset.count = "0";
      el.textContent = "";
    });
  }

  function removeWrongBadges() {
    document.querySelectorAll("footer .as-nav-count, footer .as-nav-icon, .product-card .as-nav-count, .product-card .as-nav-icon, .product-item .as-nav-count, .product-item .as-nav-icon").forEach(el => el.remove());
  }

  function init() {
    fixSlogan();
    moveAndDeduplicate();
    removeWrongBadges();
    updateBadges();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.addEventListener("storage", updateBadges);
  document.addEventListener("click", () => setTimeout(init, 80), true);

  const observer = new MutationObserver(() => {
    clearTimeout(window.__asHeaderDuplicateFix);
    window.__asHeaderDuplicateFix = setTimeout(init, 120);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();

