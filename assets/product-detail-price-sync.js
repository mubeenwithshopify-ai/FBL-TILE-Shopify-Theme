(function () {
  'use strict';

  function money(cents, currency, locale, showCode) {
    try {
      return new Intl.NumberFormat(locale || 'en-US', {
        style: 'currency',
        currency: currency || 'USD',
        currencyDisplay: showCode ? 'code' : 'symbol',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(Number(cents || 0) / 100);
    } catch (e) {
      return (Number(cents || 0) / 100).toFixed(2);
    }
  }

  function getVariants(root) {
    var calculatorData = root.querySelector('.product-calculator-variants');
    if (calculatorData) {
      try {
        var calculatorVariants = JSON.parse(calculatorData.textContent.trim());
        if (Array.isArray(calculatorVariants) && calculatorVariants.length) return calculatorVariants;
      } catch (e) {}
    }

    var priceData = root.querySelector('[data-product-price-variants]');
    if (!priceData) return [];
    try { return JSON.parse(priceData.textContent.trim()) || []; }
    catch (e) { return []; }
  }

  function getVariantId(root) {
    var idInput = root.querySelector('input.product-variant-id[name="id"], select[name="id"], input[name="id"]');
    return idInput ? String(idInput.value) : '';
  }

  function render(root) {
    var priceBox = root.querySelector('[data-product-detail-price]');
    if (!priceBox) return;

    var id = getVariantId(root);
    var variant = getVariants(root).find(function (item) {
      return String(item.id) === id;
    });
    if (!variant) return;

    var current = priceBox.querySelector('[data-price-current]');
    var compare = priceBox.querySelector('[data-price-compare]');
    var compareWrap = priceBox.querySelector('[data-price-compare-wrap]');
    var regularWrap = priceBox.querySelector('[data-price-regular-wrap]');
    var currency = priceBox.dataset.priceCurrency || 'USD';
    var locale = priceBox.dataset.priceLocale || document.documentElement.lang || 'en-US';
    var showCode = priceBox.dataset.priceShowCurrency === 'true';
    var price = Number(variant.price || 0);
    var compareAt = Number(variant.compare_at_price || variant.compareAtPrice || 0);

    if (current) current.textContent = money(price, currency, locale, showCode);

    if (compareAt > price) {
      if (compare) compare.textContent = money(compareAt, currency, locale, showCode);
      if (compareWrap) compareWrap.hidden = false;
      if (regularWrap) regularWrap.hidden = false;
      if (current) current.classList.add('price--special');
    } else {
      if (compare) compare.textContent = '';
      if (compareWrap) compareWrap.hidden = true;
      if (current) current.classList.remove('price--special');
    }
  }

  function init(root) {
    if (!root || root.dataset.productDetailPriceSync === 'true') return;
    root.dataset.productDetailPriceSync = 'true';

    render(root);

    root.addEventListener('change', function (event) {
      if (event.target && (event.target.matches('input[type="radio"][name]') || event.target.matches('input[name="id"], select[name="id"]'))) {
        setTimeout(function () { render(root); }, 0);
        setTimeout(function () { render(root); }, 100);
        setTimeout(function () { render(root); }, 250);
      }
    });

    root.addEventListener('calculator:variant-change', function () {
      render(root);
    });

    document.addEventListener('variant:change', function () {
      render(root);
    });
  }

  function boot() {
    document.querySelectorAll('.product__item-js').forEach(init);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  document.addEventListener('shopify:section:load', function (event) {
    if (event.target) event.target.querySelectorAll('.product__item-js').forEach(init);
  });
})();
