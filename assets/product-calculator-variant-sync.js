(function () {
  'use strict';

  /*
   * Bridge the EXISTING Shopify variant picker to the product calculators.
   *
   * Important detail in this theme:
   * product-variant-options.liquid renders the option radios OUTSIDE the
   * product <form>, but associates them with it using form="product-form-*".
   * Therefore form.querySelectorAll() cannot see those radios. We explicitly
   * query the document for controls associated with that form.
   */

  function section(root) {
    return root.closest('[data-section]') || root.closest('.product__item-js') || root.parentElement;
  }

  function variants(root) {
    var el = root.querySelector('.product-calculator-variants');
    if (!el) return [];
    try {
      return JSON.parse(el.textContent.trim()) || [];
    } catch (e) {
      console.error('Calculator variant data error:', e);
      return [];
    }
  }

  function optionPosition(root, name) {
    var value = String(name || '').trim().toLowerCase();
    var names = [
      String(root.dataset.option1Name || '').trim().toLowerCase(),
      String(root.dataset.option2Name || '').trim().toLowerCase(),
      String(root.dataset.option3Name || '').trim().toLowerCase()
    ];

    for (var i = 0; i < names.length; i++) {
      if (names[i] && value === names[i]) return i + 1;
    }
    return 0;
  }

  function formForInput(input) {
    if (!input) return null;
    var formId = input.getAttribute('form');
    if (formId) return document.getElementById(formId);
    return input.form || null;
  }

  function associatedControls(form) {
    if (!form) return [];

    var controls = [];
    var id = form.id;

    /* Controls physically inside the form. */
    Array.prototype.forEach.call(form.querySelectorAll('input, select'), function (control) {
      controls.push(control);
    });

    /* Controls outside the form but associated through form="...". */
    if (id) {
      Array.prototype.forEach.call(document.querySelectorAll('[form="' + CSS.escape(id) + '"]'), function (control) {
        if (controls.indexOf(control) === -1) controls.push(control);
      });
    }

    return controls;
  }

  function findCalculatorForInput(input) {
    if (!input) return null;

    var form = formForInput(input);
    var calculators = document.querySelectorAll('[data-product-calculator]');

    for (var i = 0; i < calculators.length; i++) {
      var root = calculators[i];
      var s = section(root);

      if (form && s && s.contains(form)) return root;
      if (s && s.contains(input)) return root;
    }

    /* Last-resort product-page match. This handles theme markup where the
       calculator and form are siblings under the same product information. */
    var productArea = input.closest('.main-product, .product-detail__information, .product__item-js');
    if (productArea) {
      for (var j = 0; j < calculators.length; j++) {
        if (productArea.contains(calculators[j])) return calculators[j];
      }
    }

    return null;
  }

  function getInputFromLabel(label) {
    if (!label) return null;

    var id = label.getAttribute('for') || label.htmlFor;
    if (id) {
      var input = document.getElementById(id);
      if (input) return input;
    }

    return label.querySelector('input[type="radio"]') ||
      (label.parentElement && label.parentElement.querySelector('input[type="radio"]'));
  }

  function currentSelection(root, changedInput) {
    var selected = {};
    var form = formForInput(changedInput);

    if (!form) {
      var s = section(root);
      if (s) {
        s.querySelectorAll('input[type="radio"]:checked').forEach(function (input) {
          var position = optionPosition(root, input.name);
          if (position) selected['option' + position] = String(input.value || '').trim();
        });
      }
      return selected;
    }

    /* FIX: these radios are form-associated but not children of the form. */
    associatedControls(form).forEach(function (control) {
      if (control.matches('input[type="radio"]:checked')) {
        var position = optionPosition(root, control.name);
        if (position) selected['option' + position] = String(control.value || '').trim();
      }

      if (control.matches('select')) {
        var selectPosition = optionPosition(root, control.name);
        if (selectPosition && control.value) {
          selected['option' + selectPosition] = String(control.value).trim();
        }
      }
    });

    return selected;
  }

  function resolveVariant(root, selection) {
    var list = variants(root);
    if (!list.length) return null;

    return list.find(function (variant) {
      return (!selection.option1 || String(variant.option1 || '').trim() === selection.option1) &&
        (!selection.option2 || String(variant.option2 || '').trim() === selection.option2) &&
        (!selection.option3 || String(variant.option3 || '').trim() === selection.option3);
    }) || null;
  }

  function variantById(root, id) {
    if (!id) return null;
    return variants(root).find(function (variant) {
      return String(variant.id) === String(id);
    }) || null;
  }

  function setProductFormVariant(root, variant, input) {
    if (!variant) return;

    root.dataset.activeVariantId = String(variant.id);

    var form = formForInput(input);
    if (!form) {
      var s = section(root);
      form = s && s.querySelector('form[id^="product-form-"]');
    }

    if (form) {
      form.querySelectorAll('input[name="id"], select[name="id"]').forEach(function (field) {
        field.value = variant.id;
        field.setAttribute('value', variant.id);
      });
    }
  }

  function recalculate(root) {
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

  function selectRadioAndNotify(input) {
    if (!input) return;

    /* The custom theme picker visually changes labels. Make the underlying
       Shopify option state authoritative as well. */
    if (!input.checked) {
      input.checked = true;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function processClickedLabel(label) {
    if (!label || !label.matches('.product__color-swatches--js')) return;

    var input = getInputFromLabel(label);
    if (!input) return;

    var root = findCalculatorForInput(input);
    if (!root) return;

    var position = optionPosition(root, input.name);
    if (!position) return;

    /* Set the clicked option first, then read every other selected option
       from the actual form-associated radios. */
    selectRadioAndNotify(input);

    var selection = currentSelection(root, input);
    selection['option' + position] = String(input.value || label.getAttribute('data-value') || '').trim();

    var variant = resolveVariant(root, selection);

    /* If the theme has not finished changing its radios yet, resolve directly
       from the previous active variant and replace only the clicked option. */
    if (!variant) {
      var current = variantById(root, root.dataset.activeVariantId);
      if (current) {
        var fallback = {
          option1: current.option1,
          option2: current.option2,
          option3: current.option3
        };
        fallback['option' + position] = selection['option' + position];
        variant = resolveVariant(root, fallback);
      }
    }

    if (!variant) return;

    setProductFormVariant(root, variant, input);
    recalculate(root);

    /* Re-run once after the theme's own variant-picker handler has completed. */
    setTimeout(function () {
      var latestSelection = currentSelection(root, input);
      latestSelection['option' + position] = String(input.value || label.getAttribute('data-value') || '').trim();
      var latestVariant = resolveVariant(root, latestSelection) || variant;

      if (latestVariant) {
        setProductFormVariant(root, latestVariant, input);
        recalculate(root);
      }
    }, 100);
  }

  function processRadio(input) {
    if (!input || !input.matches('input[type="radio"]')) return;

    var root = findCalculatorForInput(input);
    if (!root) return;

    var position = optionPosition(root, input.name);
    if (!position || !input.checked) return;

    var selection = currentSelection(root, input);
    selection['option' + position] = String(input.value || '').trim();

    var variant = resolveVariant(root, selection);
    if (!variant) return;

    setProductFormVariant(root, variant, input);
    recalculate(root);
  }

  function init(root) {
    if (root.dataset.variantSyncInitialized === 'true') return;
    root.dataset.variantSyncInitialized = 'true';

    var s = section(root);
    if (!s) return;

    var form = s.querySelector('form[id^="product-form-"]');
    var idField = form && form.querySelector('input[name="id"], select[name="id"]');

    if (!idField) {
      var productForms = document.querySelectorAll('form[id^="product-form-"]');
      for (var i = 0; i < productForms.length; i++) {
        if (s.contains(productForms[i])) {
          form = productForms[i];
          idField = form.querySelector('input[name="id"], select[name="id"]');
          break;
        }
      }
    }

    var initial = idField && variantById(root, idField.value);
    if (initial) {
      root.dataset.activeVariantId = String(initial.id);
    }
  }

  function boot() {
    document.querySelectorAll('[data-product-calculator]').forEach(init);

    if (document.documentElement.dataset.calculatorVariantBridge === 'true') return;
    document.documentElement.dataset.calculatorVariantBridge = 'true';

    /* Capture phase catches the existing custom picker before it can stop the
       event. */
    document.addEventListener('click', function (event) {
      var label = event.target && event.target.closest
        ? event.target.closest('.product__color-swatches--js')
        : null;
      if (label) processClickedLabel(label);
    }, true);

    document.addEventListener('change', function (event) {
      processRadio(event.target);
    }, true);
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