(function () {
  'use strict';

  const CARD_SELECTOR = '.product-card, .home-product-card, .related-card';
  const ACTION_SELECTOR = 'button, input, select, textarea, label, [data-cart], [data-fav], .fav-btn, .cart, .cart-btn, .catalog-cart-btn';

  const SLIDER_SELECTOR = [
    '.section-block .carousel-products',
    '.product-section-carousel .carousel-products',
    '.carousel-shell > .carousel-products',
    '.related-carousel',
    '.home-products',
    '.home-products-row',
    '.home-section-products',
    '.products-slider',
    '.products-row',
    '#featuredProducts',
    '#newProducts',
    '#bestProducts',
    '#hotProducts',
    '#recentlyViewedGrid',
    '#bestsellersGrid'
  ].join(',');

  function hasCards(el) {
    return !!el && el.querySelectorAll(CARD_SELECTOR).length >= 2;
  }

  function slideAmount(slider) {
    const card = slider.querySelector(CARD_SELECTOR);
    if (!card) return Math.max(240, Math.floor(slider.clientWidth * 0.75));
    const gap = parseFloat(getComputedStyle(slider).gap || getComputedStyle(slider).columnGap || 18) || 18;
    return Math.max(180, Math.round(card.getBoundingClientRect().width + gap));
  }

  function bindSlider(slider) {
    if (!hasCards(slider) || slider.dataset.asDragReady === '1') return;
    slider.dataset.asDragReady = '1';
    slider.classList.add('as-draggable-slider');

    let down = false;
    let dragging = false;
    let startX = 0;
    let startLeft = 0;
    let pointerId = null;

    slider.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      if (e.target.closest(ACTION_SELECTOR)) return;
      down = true;
      dragging = false;
      startX = e.clientX;
      startLeft = slider.scrollLeft;
      pointerId = e.pointerId;
    }, { passive: true });

    slider.addEventListener('pointermove', function (e) {
      if (!down) return;
      const dx = e.clientX - startX;
      if (!dragging && Math.abs(dx) > 7) {
        dragging = true;
        slider.classList.add('is-dragging');
        slider.dataset.asDragging = '1';
        try { slider.setPointerCapture(pointerId); } catch (_) {}
      }
      if (dragging) {
        slider.scrollLeft = startLeft - dx;
        e.preventDefault();
      }
    }, { passive: false });

    function endDrag() {
      if (!down) return;
      down = false;
      if (dragging) {
        setTimeout(function () {
          dragging = false;
          slider.classList.remove('is-dragging');
          delete slider.dataset.asDragging;
        }, 0);
      }
    }

    slider.addEventListener('pointerup', endDrag, { passive: true });
    slider.addEventListener('pointercancel', endDrag, { passive: true });
    slider.addEventListener('pointerleave', endDrag, { passive: true });

    slider.addEventListener('click', function (e) {
      if (slider.dataset.asDragging === '1') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    }, true);
  }

  function bindArrows(section, slider) {
    if (!section || section.dataset.asArrowReady === '1') return;
    section.dataset.asArrowReady = '1';
    section.querySelectorAll('.carousel-arrow, .slider-arrow, .home-slider-arrow, .related-nav, [data-slider-arrow], [data-scroll-left], [data-scroll-right]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        const left = btn.matches('.carousel-arrow-left, .related-prev, .prev, .left, [data-scroll-left]') || btn.dataset.sliderArrow === 'prev';
        const right = btn.matches('.carousel-arrow-right, .related-next, .next, .right, [data-scroll-right]') || btn.dataset.sliderArrow === 'next';
        if (!left && !right) return;
        e.preventDefault();
        e.stopPropagation();
        slider.scrollBy({ left: (left ? -1 : 1) * slideAmount(slider) * 2, behavior: 'smooth' });
      });
    });
  }

  function init() {
    document.querySelectorAll(SLIDER_SELECTOR).forEach(function (slider) {
      if (!hasCards(slider)) return;
      bindSlider(slider);
      bindArrows(slider.closest('.carousel-shell, .section-block, .product-section-carousel, .related-carousel-wrap, section') || slider.parentElement, slider);
    });
  }

  document.addEventListener('click', function (e) {
    if (e.defaultPrevented) return;
    if (e.target.closest(ACTION_SELECTOR)) return;
    const card = e.target.closest(CARD_SELECTOR);
    if (!card) return;
    const slider = card.closest('.as-draggable-slider');
    if (slider && slider.dataset.asDragging === '1') return;
    const link = e.target.closest('a[href*="product.html"]') || card.querySelector('a[href*="product.html"]');
    if (!link || !link.href) return;
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    window.location.href = link.href;
  }, false);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  window.addEventListener('load', init);
  new MutationObserver(function () {
    clearTimeout(window.__asHomeDragInit);
    window.__asHomeDragInit = setTimeout(init, 120);
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
