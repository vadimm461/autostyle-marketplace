(function () {
  "use strict";

  const sectionIds = [
    "products",
    "categories",
    "banners",
    "homeBlocks",
    "promoCards",
    "orders",
    "discountCards",
    "media",
    "pages",
    "settings"
  ];

  function normalizeHash(hash) {
    return String(hash || "").replace("#", "").trim();
  }

  function findDashboard() {
    return document.querySelector(".admin-dashboard-grid");
  }

  function hideDashboard() {
    const grid = findDashboard();
    if (grid) grid.classList.add("is-hidden");
    document.querySelectorAll(".admin-stats").forEach(el => el.style.display = "none");
  }

  function showDashboard() {
    const grid = findDashboard();
    if (grid) grid.classList.remove("is-hidden");
    document.querySelectorAll(".admin-stats").forEach(el => el.style.display = "none");
  }

  function activateSection(target) {
    const hash = normalizeHash(target);

    if (!hash || hash === "home" || hash === "main") {
      showDashboard();
      return;
    }

    hideDashboard();

    // Try existing admin navigation handlers first.
    const leftLink =
      document.querySelector(`.admin-sidebar a[href="#${hash}"], .sidebar a[href="#${hash}"], nav a[href="#${hash}"], a[href="#${hash}"]`);

    if (leftLink && !leftLink.classList.contains("admin-home-card")) {
      leftLink.click();
      return;
    }

    // Fallback: show matching section if project uses sections.
    document.querySelectorAll("[data-section], .admin-section, section[id]").forEach(section => {
      const id = section.id || section.dataset.section;
      if (!id) return;
      section.style.display = id === hash ? "" : "none";
      section.classList.toggle("active", id === hash);
    });
  }

  function bindHomeCards() {
    document.querySelectorAll(".admin-home-card").forEach(card => {
      if (card.dataset.bound === "1") return;
      card.dataset.bound = "1";
      card.addEventListener("click", event => {
        const href = card.getAttribute("href") || "";
        if (!href.startsWith("#")) return;

        event.preventDefault();
        const hash = normalizeHash(href);
        if (hash) {
          history.pushState(null, "", "#" + hash);
          activateSection(hash);
        }
      });
    });
  }

  function bindSidebar() {
    document.querySelectorAll('.admin-sidebar a[href^="#"], .sidebar a[href^="#"], nav a[href^="#"]').forEach(link => {
      if (link.dataset.dashboardBound === "1") return;
      link.dataset.dashboardBound = "1";
      link.addEventListener("click", () => {
        const hash = normalizeHash(link.getAttribute("href"));
        if (hash && hash !== "home" && hash !== "main") hideDashboard();
        if (!hash || hash === "home" || hash === "main") showDashboard();
      }, true);
    });
  }

  function init() {
    document.querySelectorAll(".admin-stats").forEach(el => el.remove());
    bindHomeCards();
    bindSidebar();

    const hash = normalizeHash(location.hash);
    if (hash && hash !== "home" && hash !== "main") hideDashboard();
    else showDashboard();
  }

  window.addEventListener("hashchange", () => activateSection(location.hash));

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  const observer = new MutationObserver(() => {
    clearTimeout(window.__asAdminHomeTimer);
    window.__asAdminHomeTimer = setTimeout(init, 120);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
