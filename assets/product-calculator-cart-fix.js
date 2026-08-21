(function () {
  'use strict';

  function getCalculatorRoot(productForm) {
    var sectionId = productForm && productForm.dataset.calculatorForm;
    if (!sectionId) return null;
    return document.querySelector('[data-calculator-section="' + sectionId + '"]');
  }

  function setLoading(productForm, loading) {
    var button = productForm.querySelector('button[name="add"][type="submit"]');
    if (!button) return;
    button.disabled = loading;
    button.setAttribute('aria-disabled', loading ? 'true' : 'false');
    button.classList.toggle('loading', loading);
  }

  function showError(root, message) {
    if (!root) return;
    var error = root.querySelector('[data-calculator-message="error"]');
    if (error) {
      error.textContent = message || 'Unable to add this product to the cart.';
      error.hidden = false;
    }
  }

  /*
   * FINAL SOURCE-OF-TRUTH CHECK
   *
   * Do not trust the hidden id field here. The calculator form starts with the
   * first available variant and the theme has several variant handlers. At
   * submit time we resolve the exact Shopify variant again from the checked
   * option radios + the variant JSON already rendered by product-calculator.
   * This guarantees that Add to Cart receives the variant the customer chose.
   */
  function resolveVariantAtSubmit(productForm, root) {
    var picker = productForm.closest('.product__item-js')
      ? productForm.closest('.product__item-js').querySelector('variant-radios-single, variant-radios-detail, variant-group-detail')
      : document.querySelector('variant-radios-single, variant-radios-detail, variant-group-detail');

    var json = root && root.querySelector('.product-calculator-variants');
    if (!picker || !json) return null;

    var variants;
    try {
      variants = JSON.parse(json.textContent.trim()) || [];
    } catch (e) {
      console.error('[Calculator Cart Fix] Invalid variant JSON:', e);
      return null;
    }

    var names = [
      String(root.dataset.option1Name || '').trim().toLowerCase(),
      String(root.dataset.option2Name || '').trim().toLowerCase(),
      String(root.dataset.option3Name || '').trim().toLowerCase()
    ];

    var selected = {};
    Array.prototype.forEach.call(
      picker.querySelectorAll('input[type="radio"][name]:checked'),
      function (input) {
        var inputName = String(input.name || '').trim().toLowerCase();
        var index = names.indexOf(inputName);
        if (index !== -1) selected[index] = String(input.value || '').trim();
      }
    );

    /* Fall back to fieldset order if option names have been renamed by the
       merchant/theme settings. */
    if (Object.keys(selected).length === 0) {
      Array.prototype.forEach.call(
        picker.querySelectorAll('fieldset.product-form__input'),
        function (fieldset, index) {
          var checked = fieldset.querySelector('input[type="radio"]:checked');
          if (checked) selected[index] = String(checked.value || '').trim();
        }
      );
    }

    if (!Object.keys(selected).length) return null;

    var variant = variants.find(function (item) {
      return Object.keys(selected).every(function (index) {
        return String(item['option' + (Number(index) + 1)] || '').trim() === selected[index];
      });
    });

    if (!variant) return null;

    var variantInput = productForm.querySelector('input[name="id"]');
    if (!variantInput) return null;

    variantInput.value = String(variant.id);
    variantInput.setAttribute('value', String(variant.id));
    variantInput.disabled = false;

    /* Keep the calculator on exactly the same variant. */
    root.dataset.activeVariantId = String(variant.id);
    root.setAttribute('data-active-variant-id', String(variant.id));

    return variant;
  }

  document.addEventListener(
    'submit',
    function (event) {
      var form = event.target;
      if (!form || !form.matches) return;

      var productForm = form.closest('product-form[data-calculator-form]');
      if (!productForm) return;

      var root = getCalculatorRoot(productForm);
      var state = root && root._calculatorState;
      if (!root || !state || !state.valid) return;

      /* Resolve the variant FIRST, before FormData is constructed. */
      var resolvedVariant = resolveVariantAtSubmit(productForm, root);

      if (!resolvedVariant) {
        showError(root, 'Unable to determine the selected product variant. Please select a valid size and finish.');
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }

      var variantInput = form.querySelector('input[name="id"]');
      if (!variantInput || !variantInput.value) {
        showError(root, 'Unable to determine the selected product variant.');
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }

      variantInput.disabled = false;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      setLoading(productForm, true);

      var formData = new FormData(form);
      var addUrl =
        window.Shopify && window.Shopify.routes && window.Shopify.routes.root
          ? window.Shopify.routes.root + 'cart/add.js'
          : '/cart/add.js';

      fetch(addUrl, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: formData
      })
        .then(function (response) {
          return response.text().then(function (text) {
            var data = {};
            try {
              data = text ? JSON.parse(text) : {};
            } catch (parseError) {
              data = {};
            }

            if (!response.ok || data.status || data.errors || data.description) {
              throw new Error(
                data.description ||
                data.message ||
                'We could not add this product to your cart. Please try again.'
              );
            }

            return data;
          });
        })
        .then(function (data) {
          var addedItem = data && (
            data.id || data.key || data.variant_id ||
            (data.items && data.items.length)
          );

          if (!addedItem) throw new Error('The product was not added to the cart.');

          var cartUrl =
            window.routes && window.routes.cart_url
              ? window.routes.cart_url
              : '/cart';

          window.location.href = cartUrl;
        })
        .catch(function (error) {
          console.error('Calculator add-to-cart error:', error);
          showError(root, error.message);
          setLoading(productForm, false);
        });
    },
    true
  );
})();
