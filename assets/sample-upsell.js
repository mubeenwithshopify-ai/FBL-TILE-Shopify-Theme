document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('.sample-upsell-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var variantId = btn.getAttribute('data-variant-id');
      var productTitle = btn.getAttribute('data-product-title');
      var productSku = btn.getAttribute('data-product-sku');

      var originalLabel = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Adding...';

      fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [
            {
              id: variantId,
              quantity: 1,
              properties: {
                'Sample for': productTitle,
                'Original SKU': productSku || 'N/A'
              }
            }
          ]
        })
      })
        .then(function (res) {
          if (!res.ok) throw new Error('Failed to add sample');
          return res.json();
        })
        .then(function () {
          btn.textContent = 'Added ✓';

          // Ask Shopify to re-render the header section (which contains the minicart),
          // then swap in the refreshed .minicart markup.
          return fetch(window.location.pathname + '?sections=header')
            .then(function (res) { return res.json(); })
            .then(function (sections) {
              var headerHtml = sections['header'];
              if (!headerHtml) return;

              var parsed = new DOMParser().parseFromString(headerHtml, 'text/html');
              var newMinicart = parsed.querySelector('.minicart');
              var currentMinicart = document.querySelector('.minicart');

              if (newMinicart && currentMinicart) {
                currentMinicart.innerHTML = newMinicart.innerHTML;
              }
            });
        })
        .catch(function (err) {
          console.error(err);
          btn.textContent = 'Error - try again';
          btn.disabled = false;
        })
        .finally(function () {
          setTimeout(function () {
            btn.textContent = originalLabel;
            btn.disabled = false;
          }, 2000);
        });
    });
  });
});