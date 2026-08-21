(function () {
  'use strict';

  /*
   * SINGLE PRODUCT VARIANT + CALCULATOR BRIDGE
   *
   * The theme has two separate systems:
   *   1. variant-radios-single -> renders the option radios and contains the
   *      complete Shopify variant JSON.
   *   2. product-calculator -> contains the calculator JSON/metafields.
   *
   * The important source of truth is always the Shopify variant ID.
   * We resolve the selected option combination, write the exact variant ID
   * into the real product form, and then give that same ID to the calculator.
   *
   * This also performs a final sync on form submit. Therefore Add to Cart
   * cannot submit the initial/default variant if a customer changed Size or
   * Finish immediately before submitting.
   */

  function productArea(element) {
    if (!element) return null;
    return element.closest('.product__item-js') || element.closest('[data-section]');
  }

  function pickerFor(element) {
    var area = productArea(element);
    if (!area) return null;

    return area.querySelector('variant-radios-single') ||
      area.querySelector('variant-radios-detail') ||
      area.querySelector('variant-group-detail');
  }

  function readJsonScript(container) {
    if (!container) return [];

    var scripts = container.querySelectorAll('script[type="application/json"]');
    for (var i = scripts.length - 1; i >= 0; i--) {
      try {
        var parsed = JSON.parse(scripts[i].textContent.trim());
        if (Array.isArray(parsed) && parsed.length && parsed[0].id) return parsed;
      } catch (e) {
        /* Ignore unrelated JSON blocks. */
      }
    }

    return [];
  }

  function pickerVariants(picker) {
    return readJsonScript(picker);
  }

  function calculatorRoots(area) {
    if (!area) return [];
    return Array.prototype.slice.call(area.querySelectorAll('[data-product-calculator]'));
  }

  function calculatorVariants(root) {
    var data = root && root.querySelector('.product-calculator-variants');
    if (!data) return [];

    try {
      return JSON.parse(data.textContent.trim()) || [];
    } catch (e) {
      console.error('[Calculator] Invalid variant JSON:', e);
      return [];
    }
  }

  function variantById(list, id) {
    if (!id) return null;

    return list.find(function (variant) {
      return String(variant.id) === String(id);
    }) || null;
  }

  function selectedOptionValues(picker) {
    var values = [];

    if (!picker) return values;

    /* These radios are physically inside variant-radios-single even though
       their form="product-form-*" association points to the Add to Cart form. */
    var checked = picker.querySelectorAll('input[type="radio"]:checked');

    Array.prototype.forEach.call(checked, function (input) {
      var position = Number(input.closest('fieldset')?.querySelector('[data-position]')?.getAttribute('data-position')) || 0;

      /* Prefer the option position from the input's surrounding fieldset.
         The theme's fieldsets are rendered in Shopify option order. */
      if (!position) {
        var fieldsets = picker.querySelectorAll('fieldset.product-form__input');
        for (var i = 0; i < fieldsets.length; i++) {
          if (fieldsets[i].contains(input)) {
            position = i + 1;
            break;
          }
        }
      }

      if (position) values[position - 1] = String(input.value || '').trim();
    });

    /* Safety fallback: fieldset order is authoritative for this theme. */
    if (!values.length || values.some(function (value) { return !value; })) {
      var fieldsets = picker.querySelectorAll('fieldset.product-form__input');
      Array.prototype.forEach.call(fieldsets, function (fieldset, index) {
        var checkedInput = fieldset.querySelector('input[type="radio"]:checked');
        if (checkedInput) values[index] = String(checkedInput.value || '').trim();
      });
    }

    return values;
  }

  function resolveSelectedVariant(picker) {
    var variants = pickerVariants(picker);
    if (!variants.length) return null;

    var options = selectedOptionValues(picker);
    if (!options.length) return null;

    return variants.find(function (variant) {
      return options.every(function (value, index) {
        if (!value) return true;
        return String(variant.options[index] || '').trim() === value;
      });
    }) || null;
  }

  function formForArea(area) {
    if (!area) return null;

    return area.querySelector('form[data-type="add-to-cart-form"]') ||
      area.querySelector('form[id^="product-form-"]');
  }

  function writeVariantToForm(area, variant) {
    if (!area || !variant) return false;

    var form = formForArea(area);
    if (!form) return false;

    var fields = form.querySelectorAll('input[name="id"], select[name="id"]');
    if (!fields.length) return false;

    var id = String(variant.id);
    var changed = false;

    Array.prototype.forEach.call(fields, function (field) {
      if (String(field.value) !== id) changed = true;
      field.value = id;
      field.setAttribute('value', id);
      field.disabled = false;
    });

    return changed;
  }

  function setCalculatorVariant(area, variantId) {
    if (!area || !variantId) return;

    calculatorRoots(area).forEach(function (root) {
      var variant = variantById(calculatorVariants(root), variantId);
      if (!variant) return;

      root.dataset.activeVariantId = String(variant.id);
      root.setAttribute('data-active-variant-id', String(variant.id));

      /* product-calculators.js owns the calculations. Trigger its normal input
         path after changing the active variant. */
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

    var area = productArea(picker);
    if (!area) return null;

    var variant = resolveSelectedVariant(picker);
    if (!variant) return null;

    /* FIRST: update the real Shopify form. This is what Add to Cart submits. */
    writeVariantToForm(area, variant);

    /* SECOND: use the exact same variant ID for every calculator on this page. */
    setCalculatorVariant(area, variant.id);

    return variant;
  }

  function syncFromElement(element) {
    var picker = pickerFor(element);
    if (!picker) return null;
    return syncFromPicker(picker);
  }

  function scheduleSync(picker) {
    if (!picker) return;

    /* Let the native label -> radio action and the theme's own handler run. */
    window.setTimeout(function () { syncFromPicker(picker); }, 0);
    window.setTimeout(function () { syncFromPicker(picker); }, 50);
    window.setTimeout(function () { syncFromPicker(picker); }, 150);
  }

  function initArea(area) {
    if (!area) return;

    var picker = pickerFor(area);
    if (!picker) return;

    syncFromPicker(picker);
  }

  function boot() {
    document.querySelectorAll('.product__item-js').forEach(initArea);

    if (document.documentElement.dataset.productVariantCalculatorBridge === 'true') return;
    document.documentElement.dataset.productVariantCalculatorBridge = 'true';

    /* Option click: resolve the selected radio after the browser performs the
       label action and after the theme's own variant handler has had a chance
       to update its active state. */
    document.addEventListener('click', function (event) {
      var label = event.target && event.target.closest
        ? event.target.closest('.product__color-swatches--js')
        : null;

      if (!label) return;

      var picker = pickerFor(label);
      if (picker) scheduleSync(picker);
    }, false);

    /* Direct radio changes are also supported for keyboard accessibility. */
    document.addEventListener('change', function (event) {
      var input = event.target;
      if (!input || !input.matches('input[type="radio"]')) return;
      if (!input.closest('variant-radios-single, variant-radios-detail, variant-group-detail')) return;

      var picker = pickerFor(input);
      if (picker) scheduleSync(picker);
    }, false);

    /* FINAL SAFETY NET:
       Add to Cart must always use the variant represented by the currently
       selected Size/Finish options, even if the theme's async handler has not
       finished yet. */
    document.addEventListener('submit', function (event) {
      var form = event.target;
      if (!form || !form.matches('form[data-type="add-to-cart-form"]')) return;

      var area = productArea(form);
      var picker = pickerFor(form);
      if (!area || !picker) return;

      var variant = syncFromPicker(picker);
      if (!variant) return;

      /* Make absolutely sure the submitted field is correct immediately before
         the browser's FormData is created. */
      writeVariantToForm(area, variant);
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