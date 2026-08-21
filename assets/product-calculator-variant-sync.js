(function () {
  'use strict';

  function getVariantInput(root) {
    var section = root.closest('[data-section]') || root.parentElement;
    if (!section) return null;
    return section.querySelector('input[name="id"], select[name="id"]');
  }

  function refreshCalculator(root) {
    var inputs = root.querySelectorAll('[data-calculator-input]');
    var trigger = null;

    /* Preserve the customer's current input when the variant changes. */
    Array.prototype.forEach.call(inputs, function (input) {
      if (!trigger && input.value !== '') trigger = input;
    });

    if (!trigger) {
      trigger = root.querySelector('[data-calculator-input="sf"]') ||
        root.querySelector('[data-calculator-input="pieces"]');
    }

    if (trigger) {
      trigger.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function init(root) {
    if (root.dataset.variantSyncInitialized === 'true') return;
    root.dataset.variantSyncInitialized = 'true';

    var variantInput = getVariantInput(root);
    if (!variantInput) return;

    var lastVariantId = variantInput.value;

    function checkVariant() {
      var currentId = variantInput.value;

      if (currentId && currentId !== lastVariantId) {
        lastVariantId = currentId;
        refreshCalculator(root);
      }
    }

    /* Shopify/theme variant pickers may update the ID property without
       firing a DOM mutation, so check the value periodically as a fallback. */
    window.setInterval(checkVariant, 100);

    variantInput.addEventListener('change', checkVariant);
    variantInput.addEventListener('input', checkVariant);

    /* Support themes/components that announce variant changes globally. */
    ['variant:change', 'variantChange', 'product:variant-change'].forEach(function (eventName) {
      document.addEventListener(eventName, function () {
        window.setTimeout(checkVariant, 0);
      });
    });

    /* Also catch clicks/changes on variant picker controls. */
    var section = root.closest('[data-section]') || root.parentElement;
    if (section) {
      section.addEventListener('change', function () {
        window.setTimeout(checkVariant, 0);
      });
    }

    /* Initial calculation uses the currently selected variant. */
    window.setTimeout(checkVariant, 0);
  }

  function boot() {
    document.querySelectorAll('[data-product-calculator]').forEach(init);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  document.addEventListener('shopify:section:load', function (event) {
    if (!event.target) return;
    event.target.querySelectorAll('[data-product-calculator]').forEach(init);
  });
})();
