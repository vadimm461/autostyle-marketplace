(function () {
  "use strict";

  const sliderSelectors = [
    ".product-slider-ready",
    ".products-carousel",
    ".product-carousel",
    ".home-products-row",
    ".home-section-products",
    ".home-products",
    ".featured-products",
    ".hot-products",
    ".bestseller-products",
    ".products-slider",
    ".products-row",
    "#hotProducts",
    "#featuredProducts",
    "#bestProducts",
    "#newProducts",
    "#homeProducts"
  ];

  function hasProductCards(el) {
    if (!el || el.dataset.asDragSlider === "1") return false;
    return el.querySelectorAll(".product-card, .product-item, [class*='product-card']").length >= 2;
  }

  function getSlideAmount(slider) {
    const firstCard = slider.querySelector(".product-card, .product-item, [class*='product-card']");
    if (!firstCard) return Math.max(260, Math.floor(slider.clientWidth * 0.8));
    const rect = firstCard.getBoundingClientRect();
    const styles = window.getComputedStyle(slider);
    const gap = parseFloat(styles.columnGap || styles.gap || 18) || 18;
    return Math.max(180, Math.round(rect.width + gap));
  }

  function bindDrag(slider) {
    if (!hasProductCards(slider)) return;

    slider.dataset.asDragSlider = "1";
    slider.classList.add("as-draggable-slider");

    let isDown = false;
    let moved = false;
    let startX = 0;
    let startScrollLeft = 0;

    slider.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      isDown = true;
      moved = false;
      startX = event.clientX;
      startScrollLeft = slider.scrollLeft;
      slider.classList.add("is-dragging");
      slider.setPointerCapture?.(event.pointerId);
    });

    slider.addEventListener("pointermove", (event) => {
      if (!isDown) return;
      const diff = event.clientX - startX;
      if (Math.abs(diff) > 4) moved = true;
      slider.scrollLeft = startScrollLeft - diff;
      event.preventDefault();
    }, { passive: false });

    function endDrag(event) {
      if (!isDown) return;
      isDown = false;
      slider.classList.remove("is-dragging");
      try { slider.releasePointerCapture?.(event.pointerId); } catch (_) {}
      setTimeout(() => { moved = false; }, 80);
    }

    slider.addEventListener("pointerup", endDrag);
    slider.addEventListener("pointercancel", endDrag);
    slider.addEventListener("pointerleave", endDrag);

    slider.addEventListener("click", (event) => {
      if (moved) {
        event.preventDefault();
        event.stopPropagation();
      }
    }, true);
  }

  function bindNearbyArrows(slider) {
    const section = slider.closest("section, .section, .home-section, .products-section, .carousel-section, .container") || slider.parentElement;
    if (!section || section.dataset.asArrowsBound === "1") return;
    section.dataset.asArrowsBound = "1";

    const arrows = section.querySelectorAll(".slider-arrow, .carousel-arrow, .home-slider-arrow, .arrow, [data-slider-arrow]");
    arrows.forEach((arrow) => {
      const text = (arrow.textContent || "").trim();
      const isPrev = arrow.classList.contains("prev") || arrow.classList.contains("left") || arrow.dataset.sliderArrow === "prev" || text === "‹" || text === "←";
      const isNext = arrow.classList.contains("next") || arrow.classList.contains("right") || arrow.dataset.sliderArrow === "next" || text === "›" || text === "→";

      if (!isPrev && !isNext) return;
      arrow.classList.add("as-slider-arrow");
      arrow.addEventListener("click", (event) => {
        event.preventDefault();
        slider.scrollBy({ left: (isPrev ? -1 : 1) * getSlideAmount(slider) * 2, behavior: "smooth" });
      });
    });
  }

  function initSliders() {
    const sliders = new Set();

    sliderSelectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((el) => {
        if (hasProductCards(el)) sliders.add(el);
      });
    });

    document.querySelectorAll("section, .section, .home-section, .products-section, .carousel-section, .home-block").forEach((section) => {
      const cards = section.querySelectorAll(".product-card, .product-item, [class*='product-card']");
      if (cards.length >= 3) {
        const parent = cards[0].parentElement;
        if (parent && Array.from(cards).every((card) => card.parentElement === parent)) {
          sliders.add(parent);
        }
      }
    });

    sliders.forEach((slider) => {
      bindDrag(slider);
      bindNearbyArrows(slider);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSliders);
  } else {
    initSliders();
  }

  const observer = new MutationObserver(() => {
    clearTimeout(window.__asSliderInitTimer);
    window.__asSliderInitTimer = setTimeout(initSliders, 120);
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
