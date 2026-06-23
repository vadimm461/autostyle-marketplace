(function () {
  "use strict";

  const STYLE_ID = "as-home-drag-slider-style";
  const CARD_SELECTOR = ".product-card, .product-item, .catalog-card, [class*='product-card']";
  const ACTION_SELECTOR = "button, input, select, textarea, label, .fav-btn, .cart, .cart-btn, .catalog-cart-btn, [data-cart], [data-fav]";

  const sliderSelectors = [
    ".products",
    ".products-grid",
    ".carousel-products",
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
    "#newProductsGrid",
    "#recentlyViewedGrid",
    "#bestsellersGrid",
    "#productsGrid",
    "#hotProducts",
    "#featuredProducts",
    "#bestProducts",
    "#newProducts",
    "#homeProducts"
  ];

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      body:not(.mobile-page) .section-block .as-draggable-slider,
      body:not(.mobile-page) .home-block .as-draggable-slider,
      body:not(.mobile-page) .product-section-carousel .as-draggable-slider,
      body:not(.mobile-page) .as-draggable-slider {
        display: flex !important;
        flex-wrap: nowrap !important;
        grid-template-columns: none !important;
        gap: 18px !important;
        overflow-x: auto !important;
        overflow-y: hidden !important;
        scroll-behavior: smooth;
        cursor: grab;
        user-select: none;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none !important;
        -ms-overflow-style: none !important;
        padding-bottom: 8px !important;
        touch-action: pan-y;
      }
      body:not(.mobile-page) .as-draggable-slider::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
      body:not(.mobile-page) .as-draggable-slider.is-dragging { cursor: grabbing !important; scroll-behavior: auto !important; }
      body:not(.mobile-page) .as-draggable-slider.is-dragging, body:not(.mobile-page) .as-draggable-slider.is-dragging * { user-select: none !important; }
      body:not(.mobile-page) .as-draggable-slider > .product-card,
      body:not(.mobile-page) .as-draggable-slider > .product-item,
      body:not(.mobile-page) .as-draggable-slider > .catalog-card,
      body:not(.mobile-page) .as-draggable-slider > [class*='product-card'] {
        flex: 0 0 220px !important;
        width: 220px !important;
        min-width: 220px !important;
        max-width: 220px !important;
      }
      @media (max-width: 900px) {
        body:not(.mobile-page) .as-draggable-slider > .product-card,
        body:not(.mobile-page) .as-draggable-slider > .product-item,
        body:not(.mobile-page) .as-draggable-slider > .catalog-card,
        body:not(.mobile-page) .as-draggable-slider > [class*='product-card'] {
          flex-basis: 190px !important; width: 190px !important; min-width: 190px !important; max-width: 190px !important;
        }
      }
      @media (max-width: 640px) {
        body:not(.mobile-page) .as-draggable-slider { gap: 12px !important; scroll-snap-type: x proximity; }
        body:not(.mobile-page) .as-draggable-slider > .product-card,
        body:not(.mobile-page) .as-draggable-slider > .product-item,
        body:not(.mobile-page) .as-draggable-slider > .catalog-card,
        body:not(.mobile-page) .as-draggable-slider > [class*='product-card'] {
          flex-basis: 168px !important; width: 168px !important; min-width: 168px !important; max-width: 168px !important; scroll-snap-align: start;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function cardsIn(el) {
    return el ? Array.from(el.children).filter((child) => child.matches && child.matches(CARD_SELECTOR)) : [];
  }

  function hasProductCards(el) {
    if (!el || el.dataset.asDragSlider === "1") return false;
    return cardsIn(el).length >= 2 || el.querySelectorAll(CARD_SELECTOR).length >= 2;
  }

  function getSlideAmount(slider) {
    const firstCard = slider.querySelector(CARD_SELECTOR);
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
      if (event.target.closest(ACTION_SELECTOR)) return;
      isDown = true;
      moved = false;
      startX = event.clientX;
      startScrollLeft = slider.scrollLeft;
      slider.setPointerCapture?.(event.pointerId);
    });

    slider.addEventListener("pointermove", (event) => {
      if (!isDown) return;
      const diff = event.clientX - startX;
      if (Math.abs(diff) > 8) {
        moved = true;
        slider.dataset.asWasDragged = "1";
        slider.classList.add("is-dragging");
        slider.scrollLeft = startScrollLeft - diff;
        event.preventDefault();
      }
    }, { passive: false });

    function endDrag(event) {
      if (!isDown) return;
      isDown = false;
      slider.classList.remove("is-dragging");
      try { slider.releasePointerCapture?.(event.pointerId); } catch (_) {}
      setTimeout(() => {
        moved = false;
        delete slider.dataset.asWasDragged;
      }, 160);
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
    const section = slider.closest("section, .section, .home-section, .section-block, .products-section, .carousel-section, .home-block") || slider.parentElement;
    if (!section || section.dataset.asArrowsBound === "1") return;
    section.dataset.asArrowsBound = "1";

    const arrows = section.querySelectorAll(".slider-arrow, .carousel-arrow, .home-slider-arrow, .arrow, [data-slider-arrow]");
    arrows.forEach((arrow) => {
      const text = (arrow.textContent || "").trim();
      const isPrev = arrow.classList.contains("prev") || arrow.classList.contains("left") || arrow.classList.contains("carousel-arrow-left") || arrow.dataset.sliderArrow === "prev" || text === "‹" || text === "←";
      const isNext = arrow.classList.contains("next") || arrow.classList.contains("right") || arrow.classList.contains("carousel-arrow-right") || arrow.dataset.sliderArrow === "next" || text === "›" || text === "→";
      if (!isPrev && !isNext) return;
      arrow.classList.add("as-slider-arrow");
      arrow.addEventListener("click", (event) => {
        event.preventDefault();
        slider.scrollBy({ left: (isPrev ? -1 : 1) * getSlideAmount(slider) * 2, behavior: "smooth" });
      });
    });
  }

  function initSliders() {
    injectStyle();
    const sliders = new Set();

    sliderSelectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((el) => {
        if (hasProductCards(el)) sliders.add(el);
      });
    });

    document.querySelectorAll("section, .section, .home-section, .section-block, .products-section, .carousel-section, .home-block").forEach((section) => {
      const directContainers = section.querySelectorAll(":scope > .products, :scope > .products-grid, :scope .products, :scope .products-grid, :scope .carousel-products");
      directContainers.forEach((container) => { if (hasProductCards(container)) sliders.add(container); });

      const cards = section.querySelectorAll(CARD_SELECTOR);
      if (cards.length >= 3) {
        const parent = cards[0].parentElement;
        if (parent && Array.from(cards).every((card) => card.parentElement === parent)) sliders.add(parent);
      }
    });

    sliders.forEach((slider) => {
      bindDrag(slider);
      bindNearbyArrows(slider);
    });
  }


  function productLinkFromCard(card) {
    if (!card) return null;
    return card.querySelector("a[href*='product.html']");
  }

  document.addEventListener("click", (event) => {
    if (event.defaultPrevented) return;
    if (event.target.closest(ACTION_SELECTOR)) return;
    const slider = event.target.closest(".as-draggable-slider");
    if (slider && slider.dataset.asWasDragged === "1") return;
    const card = event.target.closest(CARD_SELECTOR);
    if (!card) return;
    const link = event.target.closest("a[href*='product.html']") || productLinkFromCard(card);
    if (!link || !link.href) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    window.location.href = link.href;
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSliders);
  } else {
    initSliders();
  }

  window.addEventListener("load", initSliders);

  const observer = new MutationObserver(() => {
    clearTimeout(window.__asSliderInitTimer);
    window.__asSliderInitTimer = setTimeout(initSliders, 100);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
