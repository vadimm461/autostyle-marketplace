(function () {
  "use strict";

  function headerRoot() {
    return document.querySelector("header, .header, .site-header, .top-header, .navbar, .main-header");
  }

  function normalizeHeader() {
    const header = headerRoot();
    if (!header) return;

    // Make a single action group so buttons keep one order on all pages.
    let actions = header.querySelector(".as-header-actions");
    if (!actions) {
      actions = document.createElement("div");
      actions.className = "as-header-actions";
      const buttons = Array.from(header.querySelectorAll("a, button")).filter(el => {
        const t = (el.textContent || "").toLowerCase();
        return t.includes("аккаунт") || t.includes("профиль") || t.includes("избран") || t.includes("корзин") || el.id === "asHeaderNotifyBtn";
      });

      if (buttons.length) {
        const parent = buttons[0].parentNode;
        parent.insertBefore(actions, buttons[0]);
        buttons.forEach(btn => actions.appendChild(btn));
      } else {
        header.appendChild(actions);
      }
    }

    // Remove duplicate account buttons.
    const accountButtons = Array.from(header.querySelectorAll("a, button")).filter(el => {
      const t = (el.textContent || "").trim().toLowerCase();
      return t.includes("аккаунт") || t.includes("профиль");
    });

    accountButtons.forEach((el, idx) => {
      if (idx > 0) el.remove();
    });

    // Ensure notification button exists && is visible in top actions.
    let notifyBtn = header.querySelector("#asHeaderNotifyBtn");
    if (!notifyBtn) {
      notifyBtn = document.createElement("button");
      notifyBtn.type = "button";
      notifyBtn.id = "asHeaderNotifyBtn";
      notifyBtn.className = "as-nav-icon-btn";
      notifyBtn.innerHTML = '<span class="as-nav-icon">🔔</span><span>Уведомления</span><span class="as-nav-count" data-as-notify-count data-count="0"></span>';
      const fav = Array.from(actions.querySelectorAll("a, button")).find(el => (el.textContent || "").toLowerCase().includes("избран"));
      if (fav) actions.insertBefore(notifyBtn, fav);
      else actions.appendChild(notifyBtn);
    } else if (notifyBtn.parentNode !== actions) {
      const fav = Array.from(actions.querySelectorAll("a, button")).find(el => (el.textContent || "").toLowerCase().includes("избран"));
      if (fav) actions.insertBefore(notifyBtn, fav);
      else actions.appendChild(notifyBtn);
    }

    // Order: account, notifications, favorites, cart.
    const orderMap = [
      ["аккаунт", 10],
      ["профиль", 10],
      ["уведом", 20],
      ["избран", 30],
      ["корзин", 40]
    ];

    Array.from(actions.querySelectorAll("a, button")).forEach(el => {
      const t = (el.textContent || "").toLowerCase();
      let order = 99;
      for (const [key, val] of orderMap) {
        if (t.includes(key) || (key === "уведом" && el.id === "asHeaderNotifyBtn")) {
          order = val;
          break;
        }
      }
      el.style.order = String(order);
      el.classList.add("as-nav-icon-btn");
    });

    // Fix slogan position if old script added it.
    const slogan = header.querySelector(".as-header-slogan");
    if (slogan) {
      slogan.textContent = "все для движения вперед";
    }
  }

  function fixSyntaxIssue() {
    // no-op, only to keep old browsers calm
  }

  function init() {
    normalizeHeader();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  const observer = new MutationObserver(() => {
    clearTimeout(window.__asUnifiedHeaderTimer);
    window.__asUnifiedHeaderTimer = setTimeout(init, 100);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
