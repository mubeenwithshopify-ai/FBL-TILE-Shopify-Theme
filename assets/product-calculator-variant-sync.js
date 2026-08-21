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

    if (!section) return selected;

    /*
     * The theme's size/finish controls are radio inputs. The visual active
     * label can change before the hidden Shopify variant ID is updated, so
     * use the actual checked option values as the source of truth.
     */
    Array.prototype.forEach.call(
      section.querySelectorAll(
        '.product-form__input input[type="radio"]:checked'
      ),
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

    var hasOptionSelection =
      selected.option1 || selected.option2 || selected.option3;

    if (!hasOptionSelection) return null;

    return variants.find(function (variant) {
      if (
        selected.option1 &&
        String(variant.option1 || '') !== String(selected.option1)
      ) {
        return false;
      }

      if (
        selected.option2 &&
        String(variant.option2 || '') !== String(selected.option2)
      ) {
        return false;
      }

      if (
        selected.option3 &&
        String(variant.option3 || '') !== String(selected.option3)
      ) {
        return false;
      }

      return true;
    }) || null;
  }

  function setVariantId(section, variant) {
    if (!section || !variant || !variant.id) return false;

    var inputs = section.querySelectorAll(
      'input[name="id"], select[name="id"]'
    );

    var changed = false;

    Array.prototype.forEach.call(inputs, function (input) {
      if (String(input.value) === String(variant.id)) return;

      input.value = variant.id;
      input.setAttribute('value', variant.id);
      changed = true;
    });

    return changed;
  }

  function refreshCalculator(root) {
    var section = getSection(root);
    if (!section) return;

    var variant = findVariant(root, section);
    if (!variant) return;

    var changed = setVariantId(section, variant);

    /*
     * product-calculators.js reads the Shopify variant ID. Once we have
     * synchronized that ID, trigger its existing calculation logic instead
     * of duplicating the calculator calculations here.
     */
    if (changed) {
      var input = root.querySelector('[data-calculator-input="sf"]');
      var pieces = root.querySelector('[data-calculator-input="pieces"]');
      var trigger = pieces && pieces.value !== '' ? pieces : input;

      if (trigger) {
        trigger.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  }

  function init(root) {
    if (root.dataset.variantSyncInitialized === 'true') return;
    root.dataset.variantSyncInitialized = 'true';

    var section = getSection(root);
    if (!section) return;

    var refreshTimer = null;

    function scheduleRefresh() {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(function () {
        refreshCalculator(root);
      }, 0);
    }

    /* Normal variant-picker changes. */
    section.addEventListener('change', function (event) {
      if (
        event.target &&
        event.target.matches('.product-form__input input[type="radio"]')
      ) {
        scheduleRefresh();
      }
    });

    /* Support dropdown variant controls as well. */
    section.addEventListener('click', function (event) {
      var target = event.target.closest(
        '.product__color-swatches--js, swatch-dropdown-item label'
      );

      if (target) scheduleRefresh();
    });

    /* Some theme variant components update the hidden ID asynchronously. */
    document.addEventListener('variant:change', scheduleRefresh);
    document.addEventListener('variantChange', scheduleRefresh);
    document.addEventListener('product:variant-change', scheduleRefresh);

    /* Catch asynchronous checked-state changes made by the theme. */
    var observer = new MutationObserver(function () {
      scheduleRefresh();
    });

    observer.observe(section, {
      subtree: true,
      attributes: true,
      attributeFilter: ['checked', 'class']
    });

    /* Initial synchronization. */
    scheduleRefresh();
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
