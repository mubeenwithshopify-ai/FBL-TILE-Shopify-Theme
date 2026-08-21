(function () {
  'use strict';

  function getSection(root) {
    return root.closest('[data-section]') || root.parentElement;
  }

  function getCalculatorVariants(root) {
    var el = root.querySelector('.product-calculator-variants');
    if (!el) return [];

    try {
      return JSON.parse(el.textContent.trim()) || [];
    } catch (error) {
      console.error('Calculator variant data error:', error);
      return [];
    }
  }

  function getSelectedOptions(section) {
    var selected = {};

    Array.prototype.forEach.call(
      section.querySelectorAll('.product-form__input input[type="radio"]:checked'),
      function (input) {
        var name = (input.name || '').toLowerCase();
        var value = input.value;

        if (!value) return;

        if (name === 'size') selected.option1 = value;
        if (name === 'finish') selected.option2 = value;
        if (name === 'color') selected.option1 = value;
      }
    );

    return selected;
  }

  function findVariant(root, section) {
    var variants = getCalculatorVariants(root);
    var selected = getSelectedOptions(section);

    if (!variants.length) return null;

    var hasSelection = selected.option1 || selected.option2 || selected.option3;

    if (!hasSelection) return null;

    return variants.find(function (variant) {
      if (selected.option1 && String(variant.option1 || '') !== String(selected.option1)) return false;
      if (selected.option2 && String(variant.option2 || '') !== String(selected.option2)) return false;
      if (selected.option3 && String(variant.option3 || '') !== String(selected.option3)) return false;
      return true;
    }) || null;
  }

  function syncVariantId(section, variant) {
    if (!variant || !variant.id) return false;

    var changed = false;

    Array.prototype.forEach.call(
      section.querySelectorAll('input[name="id"], select[name="id"]'),
      function (input) {
        if (String(input.value) === String(variant.id)) return;
        input.value = variant.id;
        input.setAttribute('value', variant.id);
        changed = true;
      }
    );

    return changed;
  }

  function updateCalculator(root) {
    var section = getSection(root);
    if (!section) return;

    var variant = findVariant(root, section);
    if (!variant) return;

    var changed = syncVariantId(section, variant);

    if (!changed) return;

    /* Re-run the existing calculator using the newly selected variant. */
    var piecesInput = root.querySelector('[data-calculator-input="pieces"]');
    var sfInput = root.querySelector('[data-calculator-input="sf"]');
    var trigger = piecesInput && piecesInput.value !== '' ? piecesInput : sfInput;

    if (trigger) {
      trigger.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function init(root) {
    if (root.dataset.variantSyncInitialized === 'true') return;
    root.dataset.variantSyncInitialized = 'true';

    var section = getSection(root);
    if (!section) return;

    var timer;

    function scheduleUpdate() {
      window.clearTimeout(timer);
      timer = window.setTimeout(function () {
        updateCalculator(root);
      }, 25);
    }

    /* Theme variant picker: radios and dropdowns. */
    section.addEventListener('change', function (event) {
      if (!event.target) return;

      if (
        event.target.matches('.product-form__input input[type="radio"]') ||
        event.target.matches('select[name="id"]')
      ) {
        scheduleUpdate();
      }
    });

    section.addEventListener('click', function (event) {
      var option = event.target.closest(
        '.product__color-swatches--js, swatch-dropdown-item label'
      );

      if (option) scheduleUpdate();
    });

    /* Support the theme's custom variant events. */
    document.addEventListener('variant:change', scheduleUpdate);
    document.addEventListener('variantChange', scheduleUpdate);
    document.addEventListener('product:variant-change', scheduleUpdate);

    /*
     * The theme can update the hidden variant ID asynchronously. This small
     * check is deliberately limited to the calculator and only compares the
     * selected variant, so it does not interfere with the rest of the page.
     */
    var lastSignature = '';

    window.setInterval(function () {
      var selected = getSelectedOptions(section);
      var signature = [
        selected.option1 || '',
        selected.option2 || '',
        selected.option3 || ''
      ].join('|');

      if (signature && signature !== lastSignature) {
        lastSignature = signature;
        updateCalculator(root);
      }
    }, 250);

    scheduleUpdate();
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
