(function () {
  'use strict';

  /*
   * Calculator <-> existing product variant picker bridge.
   *
   * IMPORTANT:
   * product-variant-options.liquid uses labels with
   * .product__color-swatches--js and radio inputs whose names are the real
   * Shopify option names (for example Size and Finish).
   *
   * The theme can visually change the clicked label before the radio's
   * checked state / hidden variant ID is updated. Therefore we capture the
   * actual clicked label and resolve the variant directly from its value.
   * This prevents the calculator from staying on the previous variant.
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
    var option1 = String(root.dataset.option1Name || '').trim().toLowerCase();
    var option2 = String(root.dataset.option2Name || '').trim().toLowerCase();
    var option3 = String(root.dataset.option3Name || '').trim().toLowerCase();

    if (name === option1) return 1;
    if (name === option2) return 2;
    if (name === option3) return 3;
    return 0;
  }

  function getInitialSelection(root) {
    var section = getSection(root);
    var selected = {};
    if (!section) return selected;

    section.querySelectorAll('input[type="radio"]:checked').forEach(function (input) {
      var position = optionPosition(root, input.name);
      if (position && input.value) {
        selected['option' + position] = String(input.value).trim();
      }
    });

    section.querySelectorAll('select').forEach(function (select) {
      var position = optionPosition(root, select.name);
      if (position && select.value) {
        selected['option' + position] = String(select.value).trim();
      }
    });

    return selected;
  }

  function findVariant(root, selection) {
    var list = getVariants(root);
    if (!list.length) return null;

    return list.find(function (variant) {
      return (!selection.option1 || String(variant.option1 || '').trim() === selection.option1) &&
        (!selection.option2 || String(variant.option2 || '').trim() === selection.option2) &&
        (!selection.option3 || String(variant.option3 || '').trim() === selection.option3);
    }) || null;
  }

  function getVariantById(root, id) {
    if (!id) return null;
    var list = getVariants(root);

    return list.find(function (variant) {
      return String(variant.id) === String(id);
    }) || null;
  }

  function setHiddenVariantId(root, variant) {
    var section = getSection(root);
    if (!section || !variant || !variant.id) return;

    section.querySelectorAll('input[name="id"], select[name="id"]').forEach(function (field) {
      /* Do NOT dispatch change here. The theme's variant picker owns its
         normal change lifecycle. We only keep the product form ID correct
         for Add to Cart. */
      field.value = variant.id;
      field.setAttribute('value', variant.id);
    });
  }

  function triggerCalculator(root) {
    var piecesInput = root.querySelector('[data-calculator-input="pieces"]');
    var sfInput = root.querySelector('[data-calculator-input="sf"]');
    var trigger = piecesInput && piecesInput.value !== '' ? piecesInput : sfInput;

    if (trigger) {
      trigger.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function applyVariant(root, variant, force) {
    if (!variant) return;

    var id = String(variant.id);
    var changed = String(root.dataset.activeVariantId || '') !== id;

    root.dataset.activeVariantId = id;
    setHiddenVariantId(root, variant);

    if (force || changed) {
      triggerCalculator(root);
    }
  }

  function getInputFromLabel(label) {
    if (!label) return null;

    var id = label.htmlFor || label.getAttribute('for');
    if (id) {
      var input = document.getElementById(id);
      if (input) return input;
    }

    return label.parentElement && label.parentElement.querySelector('input[type="radio"]');
  }

  function init(root) {
    if (root.dataset.variantSyncInitialized === 'true') return;
    root.dataset.variantSyncInitialized = 'true';

    var section = getSection(root);
    if (!section) return;

    /* Keep our own option state. This is intentionally independent from the
       theme's checked attribute because the visual swatch can change first. */
    var selection = getInitialSelection(root);
    var timer = null;

    function schedule(fn, delay) {
      clearTimeout(timer);
      timer = setTimeout(fn, delay === undefined ? 50 : delay);
    }

    function applySelection(force) {
      var variant = findVariant(root, selection);

      if (!variant) {
        /* If only one option has been captured during the theme's update,
           fall back to the current Shopify variant ID. */
        var idField = section.querySelector('input[name="id"], select[name="id"]');
        variant = getVariantById(root, idField && idField.value);
      }

      if (variant) applyVariant(root, variant, force);
    }

    /* This is the critical path for the existing snippet's pill buttons. */
    section.addEventListener('click', function (event) {
      var label = event.target.closest('.product__color-swatches--js');
      if (!label || !section.contains(label)) return;

      var input = getInputFromLabel(label);
      if (!input) return;

      var position = optionPosition(root, input.name);
      if (!position) return;

      selection['option' + position] = String(input.value || '').trim();

      /* Let the theme finish its own picker work, then immediately use the
         exact option that was clicked. */
      schedule(function () {
        applySelection(true);
      }, 20);
    }, false);

    /* Covers keyboard selection and any normal radio/select interaction. */
    section.addEventListener('change', function (event) {
      var target = event.target;
      if (!target) return;

      if (target.matches('input[type="radio"]')) {
        var position = optionPosition(root, target.name);
        if (position && target.checked) {
          selection['option' + position] = String(target.value || '').trim();
          schedule(function () {
            applySelection(true);
          }, 20);
        }
        return;
      }

      if (target.matches('select')) {
        var selectPosition = optionPosition(root, target.name);
        if (selectPosition) {
          selection['option' + selectPosition] = String(target.value || '').trim();
          schedule(function () {
            applySelection(true);
          }, 20);
        }
      }
    }, false);

    /* Support themes that announce a variant change after their own AJAX /
       product-form update. */
    ['variant:change', 'variantChange', 'product:variant-change'].forEach(function (eventName) {
      document.addEventListener(eventName, function () {
        schedule(function () {
          /* Refresh our selection from checked controls, but preserve any
             option captured directly from the clicked label. */
          var checked = getInitialSelection(root);
          Object.keys(checked).forEach(function (key) {
            selection[key] = checked[key];
          });
          applySelection(true);
        }, 20);
      });
    });

    /* Fallback for asynchronous picker updates. */
    var lastSignature = '';
    setInterval(function () {
      var signature = [
        selection.option1 || '',
        selection.option2 || '',
        selection.option3 || ''
      ].join('|');

      if (signature && signature !== lastSignature) {
        lastSignature = signature;
        applySelection(true);
      }
    }, 300);

    /* Initial variant. */
    applySelection(true);
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
