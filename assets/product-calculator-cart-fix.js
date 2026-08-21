(function () {
  'use strict';

  function getCalculatorRoot(productForm) {
    var sectionId = productForm && productForm.dataset.calculatorForm;

    if (!sectionId) {
      return null;
    }

    return document.querySelector(
      '[data-calculator-section="' + sectionId + '"]'
    );
  }

  function setLoading(productForm, loading) {
    var button = productForm.querySelector('button[name="add"][type="submit"]');

    if (!button) {
      return;
    }

    button.disabled = loading;
    button.setAttribute('aria-disabled', loading ? 'true' : 'false');
    button.classList.toggle('loading', loading);
  }

  function showError(root, message) {
    if (!root) {
      return;
    }

    var error = root.querySelector('[data-calculator-message="error"]');

    if (error) {
      error.textContent = message || 'Unable to add this product to the cart.';
      error.hidden = false;
    }
  }

  document.addEventListener(
    'submit',
    function (event) {
      var form = event.target;

      if (!form || !form.matches) {
        return;
      }

      var productForm = form.closest('product-form[data-calculator-form]');

      if (!productForm) {
        return;
      }

      var root = getCalculatorRoot(productForm);
      var state = root && root._calculatorState;

      if (!root || !state || !state.valid) {
        return;
      }

      var variantInput = form.querySelector('input[name="id"]');

      if (!variantInput || !variantInput.value) {
        showError(root, 'Unable to determine the selected product variant.');
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      // The theme may keep the variant input disabled for variant-picker logic.
      // Disabled controls are omitted from FormData, so explicitly enable it.
      variantInput.disabled = false;

      // This calculator form has its own cart request because the theme\'s
      // generic product-form handler can submit a single item as a JSON object.
      // Shopify\'s current Ajax Cart API expects an items array for JSON requests.
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
              var message =
                data.description ||
                data.message ||
                'We could not add this product to your cart. Please try again.';

              throw new Error(message);
            }

            return data;
          });
        })
        .then(function (data) {
          if (!data.items || !data.items.length) {
            throw new Error('The product was not added to the cart.');
          }

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
