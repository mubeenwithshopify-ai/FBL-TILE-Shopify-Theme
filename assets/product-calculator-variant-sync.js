(function () {
  'use strict';

  /* Keeps the calculator locked to the active Shopify variant. */

  function getSection(root) {
    return root.closest('[data-section]') || root.parentElement;
  }

  function getVariants(root) {
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
    var values = [];

    if (!section) return values;

    Array.prototype.forEach.call(
      section.querySelectorAll('input[type="radio"]:checked'),
      function (input) {
        var name = String(input.name || '').toLowerCase();
        var value = String(input.value || '').trim();

        if (!value || name === 'id' || name === 'quantity' || name.indexOf('calculator') !== -1) return;
        values.push(value);
      }
    );

    Array.prototype.forEach.call(
      section.querySelectorAll('select:not([name="id"])'),
      function (select) {
        var name = String(select.name || '').toLowerCase();
        var value = String(select.value || '').trim();

        if (!value || name === 'quantity' || name.indexOf('calculator') !== -1) return;
        values.push(value);
      }
    );

    return values;
  }

  function variantMatches(variant, selectedValues) {
    if (!selectedValues.length) return false;

    var optionValues = [variant.option1, variant.option2, variant.option3]
      .filter(function (value) { return value !== null && value !== undefined && value !== ''; })
      .map(function (value) { return String(value).trim(); });

    return selectedValues.every(function (selected) {
      return optionValues.indexOf(selected) !== -1;
    });
  }

  function getActiveVariant(root) {
    var section = getSection(root);
    var list = getVariants(root);

    if (!section || !list.length) return null;

    /* First use Shopify's actual active variant ID. */
    var idInput = section.querySelector(
      'input.product-variant-id[name="id"], select[name="id"], input[name="id"]'
    );

    if (idInput && idInput.value) {
      var byId = list.find(function (variant) {
        return String(variant.id) === String(idInput.value);
      });

      if (byId) return byId;
    }

    /* Fallback for a picker that has changed visually but not its ID yet. */
    var selectedValues = getSelectedOptions(section);

    return list.find(function (variant) {
      return variantMatches(variant, selectedValues);
    }) || null;
  }

  function syncVariantId(section, variant) {
    if (!section || !variant || !variant.id) return false;

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

  function updateCalculator(root, force) {
    var section = getSection(root);
    if (!section) return;

    var variant = getActiveVariant(root);
    if (!variant) return;

    var changed = syncVariantId(section, variant);
    var previousId = root.dataset.activeVariantId;
    var variantChanged = previousId !== String(variant.id);

    root.dataset.activeVariantId = String(variant.id);

    if (!force && !changed && !variantChanged) return;

    /* product-calculators.js now reads the newly active variant's native
       Shopify price plus its variant calculator metafields. */
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

    var timer = null;

    function schedule(force) {
      window.clearTimeout(timer);
      timer = window.setTimeout(function () {
        updateCalculator(root, force === true);
      }, 50);
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

    section.addEventListener('click', function () {
      schedule(true);
    });

    document.addEventListener('variant:change', function () { schedule(true); });
    document.addEventListener('variantChange', function () { schedule(true); });
    document.addEventListener('product:variant-change', function () { schedule(true); });

    /* Catch asynchronous changes made by the theme picker. */
    var lastSignature = '';

    window.setInterval(function () {
      var selected = getSelectedOptions(section);
      var signature = selected.join('|');

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
