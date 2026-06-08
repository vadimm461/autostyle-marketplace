(function () {
  "use strict";

  const aliases = {
    home: "dashboard",
    main: "dashboard",
    homeBlocks: "homeblocks",
    homeblocks: "homeblocks",
    promoCards: "promocards",
    promocards: "promocards",
    discountCards: "discountCards",
    discountcards: "discountCards"
  };

  function normalizeHash(hash) {
    const raw = String(hash || "").replace("#", "").trim();
    return aliases[raw] || raw || "dashboard";
  }

  function dashboardEls() {
    return document.querySelectorAll(".admin-dashboard-grid, .admin-home-section");
  }

  function setDashboardVisible(sectionId) {
    const show = !sectionId || sectionId === "dashboard" || sectionId === "home" || sectionId === "main";
    dashboardEls().forEach(el => {
      el.classList.toggle("is-hidden", !show);
      el.style.display = show ? "" : "none";
    });
    document.querySelectorAll(".admin-stats").forEach(el => el.style.display = "none");
  }

  function activateSection(target) {
    const sectionId = normalizeHash(target);
    setDashboardVisible(sectionId);

    if (typeof window.openSection === "function") {
      window.openSection(sectionId);
      return;
    }

    document.querySelectorAll(".admin-section").forEach(section => {
      section.classList.toggle("active", section.id === sectionId);
    });
    document.querySelectorAll(".admin-nav button[data-section]").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.section === sectionId);
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
        const sectionId = normalizeHash(href);
        history.pushState(null, "", "#" + sectionId);
        activateSection(sectionId);
      });
    });
  }

  function bindSidebarButtons() {
    document.querySelectorAll(".admin-nav button[data-section]").forEach(btn => {
      if (btn.dataset.dashboardBound === "1") return;
      btn.dataset.dashboardBound = "1";
      btn.addEventListener("click", () => {
        setDashboardVisible(normalizeHash(btn.dataset.section));
      }, true);
    });
  }

  function init() {
    document.querySelectorAll(".admin-stats").forEach(el => el.remove());
    bindHomeCards();
    bindSidebarButtons();
    activateSection(location.hash || "#dashboard");
  }

  window.addEventListener("hashchange", () => activateSection(location.hash));

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
