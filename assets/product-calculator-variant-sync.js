(function () {
  'use strict';

  /*
   * Shopify variant picker <-> calculator bridge.
   *
   * The theme has two independent pieces:
   *   - product-variant-options.liquid renders the Size/Finish radios.
   *   - product-calculator.liquid contains the calculator variant data,
   *     including native Shopify price + variant metafields.
   *
   * The selected Shopify variant ID is the single source of truth.
   */

  function getArea(element) {
    if (!element) return null;
    return element.closest('.product__item-js') || element.closest('[data-section]');
  }

  function getPicker(element) {
    var area = getArea(element);
    if (!area) return null;

    return area.querySelector('variant-radios-single') ||
      area.querySelector('variant-radios-detail') ||
      area.querySelector('variant-group-detail');
  }

  function getCalculatorRoots(area) {
    return area ? Array.prototype.slice.call(area.querySelectorAll('[data-product-calculator]')) : [];
  }

  function getCalculatorVariants(root) {
    var json = root && root.querySelector('.product-calculator-variants');
    if (!json) return [];

    try {
      return JSON.parse(json.textContent.trim()) || [];
    } catch (error) {
      console.error('[Calculator Variant Sync] Invalid calculator variant JSON:', error);
      return [];
    }
  }

  function variantById(root, id) {
    return getCalculatorVariants(root).find(function (variant) {
      return String(variant.id) === String(id);
    }) || null;
  }

  function optionPosition(root, inputName) {
    var name = String(inputName || '').trim().toLowerCase();
    var names = [
      String(root.dataset.option1Name || '').trim().toLowerCase(),
      String(root.dataset.option2Name || '').trim().toLowerCase(),
      String(root.dataset.option3Name || '').trim().toLowerCase()
    ];

    for (var i = 0; i < names.length; i++) {
      if (name && name === names[i]) return i + 1;
    }

    return 0;
  }

  function getSelectedOptions(picker, root) {
    var selected = {};
    if (!picker) return selected;

    Array.prototype.forEach.call(
      picker.querySelectorAll('input[type="radio"][name]:checked'),
      function (input) {
        var position = optionPosition(root, input.name);
        if (position) {
          selected['option' + position] = String(input.value || '').trim();
        }
      }
    );

    return selected;
  }

  function resolveVariantFromOptions(root, selected) {
    var list = getCalculatorVariants(root);
    if (!list.length) return null;

    return list.find(function (variant) {
      return (!selected.option1 || String(variant.option1 || '').trim() === selected.option1) &&
        (!selected.option2 || String(variant.option2 || '').trim() === selected.option2) &&
        (!selected.option3 || String(variant.option3 || '').trim() === selected.option3);
    }) || null;
  }

  function getForm(area) {
    if (!area) return null;

    return area.querySelector('form[data-type="add-to-cart-form"]') ||
      area.querySelector('form[id^="product-form-"]');
  }

  function setFormVariant(area, variant) {
    var form = getForm(area);
    if (!form || !variant) return false;

    var id = String(variant.id);
    var fields = form.querySelectorAll('input[name="id"], select[name="id"]');
    if (!fields.length) return false;

    var changed = false;

    Array.prototype.forEach.call(fields, function (field) {
      if (String(field.value) !== id) changed = true;
      field.value = id;
      field.setAttribute('value', id);
      field.disabled = false;
    });

    return changed;
  }

  function setCalculatorVariant(area, id) {
    if (!area || !id) return;

    getCalculatorRoots(area).forEach(function (root) {
      var variant = variantById(root, id);
      if (!variant) return;

      root.dataset.activeVariantId = String(variant.id);
      root.setAttribute('data-active-variant-id', String(variant.id));

      /* product-calculators.js owns all calculator math. */
      var pieces = root.querySelector('[data-calculator-input="pieces"]');
      var sf = root.querySelector('[data-calculator-input="sf"]');
      var trigger = pieces && pieces.value !== '' ? pieces : sf;

      if (trigger) {
        trigger.dispatchEvent(new Event('input', { bubbles: true }));
      }

      root.dispatchEvent(new CustomEvent('calculator:variant-change', {
        bubbles: true,
        detail: { variantId: String(variant.id) }
      }));
    });
  }

  function syncFromPicker(picker) {
    if (!picker) return null;

    var area = getArea(picker);
    if (!area) return null;

    var roots = getCalculatorRoots(area);
    var resolved = null;

    roots.some(function (root) {
      var selected = getSelectedOptions(picker, root);
      var variant = resolveVariantFromOptions(root, selected);

      if (variant) {
        resolved = variant;
        return true;
      }

      return false;
    });

    if (!resolved) return null;

    /* This is the critical part: update the REAL Shopify product-form ID. */
    setFormVariant(area, resolved);

    /* Then give the same variant ID to every calculator on the page. */
    setCalculatorVariant(area, resolved.id);

    return resolved;
  }

  function forceRadioChecked(input) {
    if (!input) return;

    var picker = input.closest('variant-radios-single, variant-radios-detail, variant-group-detail');
    if (!picker) return;

    /* The theme's custom label handler can call preventDefault(), which means
       the browser never performs the normal label -> radio action. Explicitly
       select the radio so Shopify's variant system has the correct state. */
    Array.prototype.forEach.call(
      picker.querySelectorAll('input[type="radio"][name="' + CSS.escape(input.name) + '"]'),
      function (radio) {
        radio.checked = radio === input;
      }
    );

    input.checked = true;
  }

  function scheduleSync(picker) {
    if (!picker) return;

    /* Run after the theme's own variant handler, then one more time after its
       asynchronous UI/variant update. */
    window.setTimeout(function () { syncFromPicker(picker); }, 0);
    window.setTimeout(function () { syncFromPicker(picker); }, 75);
    window.setTimeout(function () { syncFromPicker(picker); }, 200);
  }

  function handleOptionClick(label) {
    if (!label || !label.matches('.product__color-swatches--js')) return;

    var id = label.getAttribute('for');
    var input = id ? document.getElementById(id) : label.querySelector('input[type="radio"]');
    if (!input) return;

    /* Do this immediately because the theme's click handler may prevent the
       native label action. */
    forceRadioChecked(input);

    var picker = getPicker(label);
    if (picker) scheduleSync(picker);
  }

  function handleRadioChange(input) {
    if (!input || !input.matches('input[type="radio"]')) return;

    var picker = getPicker(input);
    if (!picker) return;

    scheduleSync(picker);
  }

  function syncBeforeSubmit(form) {
    var area = getArea(form);
    var picker = getPicker(form);
    if (!area || !picker) return null;

    /* Re-resolve from the actual checked Size/Finish radios immediately before
       FormData is created by product-calculator-cart-fix.js. */
    var variant = syncFromPicker(picker);

    if (variant) {
      setFormVariant(area, variant);
    }

    return variant;
  }

  function initArea(area) {
    if (!area) return;

    var picker = getPicker(area);
    if (!picker) return;

    syncFromPicker(picker);
  }

  function boot() {
    document.querySelectorAll('.product__item-js').forEach(initArea);

    if (document.documentElement.dataset.productVariantCalculatorBridge === 'true') return;
    document.documentElement.dataset.productVariantCalculatorBridge = 'true';

    /* IMPORTANT: this runs before the theme's label handlers. */
    document.addEventListener('click', function (event) {
      var label = event.target && event.target.closest
        ? event.target.closest('.product__color-swatches--js')
        : null;

      if (label) handleOptionClick(label);
    }, true);

    document.addEventListener('change', function (event) {
      handleRadioChange(event.target);
    }, true);

    /* Final protection for the calculator's custom Add to Cart handler. */
    document.addEventListener('submit', function (event) {
      var form = event.target;
      if (!form || !form.matches('form[data-type="add-to-cart-form"]')) return;

      syncBeforeSubmit(form);
    }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  document.addEventListener('shopify:section:load', function (event) {
    if (!event.target) return;
    event.target.querySelectorAll('.product__item-js').forEach(initArea);
  });
})();