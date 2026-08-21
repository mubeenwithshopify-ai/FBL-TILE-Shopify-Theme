(function () {
  'use strict';

  /*
   * Calculator <-> Shopify variant bridge.
   *
   * The theme renders the variant picker in product-variant-options.liquid
   * and the calculator in product-calculator.liquid. They are separate
   * components, so this file is deliberately the only bridge between them.
   *
   * Source of truth:
   *   - Shopify native variant price: variant.price
   *   - Variant metafields: custom.sf_per_piece, custom.minimum_pieces,
   *     custom.pieces_per_box, custom.coverage_per_sheet, etc.
   *
   * product-calculator.liquid already serializes those values for every
   * variant in .product-calculator-variants. We only have to resolve the
   * currently selected variant correctly and tell product-calculators.js to
   * recalculate.
   */

  function getCalculators(area) {
    if (!area) return [];
    return Array.prototype.slice.call(area.querySelectorAll('[data-product-calculator]'));
  }

  function getVariants(root) {
    var data = root.querySelector('.product-calculator-variants');
    if (!data) return [];

    try {
      return JSON.parse(data.textContent.trim()) || [];
    } catch (error) {
      console.error('[Calculator] Invalid variant JSON:', error);
      return [];
    }
  }

  function getOptionPosition(root, name) {
    var optionName = String(name || '').trim().toLowerCase();
    var names = [
      String(root.dataset.option1Name || '').trim().toLowerCase(),
      String(root.dataset.option2Name || '').trim().toLowerCase(),
      String(root.dataset.option3Name || '').trim().toLowerCase()
    ];

    for (var i = 0; i < names.length; i++) {
      if (names[i] && names[i] === optionName) return i + 1;
    }

    return 0;
  }

  function getFormFromInput(input) {
    if (!input) return null;

    var formId = input.getAttribute('form');
    if (formId) return document.getElementById(formId);

    return input.form || null;
  }

  function getProductArea(input) {
    if (!input) return null;

    return input.closest(
      '.product__item-js, .main-product, .product-detail__information, [data-section]'
    );
  }

  function getAssociatedControls(form) {
    if (!form) return [];

    var controls = Array.prototype.slice.call(form.querySelectorAll('input, select'));
    var formId = form.id;

    if (formId) {
      var external = document.querySelectorAll('[form="' + formId.replace(/"/g, '\\"') + '"]');
      Array.prototype.forEach.call(external, function (control) {
        if (controls.indexOf(control) === -1) controls.push(control);
      });
    }

    return controls;
  }

  function getSelection(root, changedInput, changedValue) {
    var selection = {};
    var form = getFormFromInput(changedInput);

    if (form) {
      getAssociatedControls(form).forEach(function (control) {
        if (control.matches('input[type="radio"]') && control.checked) {
          var position = getOptionPosition(root, control.name);
          if (position) selection['option' + position] = String(control.value).trim();
        }

        if (control.matches('select')) {
          var selectPosition = getOptionPosition(root, control.name);
          if (selectPosition && control.value) {
            selection['option' + selectPosition] = String(control.value).trim();
          }
        }
      });
    }

    /* The clicked label is authoritative for that option. This is important
       because the theme's custom picker can update its visual state before
       the native radio's checked state is updated. */
    if (changedInput) {
      var changedPosition = getOptionPosition(root, changedInput.name);
      if (changedPosition) {
        selection['option' + changedPosition] = String(
          changedValue !== undefined ? changedValue : changedInput.value
        ).trim();
      }
    }

    return selection;
  }

  function resolveVariant(root, selection) {
    var list = getVariants(root);
    if (!list.length) return null;

    return list.find(function (variant) {
      return (!selection.option1 || String(variant.option1 || '').trim() === selection.option1) &&
        (!selection.option2 || String(variant.option2 || '').trim() === selection.option2) &&
        (!selection.option3 || String(variant.option3 || '').trim() === selection.option3);
    }) || null;
  }

  function variantById(root, id) {
    if (!id) return null;

    return getVariants(root).find(function (variant) {
      return String(variant.id) === String(id);
    }) || null;
  }

  function getProductFormId(area) {
    if (!area) return null;

    var form = area.querySelector('form[id^="product-form-"]');
    return form ? form.id : null;
  }

  function getCurrentFormVariant(area) {
    if (!area) return null;

    var form = area.querySelector('form[id^="product-form-"]');
    if (!form) return null;

    var idField = form.querySelector('input[name="id"], select[name="id"]');
    return idField && idField.value ? String(idField.value) : null;
  }

  function setActiveVariant(root, variant) {
    if (!root || !variant) return false;

    var id = String(variant.id);
    var changed = String(root.dataset.activeVariantId || '') !== id;

    root.dataset.activeVariantId = id;
    root.setAttribute('data-active-variant-id', id);

    return changed;
  }

  function triggerCalculator(root) {
    if (!root) return;

    /* product-calculators.js already owns all calculations. Trigger its
       normal input path instead of duplicating calculation logic here. */
    var pieces = root.querySelector('[data-calculator-input="pieces"]');
    var sf = root.querySelector('[data-calculator-input="sf"]');
    var trigger = pieces && pieces.value !== '' ? pieces : sf;

    if (trigger) {
      trigger.dispatchEvent(new Event('input', { bubbles: true }));
    }

    root.dispatchEvent(new CustomEvent('calculator:variant-change', {
      bubbles: true,
      detail: { variantId: root.dataset.activeVariantId }
    }));
  }

  function syncArea(area, variant) {
    if (!area || !variant) return;

    getCalculators(area).forEach(function (root) {
      var calculatorVariant = variantById(root, variant.id);
      if (!calculatorVariant) return;

      setActiveVariant(root, calculatorVariant);
      triggerCalculator(root);
    });
  }

  function syncFromForm(area) {
    var id = getCurrentFormVariant(area);
    if (!id) return false;

    var matched = false;

    getCalculators(area).forEach(function (root) {
      var variant = variantById(root, id);
      if (!variant) return;

      setActiveVariant(root, variant);
      triggerCalculator(root);
      matched = true;
    });

    return matched;
  }

  function handleLabel(label) {
    if (!label || !label.matches('.product__color-swatches--js')) return;

    var id = label.getAttribute('for');
    var input = id ? document.getElementById(id) : label.querySelector('input[type="radio"]');
    if (!input) return;

    var area = getProductArea(input);
    if (!area) return;

    var clickedValue = label.getAttribute('data-value') || input.value;

    /* First resolve directly from the option that was clicked. */
    getCalculators(area).forEach(function (root) {
      var selection = getSelection(root, input, clickedValue);
      var variant = resolveVariant(root, selection);

      if (variant) {
        setActiveVariant(root, variant);
        triggerCalculator(root);
      }
    });

    /* Then let the theme finish its own native variant update. The hidden
       product-form ID is the strongest source of truth, so sync it again. */
    window.setTimeout(function () {
      syncFromForm(area);
    }, 0);

    window.setTimeout(function () {
      syncFromForm(area);
    }, 100);
  }

  function handleRadio(input) {
    if (!input || !input.matches('input[type="radio"]') || !input.checked) return;

    var area = getProductArea(input);
    if (!area) return;

    getCalculators(area).forEach(function (root) {
      var selection = getSelection(root, input, input.value);
      var variant = resolveVariant(root, selection);

      if (variant) {
        setActiveVariant(root, variant);
        triggerCalculator(root);
      }
    });

    window.setTimeout(function () {
      syncFromForm(area);
    }, 0);
  }

  function observeProductForm(area) {
    if (!area || area.dataset.calculatorVariantObserver === 'true') return;
    area.dataset.calculatorVariantObserver = 'true';

    var formId = getProductFormId(area);
    if (!formId) return;

    var form = document.getElementById(formId);
    if (!form) return;

    var idField = form.querySelector('input[name="id"], select[name="id"]');
    if (!idField) return;

    var lastId = idField.value;

    var observer = new MutationObserver(function () {
      var currentId = idField.value;
      if (!currentId || currentId === lastId) return;
      lastId = currentId;
      syncFromForm(area);
    });

    observer.observe(idField, {
      attributes: true,
      attributeFilter: ['value']
    });

    idField.addEventListener('change', function () {
      lastId = idField.value;
      syncFromForm(area);
    });

    /* Also poll the property because JS often changes .value without changing
       the DOM value attribute, which MutationObserver cannot see. */
    var timer = window.setInterval(function () {
      if (!document.documentElement.contains(area)) {
        window.clearInterval(timer);
        return;
      }

      var currentId = idField.value;
      if (currentId && currentId !== lastId) {
        lastId = currentId;
        syncFromForm(area);
      }
    }, 150);
  }

  function init() {
    document.querySelectorAll('[data-product-calculator]').forEach(function (root) {
      var area = getProductArea(root);
      if (area) {
        observeProductForm(area);
        syncFromForm(area);
      }
    });

    if (document.documentElement.dataset.productCalculatorVariantBridge === 'true') return;
    document.documentElement.dataset.productCalculatorVariantBridge = 'true';

    /* Capture the custom variant-picker label click before the theme handler. */
    document.addEventListener('click', function (event) {
      var label = event.target && event.target.closest
        ? event.target.closest('.product__color-swatches--js')
        : null;
      if (label) handleLabel(label);
    }, true);

    document.addEventListener('change', function (event) {
      handleRadio(event.target);
    }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  document.addEventListener('shopify:section:load', function (event) {
    if (!event.target) return;
    event.target.querySelectorAll('[data-product-calculator]').forEach(function (root) {
      var area = getProductArea(root);
      if (area) {
        observeProductForm(area);
        syncFromForm(area);
      }
    });
  });
})();