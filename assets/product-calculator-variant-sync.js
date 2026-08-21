(function () {
  'use strict';

  /*
   * Direct bridge between the theme's existing variant picker and calculator.
   * We listen on document capture so custom picker elements cannot swallow
   * the click before the calculator sees it.
   */

  function section(root) {
    return root.closest('[data-section]') || root.parentElement;
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

  function findCalculatorForInput(input) {
    if (!input) return null;

    var formId = input.getAttribute('form');
    var form = formId ? document.getElementById(formId) : input.form;
    var calculators = document.querySelectorAll('[data-product-calculator]');

    for (var i = 0; i < calculators.length; i++) {
      var root = calculators[i];
      var s = section(root);

      if (form && s && s.contains(form)) return root;
      if (s && s.contains(input)) return root;
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
    var s = section(root);
    if (!s) return selected;

    /* Read checked radios belonging to the actual product form. */
    var formId = changedInput && changedInput.getAttribute('form');
    var form = formId ? document.getElementById(formId) : (changedInput && changedInput.form);
    var scope = form || s;

    scope.querySelectorAll('input[type="radio"]:checked').forEach(function (input) {
      var position = optionPosition(root, input.name);
      if (position) selected['option' + position] = String(input.value || '').trim();
    });

    scope.querySelectorAll('select').forEach(function (select) {
      var position = optionPosition(root, select.name);
      if (position && select.value) selected['option' + position] = String(select.value).trim();
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

  function setActiveVariant(root, variant) {
    if (!variant) return;

    root.dataset.activeVariantId = String(variant.id);

    var s = section(root);
    if (s) {
      s.querySelectorAll('input[name="id"], select[name="id"]').forEach(function (field) {
        field.value = variant.id;
        field.setAttribute('value', variant.id);
      });
    }

    /* product-calculators.js already listens to calculator inputs. Re-fire
       the current calculator input so it recalculates from the new variant. */
    var pieces = root.querySelector('[data-calculator-input="pieces"]');
    var sf = root.querySelector('[data-calculator-input="sf"]');
    var trigger = pieces && pieces.value !== '' ? pieces : sf;

    if (trigger) {
      trigger.dispatchEvent(new Event('input', { bubbles: true }));
    }

    /* Also expose a reliable custom event for any future calculator logic. */
    root.dispatchEvent(new CustomEvent('calculator:variant-change', {
      bubbles: true,
      detail: { variant: variant }
    }));
  }

  function processClickedLabel(label) {
    if (!label || !label.matches('.product__color-swatches--js')) return;

    var input = getInputFromLabel(label);
    if (!input) return;

    var root = findCalculatorForInput(input);
    if (!root) return;

    var position = optionPosition(root, input.name);
    if (!position) return;

    /* Do not wait for the theme/custom element to update :checked. The value
       of the clicked label is the authoritative newly selected option. */
    var selection = currentSelection(root, input);
    selection['option' + position] = String(input.value || label.getAttribute('data-value') || '').trim();

    var variant = resolveVariant(root, selection);
    if (!variant) return;

    /* Run after the theme's own click handler as well as immediately if the
       picker stops propagation. The capture listener guarantees this starts. */
    setActiveVariant(root, variant);

    setTimeout(function () {
      var latest = currentSelection(root, input);
      latest['option' + position] = String(input.value || label.getAttribute('data-value') || '').trim();
      var latestVariant = resolveVariant(root, latest);
      if (latestVariant) setActiveVariant(root, latestVariant);
    }, 50);
  }

  function processRadio(input) {
    if (!input || !input.matches('input[type="radio"]')) return;

    var root = findCalculatorForInput(input);
    if (!root) return;

    var position = optionPosition(root, input.name);
    if (!position) return;

    var selection = currentSelection(root, input);
    if (input.checked) selection['option' + position] = String(input.value || '').trim();

    var variant = resolveVariant(root, selection);
    if (variant) setActiveVariant(root, variant);
  }

  function init(root) {
    if (root.dataset.variantSyncInitialized === 'true') return;
    root.dataset.variantSyncInitialized = 'true';

    var s = section(root);
    if (!s) return;

    /* Initial active variant from the product form. */
    var idField = s.querySelector('input.product-variant-id[name="id"], select[name="id"], input[name="id"]');
    var initial = variants(root).find(function (v) {
      return idField && String(v.id) === String(idField.value);
    });

    if (initial) setActiveVariant(root, initial);
  }

  function boot() {
    document.querySelectorAll('[data-product-calculator]').forEach(init);

    if (document.documentElement.dataset.calculatorVariantBridge === 'true') return;
    document.documentElement.dataset.calculatorVariantBridge = 'true';

    /* CAPTURE is intentional: the existing variant picker/custom element may
       stop propagation before a normal bubbling listener can see the click. */
    document.addEventListener('click', function (event) {
      var label = event.target && event.target.closest ? event.target.closest('.product__color-swatches--js') : null;
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