(function () {
  'use strict';

  /*
   * Sync the calculator with the SAME variant selected by the existing
   * product-variant-options.liquid picker.
   *
   * We do not replace the theme picker and we do not make a network request
   * for every click. All variant prices/metafields are already rendered in
   * product-calculator.liquid, so the update is instant and production-safe.
   */

  function getSection(root) {
    return root.closest('[data-section]') || root.parentElement;
  }

  function getVariants(root) {
    var node = root.querySelector('.product-calculator-variants');
    if (!node) return [];

    try {
      return JSON.parse(node.textContent.trim()) || [];
    } catch (error) {
      console.error('Calculator variant data error:', error);
      return [];
    }
  }

  function optionPosition(root, inputName) {
    var name = String(inputName || '').trim().toLowerCase();
    if (!name) return 0;

    var option1 = String(root.dataset.option1Name || '').trim().toLowerCase();
    var option2 = String(root.dataset.option2Name || '').trim().toLowerCase();
    var option3 = String(root.dataset.option3Name || '').trim().toLowerCase();

    if (name === option1) return 1;
    if (name === option2) return 2;
    if (name === option3) return 3;
    return 0;
  }

  function getSelectedOptions(root) {
    var section = getSection(root);
    var selected = {};

    if (!section) return selected;

    section.querySelectorAll('input[type="radio"]:checked').forEach(function (input) {
      var name = String(input.name || '').trim().toLowerCase();
      var value = String(input.value || '').trim();
      var position = optionPosition(root, name);

      if (!value || !position) return;
      selected['option' + position] = value;
    });

    section.querySelectorAll('select').forEach(function (select) {
      var name = String(select.name || '').trim().toLowerCase();
      var value = String(select.value || '').trim();
      var position = optionPosition(root, name);

      if (!value || !position) return;
      selected['option' + position] = value;
    });

    return selected;
  }

  function findVariantFromOptions(root) {
    var selected = getSelectedOptions(root);
    var list = getVariants(root);

    if (!list.length) return null;

    var hasOptions = selected.option1 || selected.option2 || selected.option3;
    if (!hasOptions) return null;

    return list.find(function (variant) {
      return (!selected.option1 || String(variant.option1 || '').trim() === selected.option1) &&
        (!selected.option2 || String(variant.option2 || '').trim() === selected.option2) &&
        (!selected.option3 || String(variant.option3 || '').trim() === selected.option3);
    }) || null;
  }

  function findVariantById(root) {
    var section = getSection(root);
    var list = getVariants(root);
    if (!section || !list.length) return null;

    var idInput = section.querySelector(
      'input.product-variant-id[name="id"], input[name="id"], select[name="id"]'
    );

    if (!idInput || !idInput.value) return null;

    return list.find(function (variant) {
      return String(variant.id) === String(idInput.value);
    }) || null;
  }

  function getActiveVariant(root) {
    /*
     * IMPORTANT: selected picker options win over the hidden ID.
     * The theme picker can update the checked radio first and update the
     * hidden Shopify variant ID a moment later. This was the original bug.
     */
    return findVariantFromOptions(root) || findVariantById(root);
  }

  function syncVariantId(root, variant) {
    var section = getSection(root);
    if (!section || !variant || !variant.id) return;

    section.querySelectorAll('input[name="id"], select[name="id"]').forEach(function (field) {
      if (String(field.value) === String(variant.id)) return;
      field.value = variant.id;
      field.setAttribute('value', variant.id);
      field.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  function recalculate(root, force) {
    var variant = getActiveVariant(root);
    if (!variant) return;

    var variantId = String(variant.id);
    var changed = root.dataset.activeVariantId !== variantId;

    root.dataset.activeVariantId = variantId;

    syncVariantId(root, variant);

    if (!force && !changed) return;

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

    function schedule(force) {
      clearTimeout(timer);
      timer = setTimeout(function () {
        recalculate(root, force === true);
      }, 80);
    }

    section.addEventListener('change', function (event) {
      if (!event.target) return;

      if (
        event.target.matches('input[type="radio"]') ||
        event.target.matches('select')
      ) {
        schedule(true);
      }
    });

    /* Handles the label/button click used by product-variant-options.liquid. */
    section.addEventListener('click', function (event) {
      if (event.target.closest('.product__color-swatches--js')) {
        schedule(true);
      }
    });

    /* Support the theme's asynchronous variant events. */
    ['variant:change', 'variantChange', 'product:variant-change'].forEach(function (eventName) {
      document.addEventListener(eventName, function () {
        schedule(true);
      });
    });

    /* Fallback for theme code that changes checked state asynchronously. */
    var lastSignature = '';
    setInterval(function () {
      var selected = getSelectedOptions(root);
      var signature = [selected.option1 || '', selected.option2 || '', selected.option3 || ''].join('|');

      if (signature && signature !== lastSignature) {
        lastSignature = signature;
        schedule(true);
      }
    }, 250);

    schedule(true);
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
